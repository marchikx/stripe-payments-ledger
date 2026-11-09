export function createMemoryLedgerStore() {
    const events = new Map();
    return {
        appendEvent(id, type, payload) {
            if (events.has(id))
                return null;
            const event = { id, type, payload, appendedAt: Date.now() };
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
export function createMemoryWorkStore() {
    const items = new Map();
    let seq = 0;
    return {
        enqueue(eventId) {
            const workId = `work_${++seq}`;
            const item = {
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
            if (item)
                item.status = "done";
        },
        fail(workId) {
            const item = items.get(workId);
            if (item)
                item.status = "failed";
        },
        get(workId) {
            const item = items.get(workId);
            return item ? { ...item } : undefined;
        },
    };
}
