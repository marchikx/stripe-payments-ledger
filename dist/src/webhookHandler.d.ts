import type { EventLedger } from "./eventLedger.js";
import type { PaymentState, PaymentStateMachine } from "./paymentStateMachine.js";
export declare class WebhookSignatureError extends Error {
    constructor(message: string);
}
/** Thrown when an event arrives before the state it depends on (e.g. refund before success). Retry later. */
export declare class OutOfOrderEventError extends Error {
    readonly paymentId: string;
    readonly from: PaymentState;
    readonly stripeType: string;
    constructor(paymentId: string, from: PaymentState, stripeType: string);
}
/** Stripe's own default: signatures older than 5 minutes are treated as replays. */
export declare const DEFAULT_TOLERANCE_SEC = 300;
export type VerifyOptions = {
    toleranceSec?: number;
    nowSec?: number;
};
export type WebhookAck = {
    status: 202;
    workId: string;
    duplicate: boolean;
};
export type WorkOutcome = "applied" | "noop" | "ignored_stale";
export type WorkResult = {
    paymentId: string;
    state: PaymentState;
    outcome: WorkOutcome;
};
export type WebhookHandler = {
    handleStripeWebhook: (rawBody: string, signature: string, secret: string, options?: VerifyOptions) => WebhookAck;
    processWork: (workId: string) => WorkResult;
};
export declare function verifyStripeSignature(rawBody: string, signature: string, secret: string, options?: VerifyOptions): void;
export declare function signStripePayload(rawBody: string, secret: string, timestampSec?: number): string;
export declare function createWebhookHandler(ledger: EventLedger, stateMachine: PaymentStateMachine): WebhookHandler;
