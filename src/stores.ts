import type { LedgerEvent } from "./eventLedger.js";

export type WorkItem = {
  workId: string;
  eventId: string;
  createdAt: number;
  status: "queued" | "done" | "failed";
};

export interface LedgerStore {
  appendEvent(
    id: string,
    type: string,
    payload: Record<string, unknown>,
  ): LedgerEvent | null;
  getEvent(id: string): LedgerEvent | undefined;
  listEvents(): LedgerEvent[];
}

export interface WorkStore {
  enqueue(eventId: string): WorkItem;
  complete(workId: string): void;
  fail(workId: string): void;
  get(workId: string): WorkItem | undefined;
}

export function createMemoryLedgerStore(): LedgerStore {
  const events = new Map<string, LedgerEvent>();
  return {
    appendEvent(id, type, payload) {
      if (events.has(id)) return null;
      const event: LedgerEvent = { id, type, payload, appendedAt: Date.now() };
      events.set(id, event);
      return event;
    },
    getEvent(id) {
      return events.get(id);
    },
    listEvents() {
      return [...events.values()];
    },
  };
}

export function createMemoryWorkStore(): WorkStore {
  const items = new Map<string, WorkItem>();
  let seq = 0;
  return {
    enqueue(eventId) {
      const workId = `work_${++seq}`;
      const item: WorkItem = {
        workId,
        eventId,
        createdAt: Date.now(),
        status: "queued",
      };
      items.set(workId, item);
      return { ...item };
    },
    complete(workId) {
      const item = items.get(workId);
      if (item) item.status = "done";
    },
    fail(workId) {
      const item = items.get(workId);
      if (item) item.status = "failed";
    },
    get(workId) {
      const item = items.get(workId);
      return item ? { ...item } : undefined;
    },
  };
}
