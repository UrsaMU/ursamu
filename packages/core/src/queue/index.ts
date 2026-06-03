const kv = await Deno.openKv();

export interface IQueueEntry {
  pid: number;
  command: string;
  executor: string;
  enactor: string;
  data?: Record<string, unknown>;
  scheduledAt: number;
}

export interface ISemEntry {
  pid: number;
  semaphoreId: string;
  command: string;
  executor: string;
  enactor: string;
  data?: Record<string, unknown>;
  queuedAt: number;
}

type ExecutorFn = (entry: IQueueEntry) => Promise<void>;
let _executor: ExecutorFn = async (_entry) => {};

export function registerExecutor(fn: ExecutorFn): void {
  _executor = fn;
}

let _pidSeq = 0;

async function nextPid(): Promise<number> {
  const key = ["queue_pid_counter"] as const;
  for (let i = 0; i < 10; i++) {
    const cur = await kv.get<number>(key);
    const next = (cur.value ?? _pidSeq) + 1;
    const r = await kv.atomic().check(cur).set(key, next).commit();
    if (r.ok) { _pidSeq = next; return next; }
  }
  return ++_pidSeq;
}

async function atomicCounter(semId: string, delta: number): Promise<number> {
  const key = ["semaphore_counter", semId] as const;
  for (let i = 0; i < 10; i++) {
    const cur = await kv.get<number>(key);
    const next = (cur.value ?? 0) + delta;
    const r = await kv.atomic().check(cur).set(key, next).commit();
    if (r.ok) return next;
  }
  const cur = (await kv.get<number>(key)).value ?? 0;
  const next = cur + delta;
  await kv.set(key, next);
  return next;
}

export const queue = {
  enqueue: async (
    entry: Omit<IQueueEntry, "pid" | "scheduledAt">,
    delay = 0,
  ): Promise<number> => {
    const pid = await nextPid();
    const scheduledAt = Date.now() + delay;
    await kv.set(["queue", pid], { ...entry, pid, scheduledAt } satisfies IQueueEntry);
    await kv.enqueue({ pid }, { delay });
    return pid;
  },

  enqueueSemaphore: async (
    entry: Omit<ISemEntry, "pid" | "queuedAt" | "semaphoreId">,
    semaphoreId: string,
  ): Promise<number> => {
    const pid = await nextPid();
    const queuedAt = Date.now();
    const full: ISemEntry = { ...entry, pid, semaphoreId, queuedAt };
    const counterKey = ["semaphore_counter", semaphoreId] as const;
    for (let i = 0; i < 10; i++) {
      const cur = await kv.get<number>(counterKey);
      const count = cur.value ?? 0;
      if (count <= 0) break;
      const r = await kv.atomic().check(cur).set(counterKey, count - 1).commit();
      if (r.ok) {
        await kv.set(["queue", pid], { ...full, scheduledAt: queuedAt } as unknown as IQueueEntry);
        await kv.enqueue({ pid }, { delay: 0 });
        return pid;
      }
    }
    await kv.set(["semaphore_queue", semaphoreId, pid], full);
    return pid;
  },

  cancel: async (pid: number): Promise<boolean> => {
    const res = await kv.get(["queue", pid]);
    if (!res.value) return false;
    await kv.delete(["queue", pid]);
    return true;
  },

  cancelAll: async (executor: string): Promise<number> => {
    let n = 0;
    for await (const e of kv.list<IQueueEntry>({ prefix: ["queue"] })) {
      if (e.value?.executor === executor) { await kv.delete(e.key); n++; }
    }
    return n;
  },

  list: async (executorId?: string): Promise<IQueueEntry[]> => {
    const out: IQueueEntry[] = [];
    for await (const e of kv.list<IQueueEntry>({ prefix: ["queue"] })) {
      if (!e.value) continue;
      if (executorId && e.value.executor !== executorId) continue;
      out.push(e.value);
    }
    return out.sort((a, b) => a.scheduledAt - b.scheduledAt);
  },

  listSemaphore: async (executorId?: string): Promise<ISemEntry[]> => {
    const out: ISemEntry[] = [];
    for await (const e of kv.list<ISemEntry>({ prefix: ["semaphore_queue"] })) {
      if (!e.value) continue;
      if (executorId && e.value.executor !== executorId) continue;
      out.push(e.value);
    }
    return out.sort((a, b) => a.queuedAt - b.queuedAt);
  },

  notifySemaphore: async (semaphoreId: string, count = 1): Promise<number> => {
    const prefix = ["semaphore_queue", semaphoreId] as const;
    const toRelease: { key: Deno.KvKey; entry: ISemEntry }[] = [];
    for await (const item of kv.list<ISemEntry>({ prefix })) {
      if (!item.value) continue;
      toRelease.push({ key: item.key, entry: item.value });
      if (toRelease.length >= count) break;
    }
    if (toRelease.length === 0) {
      await atomicCounter(semaphoreId, count);
      return 0;
    }
    for (const { key, entry } of toRelease) {
      const pid = await nextPid();
      await kv.delete(key);
      await kv.set(["queue", pid], { ...entry, pid, scheduledAt: Date.now() } as unknown as IQueueEntry);
      await kv.enqueue({ pid }, { delay: 0 });
    }
    const remainder = count - toRelease.length;
    if (remainder > 0) await atomicCounter(semaphoreId, remainder);
    return toRelease.length;
  },

  drainSemaphore: async (semaphoreId: string): Promise<number> => {
    let n = 0;
    for await (const e of kv.list({ prefix: ["semaphore_queue", semaphoreId] })) {
      await kv.delete(e.key);
      n++;
    }
    await kv.delete(["semaphore_counter", semaphoreId]);
    return n;
  },

  countSemaphore: async (semaphoreId: string): Promise<number> => {
    let n = 0;
    for await (const _ of kv.list({ prefix: ["semaphore_queue", semaphoreId] })) n++;
    return n;
  },

  init: () => {
    kv.listenQueue(async (msg: unknown) => {
      const { pid } = msg as { pid: number };
      const res = await kv.get<IQueueEntry>(["queue", pid]);
      if (!res.value) return;
      const entry = res.value;
      try {
        await kv.delete(["queue", pid]);
        await _executor(entry);
      } catch (err: unknown) {
        console.error(`[Queue] PID ${pid} failed:`, err);
      }
    });
    console.log("[Queue] Service initialized.");
  },
};
