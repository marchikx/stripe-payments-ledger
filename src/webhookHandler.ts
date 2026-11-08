import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import type { EventLedger } from "./eventLedger.js";
import type { PaymentState, PaymentStateMachine } from "./paymentStateMachine.js";
import {
  canTransition,
  mapStripeEventToTransition,
  TARGET_STATE,
} from "./paymentStateMachine.js";

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

/** Thrown when an event arrives before the state it depends on (e.g. refund before success). Retry later. */
export class OutOfOrderEventError extends Error {
  constructor(
    public readonly paymentId: string,
    public readonly from: PaymentState,
    public readonly stripeType: string
  ) {
    super(`Event ${stripeType} for ${paymentId} arrived while payment is ${from}; retry later`);
    this.name = "OutOfOrderEventError";
  }
}

/** Stripe's own default: signatures older than 5 minutes are treated as replays. */
export const DEFAULT_TOLERANCE_SEC = 300;

export type VerifyOptions = {
  toleranceSec?: number;
  nowSec?: number;
};

type WorkItem = {
  eventId: string;
  stripeType: string;
  paymentId: string;
  processed: boolean;
};

export type WebhookAck = { status: 202; workId: string; duplicate: boolean };

export type WorkOutcome = "applied" | "noop" | "ignored_stale";

export type WorkResult = { paymentId: string; state: PaymentState; outcome: WorkOutcome };

export type WebhookHandler = {
  handleStripeWebhook: (
    rawBody: string,
    signature: string,
    secret: string,
    options?: VerifyOptions
  ) => WebhookAck;
  processWork: (workId: string) => WorkResult;
};

function safeEqualHex(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

export function verifyStripeSignature(
  rawBody: string,
  signature: string,
  secret: string,
  options: VerifyOptions = {}
): void {
  let timestamp: string | undefined;
  const candidates: string[] = [];
  for (const segment of signature.split(",")) {
    const eq = segment.indexOf("=");
    if (eq === -1) continue;
    const key = segment.slice(0, eq).trim();
    const value = segment.slice(eq + 1).trim();
    if (key === "t") timestamp = value;
    if (key === "v1") candidates.push(value);
  }

  if (!timestamp || candidates.length === 0 || !/^\d+$/.test(timestamp)) {
    throw new WebhookSignatureError("Missing timestamp or signature");
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  // During secret rotation Stripe sends one v1 per active secret; any match is valid.
  if (!candidates.some((v1) => safeEqualHex(v1, expected))) {
    throw new WebhookSignatureError("Signature verification failed");
  }

  const toleranceSec = options.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - Number(timestamp)) > toleranceSec) {
    throw new WebhookSignatureError("Timestamp outside tolerance (possible replay)");
  }
}

export function signStripePayload(
  rawBody: string,
  secret: string,
  timestampSec: number = Math.floor(Date.now() / 1000)
): string {
  const v1 = createHmac("sha256", secret)
    .update(`${timestampSec}.${rawBody}`, "utf8")
    .digest("hex");
  return `t=${timestampSec},v1=${v1}`;
}

type StripeEventBody = {
  id: string;
  type: string;
  data?: { object?: { id?: string; payment_intent?: string } };
};

function extractPaymentId(body: StripeEventBody): string {
  const obj = body.data?.object;
  if (!obj) {
    throw new Error("Event payload missing data.object");
  }
  if (typeof obj.payment_intent === "string") {
    return obj.payment_intent;
  }
  if (typeof obj.id === "string") {
    return obj.id;
  }
  throw new Error("Unable to resolve payment id from event");
}

export function createWebhookHandler(
  ledger: EventLedger,
  stateMachine: PaymentStateMachine
): WebhookHandler {
  const queue = new Map<string, WorkItem>();
  const workIdByEvent = new Map<string, string>();

  return {
    handleStripeWebhook(rawBody, signature, secret, options) {
      verifyStripeSignature(rawBody, signature, secret, options);

      const body = JSON.parse(rawBody) as StripeEventBody;
      const existing = workIdByEvent.get(body.id);
      if (existing) {
        return { status: 202 as const, workId: existing, duplicate: true };
      }

      const paymentId = extractPaymentId(body);
      const appended = ledger.appendEvent(body.id, body.type, {
        paymentId,
        stripeType: body.type,
        raw: body.data?.object ?? {},
      });
      if (!appended) {
        throw new Error(`Ledger already holds ${body.id} but no work item exists`);
      }

      const workId = randomUUID();
      queue.set(workId, { eventId: body.id, stripeType: body.type, paymentId, processed: false });
      workIdByEvent.set(body.id, workId);
      return { status: 202 as const, workId, duplicate: false };
    },

    processWork(workId) {
      const work = queue.get(workId);
      if (!work) {
        throw new Error(`Unknown work id: ${workId}`);
      }
      const current = stateMachine.getState(work.paymentId) ?? "created";
      if (work.processed) {
        return { paymentId: work.paymentId, state: current, outcome: "noop" };
      }

      const event = mapStripeEventToTransition(work.stripeType);
      if (!event) {
        work.processed = true;
        return { paymentId: work.paymentId, state: current, outcome: "noop" };
      }

      if (canTransition(current, event)) {
        const state = stateMachine.transition(work.paymentId, event);
        work.processed = true;
        return { paymentId: work.paymentId, state, outcome: "applied" };
      }

      if (TARGET_STATE[event] === current) {
        work.processed = true;
        return { paymentId: work.paymentId, state: current, outcome: "noop" };
      }

      const needsPriorSuccess = event === "payment.refunded" || event === "payment.disputed";
      if (needsPriorSuccess && (current === "created" || current === "requires_action")) {
        throw new OutOfOrderEventError(work.paymentId, current, work.stripeType);
      }

      work.processed = true;
      return { paymentId: work.paymentId, state: current, outcome: "ignored_stale" };
    },
  };
}
