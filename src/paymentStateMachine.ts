export type PaymentState =
  | "created"
  | "requires_action"
  | "paid"
  | "failed"
  | "refunded"
  | "disputed";

export type PaymentTransitionEvent =
  | "payment.requires_action"
  | "payment.paid"
  | "payment.failed"
  | "payment.refunded"
  | "payment.disputed";

const transitions: Record<
  PaymentState,
  Partial<Record<PaymentTransitionEvent, PaymentState>>
> = {
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
  failed: {},
  refunded: {},
  disputed: {},
};

export class IllegalPaymentTransitionError extends Error {
  constructor(
    public readonly paymentId: string,
    public readonly from: PaymentState,
    public readonly event: string
  ) {
    super(
      `Illegal transition for payment ${paymentId}: ${from} + ${event}`
    );
    this.name = "IllegalPaymentTransitionError";
  }
}

export type PaymentStateMachine = {
  transition: (paymentId: string, event: PaymentTransitionEvent) => PaymentState;
  getState: (paymentId: string) => PaymentState | undefined;
  listPayments: () => Map<string, PaymentState>;
};

export function createPaymentStateMachine(): PaymentStateMachine {
  const states = new Map<string, PaymentState>();

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

export function mapStripeEventToTransition(
  stripeType: string
): PaymentTransitionEvent | null {
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
