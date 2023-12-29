class EventEmitter {
    private listeners: Record<string, Function[]> = {};

    // Subscribe to an event
    on(event: string, listener: Function) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(listener);
    }

    // Unsubscribe from an event
    off(event: string, listener: Function) {
        if (!this.listeners[event]) return;
        const index = this.listeners[event].indexOf(listener);
        if (index > -1) {
            this.listeners[event].splice(index, 1);
        }
    }

    // Emit an event
    emit(event: string, ...args: any[]) {
        if (!this.listeners[event]) return;
        for (const listener of this.listeners[event]) {
            listener(...args);
        }
    }
}

export const emitter = new EventEmitter();
