import type { EventLedger } from "./eventLedger.js";

export type ReconcileResult = {
  matched: string[];
  missing: string[];
  extra: string[];
};

const PAID_EVENT_TYPES = new Set([
  "payment_intent.succeeded",
  "payment.paid",
]);

export function reconcile(
  expectedPaidIds: string[],
  ledger: EventLedger
): ReconcileResult {
  const expected = new Set(expectedPaidIds);
  const paidFromLedger = new Set<string>();

  for (const event of ledger.listEvents()) {
    if (!PAID_EVENT_TYPES.has(event.type)) {
      continue;
    }
    const paymentId = event.payload.paymentId;
    if (typeof paymentId === "string") {
      paidFromLedger.add(paymentId);
    }
  }

  const matched: string[] = [];
  const missing: string[] = [];
  const extra: string[] = [];

  for (const id of expected) {
    if (paidFromLedger.has(id)) {
      matched.push(id);
    } else {
      missing.push(id);
    }
  }

  for (const id of paidFromLedger) {
    if (!expected.has(id)) {
      extra.push(id);
    }
  }

  matched.sort();
  missing.sort();
  extra.sort();

  return { matched, missing, extra };
}
