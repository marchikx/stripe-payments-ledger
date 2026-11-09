import type { LedgerEvent } from "./eventLedger.js";
export type WorkItem = {
    workId: string;
    eventId: string;
    createdAt: number;
    status: "queued" | "done" | "failed";
};
export interface LedgerStore {
    appendEvent(id: string, type: string, payload: Record<string, unknown>): LedgerEvent | null;
    getEvent(id: string): LedgerEvent | undefined;
    listEvents(): LedgerEvent[];
}
export interface WorkStore {
    enqueue(eventId: string): WorkItem;
    complete(workId: string): void;
    fail(workId: string): void;
    get(workId: string): WorkItem | undefined;
}
export declare function createMemoryLedgerStore(): LedgerStore;
export declare function createMemoryWorkStore(): WorkStore;
