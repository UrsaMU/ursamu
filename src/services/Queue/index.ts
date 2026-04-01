import { force } from "../commands/index.ts";
import { getNextId } from "../../utils/getNextId.ts";

const kv = await Deno.openKv();

export interface QueueEntry {
  pid: number;
  command: string;
  executor: string;  // dbref of the object running the command
  enactor: string;   // dbref of the player who caused the command
  data?: Record<string, unknown>;
  /** Absolute timestamp (ms) when this entry is scheduled to execute. */
  scheduledAt: number;
}

export interface SemEntry {
  pid: number;
  semaphoreId: string; // dbref of the object being waited on
  command: string;
  executor: string;
  enactor: string;
  data?: Record<string, unknown>;
  queuedAt: number;
}

// ── helpers ───────────────────────────────────────────────────────────────

async function nextPid(): Promise<number> {
  return parseInt(await getNextId("queueId"), 10);
}

/** Atomically increment/decrement the pre-notify counter for a semaphore. */
async function atomicCounter(semId: string, delta: number): Promise<number> {
  const key = ["semaphore_counter", semId] as const;
  for (let i = 0; i < 10; i++) {
    const cur = await kv.get<number>(key);
    const next = (cur.value ?? 0) + delta;
    const r = await kv.atomic().check(cur).set(key, next).commit();
    if (r.ok) return next;
  }
  // Fallback: non-atomic (should not happen under normal load)
  const cur = (await kv.get<number>(key)).value ?? 0;
  const next = cur + delta;
  await kv.set(key, next);
  return next;
}

// ── public API ────────────────────────────────────────────────────────────

