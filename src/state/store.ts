// Minimal typed observable store. Writers call set(); readers either read
// get() on demand (render loop) or subscribe to the keys they care about.

export type Listener<T> = (state: Readonly<T>, changed: ReadonlySet<keyof T>) => void;

export class Store<T extends object> {
    private state: T;
    private listeners: { keys: ReadonlySet<keyof T> | null; fn: Listener<T> }[] = [];
    private pending = new Set<keyof T>();
    private batchDepth = 0;

    constructor(initial: T) {
        this.state = { ...initial };
    }

    /** Bumped on every change; lets render code memoise derived values. */
    revision = 0;

    get(): Readonly<T> {
        return this.state;
    }

    set(patch: Partial<T>): void {
        for (const key of Object.keys(patch) as (keyof T)[]) {
            const next = patch[key] as T[keyof T];
            if (Object.is(this.state[key], next)) continue;
            this.state[key] = next;
            this.pending.add(key);
            this.revision++;
        }
        if (this.batchDepth === 0) this.flush();
    }

    /** Groups several set() calls into one notification. */
    batch(fn: () => void): void {
        this.batchDepth++;
        try {
            fn();
        } finally {
            this.batchDepth--;
            if (this.batchDepth === 0) this.flush();
        }
    }

    /** Subscribes to changes of `keys`, or of any key when `keys` is null. */
    subscribe(keys: readonly (keyof T)[] | null, fn: Listener<T>): () => void {
        const entry = { keys: keys ? new Set(keys) : null, fn };
        this.listeners.push(entry);
        return () => {
            this.listeners = this.listeners.filter(l => l !== entry);
        };
    }

    private flush(): void {
        if (this.pending.size === 0) return;
        const changed = this.pending;
        this.pending = new Set();
        for (const l of this.listeners) {
            if (l.keys && ![...changed].some(k => l.keys!.has(k))) continue;
            l.fn(this.state, changed);
        }
    }
}
