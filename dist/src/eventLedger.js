export function createEventLedger() {
    const events = new Map();
    return {
        appendEvent(id, type, payload) {
            if (events.has(id)) {
                return null;
            }
            const event = {
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
