export type LedgerEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  appendedAt: number;
};

export type EventLedger = {
  appendEvent: (
    id: string,
    type: string,
    payload: Record<string, unknown>
  ) => LedgerEvent | null;
  getEvent: (id: string) => LedgerEvent | undefined;
  listEvents: () => LedgerEvent[];
};

export function createEventLedger(): EventLedger {
  const events = new Map<string, LedgerEvent>();

  return {
    appendEvent(id, type, payload) {
      if (events.has(id)) {
        return null;
      }
      const event: LedgerEvent = {
        id,
        type,
        payload,
        appendedAt: Date.now(),
      };
      events.set(id, event);
      return event;
    },

    getEvent(id) {
      return events.get(id);
    },

    listEvents() {
      return [...events.values()].sort((a, b) => a.appendedAt - b.appendedAt);
    },
  };
}
