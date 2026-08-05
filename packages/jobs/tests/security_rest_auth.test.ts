/**
 * REST auth helpers — staff flags + job visibility.
 * Pure unit tests (no KV).
 */
import { assertEquals } from "@std/assert";
import {
  canViewJob,
  flagSetFromRaw,
  isStaffFlagSet,
  presentJob,
  stripStaffComments,
} from "../src/rest-auth.ts";
import type { IJob } from "../src/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function job(over: Partial<IJob> = {}): IJob {
  return {
    id: "job-1",
    number: 1,
    title: "T",
    status: "open",
    submittedBy: "p1",
    submitterName: "Alice",
    description: "d",
    comments: [],
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

Deno.test("flagSetFromRaw — string tokens", OPTS, () => {
  const s = flagSetFromRaw("player connected admin");
  assertEquals(s.has("admin"), true);
  assertEquals(s.has("player"), true);
});

Deno.test("flagSetFromRaw — Set input", OPTS, () => {
  const s = flagSetFromRaw(new Set(["Wizard", "player"]));
  assertEquals(s.has("wizard"), true);
  assertEquals(isStaffFlagSet(s), true);
});

Deno.test("flagSetFromRaw — array input", OPTS, () => {
  const s = flagSetFromRaw(["superuser", "connected"]);
  assertEquals(isStaffFlagSet(s), true);
});

Deno.test(
  "flagSetFromRaw — no substring staff bypass",
  OPTS,
  () => {
    const s = flagSetFromRaw("notadmin player");
    assertEquals(s.has("admin"), false);
    assertEquals(isStaffFlagSet(s), false);
  },
);

Deno.test("isStaffFlagSet — builder is not staff", OPTS, () => {
  assertEquals(
    isStaffFlagSet(flagSetFromRaw("player builder")),
    false,
  );
});

Deno.test("stripStaffComments — drops staffOnly", OPTS, () => {
  const j = job({
    comments: [
      {
        authorId: "p1",
        authorName: "A",
        text: "public",
        timestamp: 1,
      },
      {
        authorId: "s1",
        authorName: "S",
        text: "secret",
        timestamp: 2,
        staffOnly: true,
      },
    ],
  });
  const out = stripStaffComments(j);
  assertEquals(out.comments.length, 1);
  assertEquals(out.comments[0]!.text, "public");
  // original untouched
  assertEquals(j.comments.length, 2);
});

Deno.test("canViewJob — staff sees all", OPTS, () => {
  const j = job({ staffOnly: true, submittedBy: "other" });
  assertEquals(canViewJob(j, "p1", true), true);
});

Deno.test("canViewJob — player own job", OPTS, () => {
  const j = job({ submittedBy: "p1" });
  assertEquals(canViewJob(j, "p1", false), true);
});

Deno.test("canViewJob — player cannot see others", OPTS, () => {
  const j = job({ submittedBy: "p2" });
  assertEquals(canViewJob(j, "p1", false), false);
});

Deno.test(
  "canViewJob — player cannot see staffOnly even if own",
  OPTS,
  () => {
    // staffOnly jobs are staff-internal; submitter may still be staff
    // but non-staff flag path must deny.
    const j = job({ submittedBy: "p1", staffOnly: true });
    assertEquals(canViewJob(j, "p1", false), false);
  },
);

Deno.test("presentJob — strips for non-staff", OPTS, () => {
  const j = job({
    comments: [
      {
        authorId: "s",
        authorName: "S",
        text: "x",
        timestamp: 1,
        staffOnly: true,
      },
    ],
  });
  assertEquals(presentJob(j, false).comments.length, 0);
  assertEquals(presentJob(j, true).comments.length, 1);
});
