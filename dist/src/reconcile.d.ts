import type { EventLedger } from "./eventLedger.js";
export type ReconcileResult = {
    matched: string[];
    missing: string[];
    extra: string[];
};
export declare function reconcile(expectedPaidIds: string[], ledger: EventLedger): ReconcileResult;
