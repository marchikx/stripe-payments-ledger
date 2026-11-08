import { describe, expect, it } from "vitest";
import {
  createEventLedger,
  createPaymentStateMachine,
  createWebhookHandler,
  OutOfOrderEventError,
  signStripePayload,
  verifyStripeSignature,
  WebhookSignatureError,
} from "../src/index.js";

const secret = ["whsec", "test", "secret"].join("_");
const rotated = ["whsec", "test", "rotated"].join("_");

function event(id: string, type: string, object: Record<string, string>): string {
  return JSON.stringify({ id, type, data: { object } });
}

function setup() {
  const ledger = createEventLedger();
  const sm = createPaymentStateMachine();
  const handler = createWebhookHandler(ledger, sm);
  const deliver = (raw: string) => handler.handleStripeWebhook(raw, signStripePayload(raw, secret), secret);
  return { ledger, sm, handler, deliver };
}

describe("Stripe redelivery", () => {
  it("acks a redelivered event with the original work id and never re-applies it", () => {
    const { ledger, sm, handler, deliver } = setup();
    const raw = event("evt_1", "payment_intent.succeeded", { id: "pi_1" });

    const first = deliver(raw);
    handler.processWork(first.workId);
    const again = deliver(raw);

    expect(again).toEqual({ status: 202, workId: first.workId, duplicate: true });
    expect(handler.processWork(again.workId)).toEqual({ paymentId: "pi_1", state: "paid", outcome: "noop" });
    expect(ledger.listEvents()).toHaveLength(1);
    expect(sm.getState("pi_1")).toBe("paid");
  });

  it("treats a second distinct success event for a paid intent as a no-op, not an error", () => {
    const { handler, deliver } = setup();
    handler.processWork(deliver(event("evt_a", "payment_intent.succeeded", { id: "pi_2" })).workId);
    const second = deliver(event("evt_b", "payment_intent.succeeded", { id: "pi_2" }));

    expect(handler.processWork(second.workId).outcome).toBe("noop");
  });
});

describe("out-of-order events", () => {
  it("defers a refund that arrives before the success, then applies it after", () => {
    const { handler, deliver, sm } = setup();
    const refund = deliver(event("evt_r", "charge.refunded", { id: "ch_1", payment_intent: "pi_3" }));

    expect(() => handler.processWork(refund.workId)).toThrow(OutOfOrderEventError);

    handler.processWork(deliver(event("evt_s", "payment_intent.succeeded", { id: "pi_3" })).workId);
    expect(handler.processWork(refund.workId)).toMatchObject({ state: "refunded", outcome: "applied" });
    expect(sm.getState("pi_3")).toBe("refunded");
  });

  it("ignores a stale failure that lands after the payment already succeeded", () => {
    const { handler, deliver, sm } = setup();
    handler.processWork(deliver(event("evt_ok", "payment_intent.succeeded", { id: "pi_4" })).workId);
    const stale = deliver(event("evt_fail", "payment_intent.payment_failed", { id: "pi_4" }));

    expect(handler.processWork(stale.workId)).toMatchObject({ state: "paid", outcome: "ignored_stale" });
    expect(sm.getState("pi_4")).toBe("paid");
  });

  it("lets a failed attempt be followed by a successful retry", () => {
    const { handler, deliver } = setup();
    handler.processWork(deliver(event("evt_f", "payment_intent.payment_failed", { id: "pi_5" })).workId);
    const ok = deliver(event("evt_ok2", "payment_intent.succeeded", { id: "pi_5" }));

    expect(handler.processWork(ok.workId)).toMatchObject({ state: "paid", outcome: "applied" });
  });
});

describe("signature verification", () => {
  const raw = event("evt_sig", "payment_intent.succeeded", { id: "pi_sig" });

  it("rejects a valid signature replayed outside the 5-minute tolerance", () => {
    const signedAt = 1_700_000_000;
    const header = signStripePayload(raw, secret, signedAt);

    expect(() => verifyStripeSignature(raw, header, secret, { nowSec: signedAt + 299 })).not.toThrow();
    expect(() => verifyStripeSignature(raw, header, secret, { nowSec: signedAt + 301 })).toThrow(
      /tolerance/
    );
  });

  it("accepts any v1 signature during secret rotation", () => {
    const t = 1_700_000_000;
    const oldSig = signStripePayload(raw, rotated, t).split("v1=")[1];
    const newSig = signStripePayload(raw, secret, t).split("v1=")[1];
    const header = `t=${t},v1=${oldSig},v1=${newSig}`;

    expect(() => verifyStripeSignature(raw, header, secret, { nowSec: t })).not.toThrow();
    expect(() => verifyStripeSignature(raw, `t=${t},v1=${oldSig}`, secret, { nowSec: t })).toThrow(
      WebhookSignatureError
    );
  });

  it("rejects a tampered body even with a fresh timestamp", () => {
    const header = signStripePayload(raw, secret);
    expect(() => verifyStripeSignature(raw.replace("pi_sig", "pi_evil"), header, secret)).toThrow(
      WebhookSignatureError
    );
  });
});
