const transitions = {
    created: {
        "payment.requires_action": "requires_action",
        "payment.paid": "paid",
        "payment.failed": "failed",
    },
    requires_action: {
        "payment.paid": "paid",
        "payment.failed": "failed",
    },
    paid: {
        "payment.refunded": "refunded",
        "payment.disputed": "disputed",
    },
    // A PaymentIntent returns to requires_payment_method after a failed attempt, so a later
    // retry can still succeed or require 3DS.
    failed: {
        "payment.requires_action": "requires_action",
        "payment.paid": "paid",
    },
    refunded: {},
    disputed: {},
};
export class IllegalPaymentTransitionError extends Error {
    paymentId;
    from;
    event;
    constructor(paymentId, from, event) {
        super(`Illegal transition for payment ${paymentId}: ${from} + ${event}`);
        this.paymentId = paymentId;
        this.from = from;
        this.event = event;
        this.name = "IllegalPaymentTransitionError";
    }
}
export const TARGET_STATE = {
    "payment.requires_action": "requires_action",
    "payment.paid": "paid",
    "payment.failed": "failed",
    "payment.refunded": "refunded",
    "payment.disputed": "disputed",
};
export function canTransition(from, event) {
    return transitions[from][event] !== undefined;
}
export function createPaymentStateMachine() {
    const states = new Map();
    return {
        transition(paymentId, event) {
            const current = states.get(paymentId) ?? "created";
            const next = transitions[current][event];
            if (next === undefined) {
                throw new IllegalPaymentTransitionError(paymentId, current, event);
            }
            states.set(paymentId, next);
            return next;
        },
        getState(paymentId) {
            return states.get(paymentId);
        },
        listPayments() {
            return new Map(states);
        },
    };
}
export function mapStripeEventToTransition(stripeType) {
    switch (stripeType) {
        case "payment_intent.requires_action":
            return "payment.requires_action";
        case "payment_intent.succeeded":
            return "payment.paid";
        case "payment_intent.payment_failed":
            return "payment.failed";
        case "charge.refunded":
            return "payment.refunded";
        case "charge.dispute.created":
            return "payment.disputed";
        default:
            return null;
    }
}
