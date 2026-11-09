import { describe, expect, it } from "vitest";
import { createMemoryLedgerStore, createMemoryWorkStore } from "../src/stores.js";
describe("memory stores", () => {
    it("ledger store is idempotent on event id", () => {
        const ledger = createMemoryLedgerStore();
        expect(ledger.appendEvent("evt_1", "payment_intent.succeeded", { a: 1 })).toBeTruthy();
        expect(ledger.appendEvent("evt_1", "payment_intent.succeeded", { a: 2 })).toBeNull();
        expect(ledger.listEvents()).toHaveLength(1);
    });
    it("work store tracks queue lifecycle", () => {
        const work = createMemoryWorkStore();
        const item = work.enqueue("evt_1");
        expect(item.status).toBe("queued");
        work.complete(item.workId);
        expect(work.get(item.workId)?.status).toBe("done");
    });
});