export const queue = {
  /**
   * Enqueue a time-delayed command.
   * Returns the assigned PID.
   */
  enqueue: async (
    entry: Omit<QueueEntry, "pid" | "scheduledAt">,
    delay = 0,
  ): Promise<number> => {
    const pid = await nextPid();
    const scheduledAt = Date.now() + delay;
    await kv.set(["queue", pid], { ...entry, pid, scheduledAt } satisfies QueueEntry);
    await kv.enqueue({ pid }, { delay });
    return pid;
  },

  /**
   * Enqueue a semaphore-blocked command.
   * If a pre-notify exists, executes immediately instead of blocking.
   * Returns the assigned PID.
   */
  enqueueSemaphore: async (
    entry: Omit<SemEntry, "pid" | "queuedAt" | "semaphoreId">,
    semaphoreId: string,
  ): Promise<number> => {
    const pid = await nextPid();
    const queuedAt = Date.now();
    const full: SemEntry = { ...entry, pid, semaphoreId, queuedAt };

    // Optimistically consume a pre-notify (counter > 0 → execute immediately)
    const counterKey = ["semaphore_counter", semaphoreId] as const;
    for (let i = 0; i < 10; i++) {
      const cur = await kv.get<number>(counterKey);
      const count = cur.value ?? 0;
      if (count <= 0) break; // no pre-notify; fall through to block
      const r = await kv.atomic().check(cur).set(counterKey, count - 1).commit();
      if (r.ok) {
        // Execute immediately via time queue
        await kv.set(["queue", pid], { ...full, scheduledAt: queuedAt } as unknown as QueueEntry);
        await kv.enqueue({ pid }, { delay: 0 });
        return pid;
      }
    }

    // Block: store in semaphore queue
    await kv.set(["semaphore_queue", semaphoreId, pid], full);
    return pid;
  },

  /** Cancel a single PID. Returns true if it existed. */
  cancel: async (pid: number): Promise<boolean> => {
    const res = await kv.get(["queue", pid]);
    if (!res.value) return false;
    await kv.delete(["queue", pid]);
    return true;
  },

  /** Cancel all time-queued entries for an executor. Returns count cancelled. */
  cancelAll: async (executor: string): Promise<number> => {
    let n = 0;
    for await (const e of kv.list<QueueEntry>({ prefix: ["queue"] })) {
      if (e.value?.executor === executor) { await kv.delete(e.key); n++; }
    }
    return n;
  },

  /**
   * List time-queued entries.
   * If executorId given, filter to that executor only.
   * Sorted by scheduledAt ascending (soonest first).
   */
  list: async (executorId?: string): Promise<QueueEntry[]> => {
    const out: QueueEntry[] = [];
    for await (const e of kv.list<QueueEntry>({ prefix: ["queue"] })) {
      if (!e.value) continue;
      if (executorId && e.value.executor !== executorId) continue;
      out.push(e.value);
    }
    return out.sort((a, b) => a.scheduledAt - b.scheduledAt);
  },

  /**
   * List semaphore-blocked entries.
   * If executorId given, filter to that executor.
   * Sorted by queuedAt ascending (oldest first).
   */
  listSemaphore: async (executorId?: string): Promise<SemEntry[]> => {
    const out: SemEntry[] = [];
    for await (const e of kv.list<SemEntry>({ prefix: ["semaphore_queue"] })) {
      if (!e.value) continue;
      if (executorId && e.value.executor !== executorId) continue;
      out.push(e.value);
    }
    return out.sort((a, b) => a.queuedAt - b.queuedAt);
  },

  /**
   * Release up to `count` semaphore-blocked commands for `semaphoreId`.
   * If the queue is empty, increments the pre-notify counter instead.
   * Returns the number of commands actually released (0 if pre-notified).
   */
  notifySemaphore: async (semaphoreId: string, count = 1): Promise<number> => {
    const prefix = ["semaphore_queue", semaphoreId] as const;
    const toRelease: { key: Deno.KvKey; entry: SemEntry }[] = [];

    for await (const item of kv.list<SemEntry>({ prefix })) {
      if (!item.value) continue;
      toRelease.push({ key: item.key, entry: item.value });
      if (toRelease.length >= count) break;
    }

    if (toRelease.length === 0) {
      // No blocked commands — pre-notify
      await atomicCounter(semaphoreId, count);
      return 0;
    }

    // Release each: move from semaphore_queue to time queue with delay=0
    for (const { key, entry } of toRelease) {
      const pid = await nextPid();
      await kv.delete(key);
      await kv.set(["queue", pid], { ...entry, pid, scheduledAt: Date.now() } as unknown as QueueEntry);
      await kv.enqueue({ pid }, { delay: 0 });
    }

    // If we released fewer than requested, add remaining as pre-notifies
    const remainder = count - toRelease.length;
    if (remainder > 0) await atomicCounter(semaphoreId, remainder);

    return toRelease.length;
  },

  /**
   * Clear all semaphore-blocked commands for `semaphoreId` and reset counter.
   * Returns the number of discarded entries.
   */
  drainSemaphore: async (semaphoreId: string): Promise<number> => {
    let n = 0;
    for await (const e of kv.list({ prefix: ["semaphore_queue", semaphoreId] })) {
      await kv.delete(e.key);
      n++;
    }
    await kv.delete(["semaphore_counter", semaphoreId]);
    return n;
  },

  /**
   * Count semaphore-blocked entries for a specific semaphoreId.
   * Scoped to the semaphore's KV prefix — does NOT scan the full queue.
   */
  countSemaphore: async (semaphoreId: string): Promise<number> => {
    let n = 0;
    for await (const _ of kv.list({ prefix: ["semaphore_queue", semaphoreId] })) {
      n++;
    }
    return n;
  },

  /** Initialize the KV queue listener. Call once at server startup. */
  init: () => {
    kv.listenQueue(async (msg: unknown) => {
      const { pid } = msg as { pid: number };
      const res = await kv.get<QueueEntry>(["queue", pid]);
      if (!res.value) return; // cancelled or already processed

      const entry = res.value;
      try {
        // Delete before executing (at-least-once: KV retries on uncaught throw)
        await kv.delete(["queue", pid]);
        await force(
          {
            // deno-lint-ignore no-explicit-any
            socket: { cid: entry.executor, id: "queue", join: () => {}, leave: () => {}, send: () => {}, disconnect: () => {} } as any,
            msg: entry.command,
            data: entry.data ?? {},
          },
          entry.command,
        );
      } catch (err) {
        console.error(`[Queue] PID ${pid} failed:`, err);
      }
    });
    console.log("[Queue] Service initialized.");
  },
};
