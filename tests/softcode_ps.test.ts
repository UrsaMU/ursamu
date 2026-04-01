/**
 * tests/softcode_ps.test.ts
 *
 * Unit tests for @ps, @drain, @notify, and semaphore @wait logic.
 * Tests the queue service's list/semaphore logic using inline stubs — no Deno KV needed.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ── Inline queue logic stubs ───────────────────────────────────────────────

interface QueueEntry { pid: number; command: string; executor: string; enactor: string; scheduledAt: number; }
interface SemEntry { pid: number; semaphoreId: string; command: string; executor: string; enactor: string; queuedAt: number; }

function makeQueue() {
  const time: QueueEntry[] = [];
  const sem: SemEntry[] = [];
  const counters: Map<string, number> = new Map();
  let pid = 1;

  return {
    enqueue(entry: Omit<QueueEntry, "pid" | "scheduledAt">, delay = 0): number {
      const e = { ...entry, pid: pid++, scheduledAt: Date.now() + delay };
      time.push(e);
      return e.pid;
    },
    enqueueSemaphore(entry: Omit<SemEntry, "pid" | "queuedAt" | "semaphoreId">, semId: string): { pid: number; immediate: boolean } {
      const count = counters.get(semId) ?? 0;
      const p = pid++;
      if (count > 0) {
        counters.set(semId, count - 1);
        time.push({ ...entry, pid: p, scheduledAt: Date.now(), semaphoreId: undefined! } as unknown as QueueEntry);
        return { pid: p, immediate: true };
      }
      sem.push({ ...entry, pid: p, semaphoreId: semId, queuedAt: Date.now() });
      return { pid: p, immediate: false };
    },
    cancelAll(executor: string): number {
      const before = time.length;
      time.splice(0, time.length, ...time.filter(e => e.executor !== executor));
      return before - time.length;
    },
    drainSemaphore(semId: string): number {
      const before = sem.length;
      sem.splice(0, sem.length, ...sem.filter(e => e.semaphoreId !== semId));
      counters.delete(semId);
      return before - sem.length;
    },
    notifySemaphore(semId: string, count = 1): number {
      const blocked = sem.filter(e => e.semaphoreId === semId).sort((a, b) => a.queuedAt - b.queuedAt);
      const toRelease = blocked.slice(0, count);
      if (toRelease.length === 0) {
        counters.set(semId, (counters.get(semId) ?? 0) + count);
        return 0;
      }
      for (const e of toRelease) {
        const idx = sem.indexOf(e);
        sem.splice(idx, 1);
        time.push({ ...e, scheduledAt: Date.now() } as unknown as QueueEntry);
      }
      const remainder = count - toRelease.length;
      if (remainder > 0) counters.set(semId, (counters.get(semId) ?? 0) + remainder);
      return toRelease.length;
    },
    list(executorId?: string): QueueEntry[] {
      return (executorId ? time.filter(e => e.executor === executorId) : [...time])
        .sort((a, b) => a.scheduledAt - b.scheduledAt);
    },
    listSemaphore(executorId?: string): SemEntry[] {
      return (executorId ? sem.filter(e => e.executor === executorId) : [...sem])
        .sort((a, b) => a.queuedAt - b.queuedAt);
    },
    _time: time,
    _sem: sem,
    _counters: counters,
  };
}

// ── @ps list logic ─────────────────────────────────────────────────────────

Deno.test("@ps — list returns own time entries", OPTS, () => {
  const q = makeQueue();
  q.enqueue({ command: "say hello", executor: "1", enactor: "1" }, 30_000);
  q.enqueue({ command: "say world", executor: "2", enactor: "2" }, 30_000);

  const mine = q.list("1");
  assertEquals(mine.length, 1);
  assertEquals(mine[0].command, "say hello");
});

Deno.test("@ps — /all returns all entries", OPTS, () => {
  const q = makeQueue();
  q.enqueue({ command: "say a", executor: "1", enactor: "1" });
  q.enqueue({ command: "say b", executor: "2", enactor: "2" });

  assertEquals(q.list().length, 2);
});

Deno.test("@ps — list is sorted by scheduledAt ascending", OPTS, () => {
  const q = makeQueue();
  q.enqueue({ command: "later", executor: "1", enactor: "1" }, 10_000);
  q.enqueue({ command: "sooner", executor: "1", enactor: "1" }, 1_000);

  const entries = q.list("1");
  assertEquals(entries[0].command, "sooner");
  assertEquals(entries[1].command, "later");
});

Deno.test("@ps — semaphore entries listed separately", OPTS, () => {
  const q = makeQueue();
  q.enqueueSemaphore({ command: "say done", executor: "1", enactor: "1" }, "sem42");

  assertEquals(q.list("1").length, 0);
  assertEquals(q.listSemaphore("1").length, 1);
  assertEquals(q.listSemaphore("1")[0].semaphoreId, "sem42");
});

// ── @drain logic ───────────────────────────────────────────────────────────

Deno.test("@drain — cancels time entries for executor", OPTS, () => {
  const q = makeQueue();
  q.enqueue({ command: "say hi", executor: "1", enactor: "1" });
  q.enqueue({ command: "say hi", executor: "2", enactor: "2" });

  const count = q.cancelAll("1");
  assertEquals(count, 1);
  assertEquals(q.list().length, 1); // only executor 2 remains
});

Deno.test("@drain — drains semaphore queue and resets counter", OPTS, () => {
  const q = makeQueue();
  q.enqueueSemaphore({ command: "say a", executor: "1", enactor: "1" }, "sem5");
  q.enqueueSemaphore({ command: "say b", executor: "1", enactor: "1" }, "sem5");

  const cleared = q.drainSemaphore("sem5");
  assertEquals(cleared, 2);
  assertEquals(q.listSemaphore().length, 0);
  assertEquals(q._counters.get("sem5"), undefined); // counter deleted
});

Deno.test("@drain — draining empty queue returns 0", OPTS, () => {
  const q = makeQueue();
  assertEquals(q.drainSemaphore("nobody"), 0);
  assertEquals(q.cancelAll("nobody"), 0);
});

// ── @notify logic ──────────────────────────────────────────────────────────

Deno.test("@notify — releases one semaphore entry", OPTS, () => {
  const q = makeQueue();
  q.enqueueSemaphore({ command: "say a", executor: "1", enactor: "1" }, "sem10");
  q.enqueueSemaphore({ command: "say b", executor: "1", enactor: "1" }, "sem10");

  const released = q.notifySemaphore("sem10", 1);
  assertEquals(released, 1);
  assertEquals(q.listSemaphore().length, 1); // one still blocked
});

Deno.test("@notify — releases N entries", OPTS, () => {
  const q = makeQueue();
  for (let i = 0; i < 5; i++) {
    q.enqueueSemaphore({ command: `say ${i}`, executor: "1", enactor: "1" }, "sem20");
  }
  const released = q.notifySemaphore("sem20", 3);
  assertEquals(released, 3);
  assertEquals(q.listSemaphore().length, 2);
});

Deno.test("@notify — when no blocked commands, stores pre-notify counter", OPTS, () => {
  const q = makeQueue();
  const released = q.notifySemaphore("sem30", 2);
  assertEquals(released, 0);
  assertEquals(q._counters.get("sem30"), 2);
});

// ── Semaphore @wait pre-notify consumption ─────────────────────────────────

Deno.test("@wait semaphore — pre-notify consumed, executes immediately", OPTS, () => {
  const q = makeQueue();
  // Pre-notify first
  q.notifySemaphore("sem40", 1);
  assertEquals(q._counters.get("sem40"), 1);

  // @wait on pre-notified semaphore → immediate
  const { immediate } = q.enqueueSemaphore({ command: "say go", executor: "1", enactor: "1" }, "sem40");
  assertEquals(immediate, true);
  assertEquals(q._counters.get("sem40"), 0);
  assertEquals(q.listSemaphore().length, 0);
});

Deno.test("@wait semaphore — no pre-notify, command blocks", OPTS, () => {
  const q = makeQueue();
  const { immediate } = q.enqueueSemaphore({ command: "say wait", executor: "1", enactor: "1" }, "sem50");
  assertEquals(immediate, false);
  assertEquals(q.listSemaphore().length, 1);
});

Deno.test("@notify releases in FIFO order", OPTS, () => {
  const q = makeQueue();
  q.enqueueSemaphore({ command: "first", executor: "1", enactor: "1" }, "sem60");
  q.enqueueSemaphore({ command: "second", executor: "1", enactor: "1" }, "sem60");
  q.enqueueSemaphore({ command: "third", executor: "1", enactor: "1" }, "sem60");

  q.notifySemaphore("sem60", 1);
  // The second and third should still be blocked
  const remaining = q.listSemaphore();
  assertEquals(remaining.length, 2);
  assertEquals(remaining[0].command, "second");
});
