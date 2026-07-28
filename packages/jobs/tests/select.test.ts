/**
 * +jobs/select DSL tests.
 */
import { assertEquals } from "@std/assert";
import { runSelect } from "../src/select.ts";
import type { IJob } from "../src/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function j(o: Partial<IJob> = {}): IJob {
  return {
    id: "1",
    number: 1,
    title: "T",
    bucket: "BUG",
    status: "open",
    submittedBy: "p1",
    submitterName: "Alice",
    description: "dragon egg",
    comments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...o,
  };
}

Deno.test("select: and/or/not", OPTS, () => {
  const jobs = [
    j({ number: 1, assignedTo: "me", description: "x" }),
    j({ number: 2, assignedTo: "other", description: "dragon" }),
    j({
      number: 3,
      assignedTo: "me",
      description: "dragon",
      dueAt: Date.now() - 1000,
    }),
  ];
  const r = runSelect(
    jobs,
    "(mine | search=dragon) & ! overdue",
    "me",
  );
  assertEquals(r.error, undefined);
  assertEquals(r.jobs.map((x) => x.number).sort(), [1, 2]);
});

Deno.test("select: sort=-due", OPTS, () => {
  const now = Date.now();
  const jobs = [
    j({ number: 1, dueAt: now + 10000 }),
    j({ number: 2, dueAt: now + 5000 }),
  ];
  const r = runSelect(jobs, "all sort=-due", "me", now);
  assertEquals(r.jobs.map((x) => x.number), [1, 2]);
});

Deno.test("select: unknown criterion errors", OPTS, () => {
  const r = runSelect([j()], "nope", "me");
  assertEquals(!!r.error, true);
});

Deno.test("select: quoted search", OPTS, () => {
  const jobs = [
    j({ number: 1, description: "dragon egg" }),
    j({ number: 2, description: "dragon" }),
  ];
  const r = runSelect(
    jobs,
    'search="dragon egg"',
    "me",
  );
  assertEquals(r.jobs.map((x) => x.number), [1]);
});
