import { assertStringIncludes } from "@std/assert";
import { listReports, runReport } from "../src/reports.ts";
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
    submitterName: "A",
    description: "d",
    comments: [{
      authorId: "s",
      authorName: "Staff",
      text: "hi",
      timestamp: Date.now(),
      published: true,
    }],
    createdAt: Date.now() - 10 * 86400000,
    updatedAt: Date.now(),
    ...o,
  };
}

Deno.test("listReports names", OPTS, () => {
  assertStringIncludes(listReports(), "open");
  assertStringIncludes(listReports(), "overdue");
});

Deno.test("runReport open", OPTS, () => {
  const out = runReport([j(), j({ number: 2, bucket: "PLOT" })], "open", "");
  assertStringIncludes(out, "BUG");
  assertStringIncludes(out, "PLOT");
});

Deno.test("runReport actby", OPTS, () => {
  const out = runReport([j()], "actby", "");
  assertStringIncludes(out, "Staff");
});
