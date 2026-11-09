export type LedgerEvent = {
    id: string;
    type: string;
    payload: Record<string, unknown>;
    appendedAt: number;
};
export type EventLedger = {
    appendEvent: (id: string, type: string, payload: Record<string, unknown>) => LedgerEvent | null;
    getEvent: (id: string) => LedgerEvent | undefined;
    listEvents: () => LedgerEvent[];
};
export declare function createEventLedger(): EventLedger;
