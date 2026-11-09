export type PaymentState = "created" | "requires_action" | "paid" | "failed" | "refunded" | "disputed";
export type PaymentTransitionEvent = "payment.requires_action" | "payment.paid" | "payment.failed" | "payment.refunded" | "payment.disputed";
export declare class IllegalPaymentTransitionError extends Error {
    readonly paymentId: string;
    readonly from: PaymentState;
    readonly event: string;
    constructor(paymentId: string, from: PaymentState, event: string);
}
export declare const TARGET_STATE: Record<PaymentTransitionEvent, PaymentState>;
export declare function canTransition(from: PaymentState, event: PaymentTransitionEvent): boolean;
export type PaymentStateMachine = {
    transition: (paymentId: string, event: PaymentTransitionEvent) => PaymentState;
    getState: (paymentId: string) => PaymentState | undefined;
    listPayments: () => Map<string, PaymentState>;
};
export declare function createPaymentStateMachine(): PaymentStateMachine;
export declare function mapStripeEventToTransition(stripeType: string): PaymentTransitionEvent | null;
