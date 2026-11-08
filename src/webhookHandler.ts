import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import type { EventLedger } from "./eventLedger.js";
import type { PaymentStateMachine } from "./paymentStateMachine.js";
import { mapStripeEventToTransition } from "./paymentStateMachine.js";

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

type WorkItem = {
  eventId: string;
  stripeType: string;
  paymentId: string;
  processed: boolean;
};

export type WebhookHandler = {
  handleStripeWebhook: (
    rawBody: string,
    signature: string,
    secret: string
  ) => { status: 202; workId: string };
  processWork: (workId: string) => { paymentId: string; state: string };
};

export function verifyStripeSignature(
  rawBody: string,
  signature: string,
  secret: string
): void {
  const parts: Record<string, string> = {};
  for (const segment of signature.split(",")) {
    const eq = segment.indexOf("=");
    if (eq === -1) continue;
    parts[segment.slice(0, eq).trim()] = segment.slice(eq + 1).trim();
  }

  const timestamp = parts["t"];
  const v1 = parts["v1"];
  if (!timestamp || !v1) {
    throw new WebhookSignatureError("Missing timestamp or signature");
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  const sigBuf = Buffer.from(v1, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new WebhookSignatureError("Signature verification failed");
  }
}

export function signStripePayload(rawBody: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${rawBody}`;
  const v1 = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${v1}`;
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
  if (typeof obj.id === "string" && body.type.startsWith("payment_intent.")) {
    return obj.id;
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

  return {
    handleStripeWebhook(rawBody, signature, secret) {
      verifyStripeSignature(rawBody, signature, secret);

      const body = JSON.parse(rawBody) as StripeEventBody;
      const paymentId = extractPaymentId(body);
      const payload: Record<string, unknown> = {
        paymentId,
        stripeType: body.type,
        raw: body.data?.object ?? {},
      };

      ledger.appendEvent(body.id, body.type, payload);

      const workId = randomUUID();
      queue.set(workId, {
        eventId: body.id,
        stripeType: body.type,
        paymentId,
        processed: false,
      });

      return { status: 202 as const, workId };
    },

    processWork(workId) {
      const work = queue.get(workId);
      if (!work) {
        throw new Error(`Unknown work id: ${workId}`);
      }
      if (work.processed) {
        const state = stateMachine.getState(work.paymentId) ?? "created";
        return { paymentId: work.paymentId, state };
      }

      const transitionEvent = mapStripeEventToTransition(work.stripeType);
      if (transitionEvent) {
        const state = stateMachine.transition(work.paymentId, transitionEvent);
        work.processed = true;
        return { paymentId: work.paymentId, state };
      }

      work.processed = true;
      const state = stateMachine.getState(work.paymentId) ?? "created";
      return { paymentId: work.paymentId, state };
    },
  };
}
