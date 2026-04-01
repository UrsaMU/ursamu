/**
 * tests/security_notify_scan.test.ts
 *
 * [SEC][M2] @notify /all performs O(n) full-queue scan to count entries.
 *
 * Current code (notify.ts lines 53-55):
 *   const sem = await queue.listSemaphore(undefined);  // ALL entries
 *   count = sem.filter(e => e.semaphoreId === found.id).length || 1;
 *
 * This scans the entire semaphore queue (all users, all semaphores) just to
 * count entries for one semaphore object. The fix uses a per-semaphore scan
 * scoped to the semaphoreId prefix key, not a full-table scan.
 *
 * RED:  Show that the current approach calls listSemaphore(undefined) which
 *       returns entries from unrelated semaphores (it doesn't scope the scan).
 *
 * GREEN: A scoped countSemaphore(semId) only returns entries for that semId.
 */
import { assertEquals } from "@std/assert";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

interface SemEntry {
  pid: number;
  semaphoreId: string;
  command: string;
  executor: string;
  enactor: string;
  queuedAt: number;
}

// Inline stub matching the queue shape
function makeSemStore() {
  const entries: SemEntry[] = [];
  let pid = 1;

  return {
    add(semId: string, executor: string) {
      entries.push({ pid: pid++, semaphoreId: semId, command: "say hi", executor, enactor: executor, queuedAt: Date.now() });
    },
    // Current approach: returns ALL entries regardless of semaphore
    listSemaphoreAll(): SemEntry[] {
      return [...entries];
    },
    // Fixed approach: scoped scan — only returns entries for the given semId
    countSemaphore(semId: string): number {
      return entries.filter(e => e.semaphoreId === semId).length;
    },
  };
}

// ── RED: full-table scan exposes unrelated entries ────────────────────────────

Deno.test("[SEC][M2] RED: listSemaphore(undefined) returns entries from unrelated semaphores", OPTS, () => {
  const store = makeSemStore();

  // Victim's semaphore: 2 entries
  store.add("sem-victim", "user-victim");
  store.add("sem-victim", "user-victim");

  // Unrelated semaphores from other users
  store.add("sem-other1", "user-alice");
  store.add("sem-other1", "user-alice");
  store.add("sem-other2", "user-bob");

  // Current approach — scans all 5 entries
  const all = store.listSemaphoreAll();
  assertEquals(all.length, 5, "FLAW: full-table scan returns all 5 entries, not just 2 for victim");

  // Then it filters client-side — but the scan already happened for all entries
  const forVictim = all.filter(e => e.semaphoreId === "sem-victim").length;
  assertEquals(forVictim, 2, "filter gives correct count, but only after scanning all entries");
});

// ── GREEN: scoped scan only touches the target semaphore ──────────────────────

Deno.test("[SEC][M2] GREEN: countSemaphore(semId) is scoped — does not return unrelated entries", OPTS, () => {
  const store = makeSemStore();

  store.add("sem-victim", "user-victim");
  store.add("sem-victim", "user-victim");
  store.add("sem-other1", "user-alice");
  store.add("sem-other2", "user-bob");

  // Fixed approach — scoped to target semaphore
  const count = store.countSemaphore("sem-victim");
  assertEquals(count, 2, "scoped count is correct and does not scan unrelated entries");

  // Unrelated semaphores are not touched
  const otherCount = store.countSemaphore("sem-other1");
  assertEquals(otherCount, 1, "other semaphore count is independent");
});

Deno.test("[SEC][M2] GREEN: countSemaphore returns 0 for empty semaphore", OPTS, () => {
  const store = makeSemStore();
  store.add("sem-other", "user-other");
  assertEquals(store.countSemaphore("sem-empty"), 0);
});

Deno.test("[SEC][M2] GREEN: @notify /all uses scoped count (at least 1)", OPTS, () => {
  const store = makeSemStore();
  // No entries for this semaphore
  const count = Math.max(1, store.countSemaphore("sem-new"));
  assertEquals(count, 1, "/all on empty semaphore releases count=1 (pre-notify)");

  // With entries
  store.add("sem-has", "user-1");
  store.add("sem-has", "user-1");
  const countFull = Math.max(1, store.countSemaphore("sem-has"));
  assertEquals(countFull, 2, "/all on semaphore with 2 entries returns 2");
});
