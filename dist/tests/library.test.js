import { describe, it, expect } from "vitest";
import { createEventLedger, createPaymentStateMachine, createWebhookHandler, IllegalPaymentTransitionError, reconcile, signStripePayload, WebhookSignatureError, } from "../src/index.js";
describe("event ledger", () => {
    it("ignores duplicate event id", () => {
        const ledger = createEventLedger();
        const first = ledger.appendEvent("evt_1", "payment_intent.succeeded", {
            paymentId: "pi_1",
        });
        const second = ledger.appendEvent("evt_1", "payment_intent.succeeded", {
            paymentId: "pi_1",
        });
        expect(first).not.toBeNull();
        expect(second).toBeNull();
        expect(ledger.listEvents()).toHaveLength(1);
        expect(ledger.getEvent("evt_1")?.type).toBe("payment_intent.succeeded");
    });
});
describe("payment state machine", () => {
    it("throws on illegal transition", () => {
        const sm = createPaymentStateMachine();
        sm.transition("pi_x", "payment.paid");
        expect(() => sm.transition("pi_x", "payment.requires_action")).toThrow(IllegalPaymentTransitionError);
    });
});
describe("webhook handler", () => {
    const secret = ["whsec", "test", "secret"].join("_");
    function buildSucceededBody(paymentId, eventId) {
        return JSON.stringify({
            id: eventId,
            type: "payment_intent.succeeded",
            data: { object: { id: paymentId } },
        });
    }
    it("returns 202 then processWork marks paid", () => {
        const ledger = createEventLedger();
        const sm = createPaymentStateMachine();
        const handler = createWebhookHandler(ledger, sm);
        const paymentId = "pi_test_202";
        const rawBody = buildSucceededBody(paymentId, "evt_webhook_1");
        const signature = signStripePayload(rawBody, secret);
        const ack = handler.handleStripeWebhook(rawBody, signature, secret);
        expect(ack.status).toBe(202);
        expect(ack.workId).toBeTruthy();
        expect(sm.getState(paymentId)).toBeUndefined();
        const result = handler.processWork(ack.workId);
        expect(result.paymentId).toBe(paymentId);
        expect(result.state).toBe("paid");
        expect(sm.getState(paymentId)).toBe("paid");
    });
    it("rejects bad signature", () => {
        const ledger = createEventLedger();
        const sm = createPaymentStateMachine();
        const handler = createWebhookHandler(ledger, sm);
        const rawBody = buildSucceededBody("pi_bad_sig", "evt_bad");
        expect(() => handler.handleStripeWebhook(rawBody, "t=0,v1=deadbeef", secret)).toThrow(WebhookSignatureError);
    });
});
describe("reconcile", () => {
    it("finds missing paid ids", () => {
        const ledger = createEventLedger();
        ledger.appendEvent("evt_a", "payment_intent.succeeded", {
            paymentId: "pi_found",
        });
        const result = reconcile(["pi_found", "pi_missing"], ledger);
        expect(result.matched).toEqual(["pi_found"]);
        expect(result.missing).toEqual(["pi_missing"]);
        expect(result.extra).toEqual([]);
    });
});
