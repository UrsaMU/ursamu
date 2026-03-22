/**
 * tests/security_weak_id_jobs.test.ts
 *
 * [LOW] Weak ID generation — makeCommentId() in jobs/router.ts uses
 * `Date.now() + Math.random()` which produces predictable IDs.
 * Should use crypto.randomUUID() for unpredictable, collision-resistant IDs.
 *
 * RED:  comment IDs returned from POST /api/v1/jobs/:id/comment do NOT match
 *       the UUID v4 format — test fails.
 * GREEN: makeCommentId() replaced with crypto.randomUUID() — test passes.
 */
import { assertEquals, assertMatch } from "@std/assert";
import { jobsRouteHandler } from "../src/plugins/jobs/router.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STAFF_ID  = "weakid_staff1";
const PLAYER_ID = "weakid_player1";

// ── setup ─────────────────────────────────────────────────────────────────────

Deno.test("[WeakID] jobs setup", OPTS, async () => {
  await dbojs.delete({ id: STAFF_ID  }).catch(() => {});
  await dbojs.delete({ id: PLAYER_ID }).catch(() => {});
  await dbojs.create({ id: STAFF_ID,  flags: "player admin connected", data: { name: "StaffUser"  } });
  await dbojs.create({ id: PLAYER_ID, flags: "player connected",       data: { name: "PlayerUser" } });
});

// ── exploit test ──────────────────────────────────────────────────────────────

Deno.test("[WeakID] job comment ID must be a UUID v4 (not Date.now-based)", OPTS, async () => {
  // Create a job as staff
  const createJobReq = new Request("http://localhost/api/v1/jobs", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ title: "Test job", description: "Testing comment IDs" }),
  });
  const createRes = await jobsRouteHandler(createJobReq, STAFF_ID);
  assertEquals(createRes.status, 201);
  const job = await createRes.json() as { id: string };

  // Add a comment
  const commentReq = new Request(`http://localhost/api/v1/jobs/${job.id}/comment`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ text: "A comment" }),
  });
  const commentRes = await jobsRouteHandler(commentReq, STAFF_ID);
  assertEquals(commentRes.status, 201);
  const comment = await commentRes.json() as { id: string };

  // The ID must be a UUID v4 — currently it's "jc-{timestamp}-{random}" which
  // does NOT match UUID format → RED.
  assertMatch(comment.id, UUID_RE);
});

// ── cleanup ───────────────────────────────────────────────────────────────────

Deno.test("[WeakID] jobs cleanup", OPTS, async () => {
  await dbojs.delete({ id: STAFF_ID  }).catch(() => {});
  await dbojs.delete({ id: PLAYER_ID }).catch(() => {});
  await DBO.close();
});
