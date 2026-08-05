/**
 * full-featured job list filters and due parsing.
 */
import { assertEquals } from "@std/assert";
import {
  filterJobs,
  isOverdue,
  parseDue,
  matchesMine,
} from "../src/filter.ts";
import type { IJob } from "../src/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function job(o: Partial<IJob> = {}): IJob {
  return {
    id: "job-1",
    number: 1,
    title: "T",
    bucket: "BUG",
    status: "open",
    submittedBy: "p1",
    submitterName: "Alice",
    description: "body dragon here",
    comments: [],
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now(),
    ...o,
  };
}

Deno.test("parseDue relative days", OPTS, () => {
  const now = 1_700_000_000_000;
  const t = parseDue("2d", now);
  assertEquals(t, now + 2 * 86400000);
});

Deno.test("parseDue m/d/y", OPTS, () => {
  const t = parseDue("12/25/26");
  assertEquals(t != null, true);
  const d = new Date(t!);
  assertEquals(d.getMonth(), 11);
  assertEquals(d.getDate(), 25);
});

Deno.test("isOverdue uses dueAt", OPTS, () => {
  const now = Date.now();
  assertEquals(
    isOverdue(job({ dueAt: now - 1000 }), now),
    true,
  );
  assertEquals(
    isOverdue(job({ dueAt: now + 100000 }), now),
    false,
  );
});

Deno.test("filterJobs mine and search", OPTS, () => {
  const list = [
    job({ number: 1, assignedTo: "staff1" }),
    job({
      number: 2,
      assignedTo: "other",
      tags: ["staff1"],
      description: "no match",
    }),
    job({ number: 3, title: "dragon egg" }),
  ];
  assertEquals(filterJobs(list, "mine", "", "staff1").length, 2);
  assertEquals(
    filterJobs(list, "search", "dragon", "x").map((j) => j.number),
    [1, 3],
  );
});

Deno.test("matchesMine", OPTS, () => {
  assertEquals(matchesMine(job({ assignedTo: "a" }), "a"), true);
  assertEquals(matchesMine(job({ tags: ["a"] }), "a"), true);
  assertEquals(matchesMine(job({}), "a"), false);
});
