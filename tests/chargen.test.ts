/**
 * tests/chargen.test.ts
 *
 * Tests for the chargen plugin:
 *   - db helpers: getOrCreateApp, findAppByPlayer
 *   - application lifecycle: create, set fields, submit, approve, reject
 *   - REST: GET /api/v1/chargen, GET /api/v1/chargen/:playerId, PATCH /api/v1/chargen/:playerId
 */
import { assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { DBO, dbojs } from "../src/services/Database/database.ts";
import {
  chargenApps,
  getOrCreateApp,
  findAppByPlayer,
} from "../src/plugins/chargen/db.ts";
import { chargenRouteHandler } from "../src/plugins/chargen/router.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ─── in-memory KV setup ───────────────────────────────────────────────────────

const kv = await Deno.openKv(":memory:");
Deno.openKv = () => Promise.resolve(kv);
// deno-lint-ignore no-explicit-any
(DBO as any).kv = null;

// ─── test IDs (prefixed to avoid collisions) ─────────────────────────────────

const STAFF_ID  = "cg_staff1";
const PLAYER_ID = "cg_player1";
const PLAYER2_ID = "cg_player2";

// ─── helper ───────────────────────────────────────────────────────────────────

async function cleanup() {
  await chargenApps.delete({ id: `chargen_${PLAYER_ID}` }).catch(() => {});
  await chargenApps.delete({ id: `chargen_${PLAYER2_ID}` }).catch(() => {});
  await dbojs.delete({ id: STAFF_ID }).catch(() => {});
  await dbojs.delete({ id: PLAYER_ID }).catch(() => {});
  await dbojs.delete({ id: PLAYER2_ID }).catch(() => {});
}

function req(method: string, path: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function call<T = unknown>(
  method: string,
  path: string,
  userId: string | null,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const r = req(method, path, body);
  const res = await chargenRouteHandler(r, userId);
  const data = await res.json() as T;
  return { status: res.status, data };
}

// ─── seed helpers ─────────────────────────────────────────────────────────────

async function seedStaff() {
  await dbojs.delete({ id: STAFF_ID }).catch(() => {});
  await dbojs.create({ id: STAFF_ID, flags: "admin", data: { name: "Staff" } });
}

async function seedPlayer(id = PLAYER_ID) {
  await dbojs.delete({ id }).catch(() => {});
  await dbojs.create({ id, flags: "player unapproved", data: { name: "TestPlayer" } });
}

// =============================================================================
// DB helpers
// =============================================================================

Deno.test("getOrCreateApp — creates a new draft app", OPTS, async () => {
  await cleanup();
  await seedPlayer();

  const app = await getOrCreateApp(PLAYER_ID);
  assertEquals(app.id, `chargen_${PLAYER_ID}`);
  assertEquals(app.data.playerId, PLAYER_ID);
  assertEquals(app.data.status, "draft");
  assertEquals(app.flags, "chargen");
  assertEquals(typeof app.data.fields, "object");

  await cleanup();
});

Deno.test("getOrCreateApp — returns existing app on second call", OPTS, async () => {
  await cleanup();
  await seedPlayer();

  const app1 = await getOrCreateApp(PLAYER_ID);
  const app2 = await getOrCreateApp(PLAYER_ID);
  assertEquals(app1.id, app2.id);

  await cleanup();
});

Deno.test("findAppByPlayer — returns null when no app exists", OPTS, async () => {
  await cleanup();

  const app = await findAppByPlayer("cg_nonexistent");
  assertEquals(app, null);
});

Deno.test("findAppByPlayer — returns app after creation", OPTS, async () => {
  await cleanup();
  await seedPlayer();

  await getOrCreateApp(PLAYER_ID);
  const found = await findAppByPlayer(PLAYER_ID);
  assertExists(found);
  assertEquals(found!.data.playerId, PLAYER_ID);

  await cleanup();
});

// =============================================================================
// Application lifecycle
// =============================================================================

Deno.test("lifecycle — create app, set fields, submit → status becomes pending", OPTS, async () => {
  await cleanup();
  await seedPlayer();

  // Create
  let app = await getOrCreateApp(PLAYER_ID);
  assertEquals(app.data.status, "draft");

  // Set fields
  const updatedFields = { ...app.data.fields, fullname: "Test Player", concept: "Warrior" };
  await chargenApps.update({ id: app.id }, {
    ...app,
    data: { ...app.data, fields: updatedFields },
  });
  app = (await findAppByPlayer(PLAYER_ID))!;
  assertEquals(app.data.fields["fullname"], "Test Player");
  assertEquals(app.data.fields["concept"], "Warrior");

  // Submit
  const now = Date.now();
  const submitted = {
    ...app,
    data: { ...app.data, status: "pending" as const, submittedAt: now },
  };
  await chargenApps.update({ id: app.id }, submitted);
  app = (await findAppByPlayer(PLAYER_ID))!;
  assertEquals(app.data.status, "pending");
  assertExists(app.data.submittedAt);

  await cleanup();
});

Deno.test("lifecycle — approve updates status and records reviewer", OPTS, async () => {
  await cleanup();
  await seedPlayer();
  await seedStaff();

  let app = await getOrCreateApp(PLAYER_ID);
  // Submit first
  await chargenApps.update({ id: app.id }, {
    ...app,
    data: { ...app.data, status: "pending" as const, submittedAt: Date.now(), fields: { concept: "Mage" } },
  });

  app = (await findAppByPlayer(PLAYER_ID))!;
  const now = Date.now();
  const approved = {
    ...app,
    data: {
      ...app.data,
      status: "approved" as const,
      reviewedAt: now,
      reviewedBy: "Staff",
    },
  };
  await chargenApps.update({ id: app.id }, approved);

  app = (await findAppByPlayer(PLAYER_ID))!;
  assertEquals(app.data.status, "approved");
  assertEquals(app.data.reviewedBy, "Staff");
  assertExists(app.data.reviewedAt);

  await cleanup();
});

Deno.test("lifecycle — reject updates status and saves notes", OPTS, async () => {
  await cleanup();
  await seedPlayer();

  let app = await getOrCreateApp(PLAYER_ID);
  await chargenApps.update({ id: app.id }, {
    ...app,
    data: { ...app.data, status: "pending" as const, submittedAt: Date.now(), fields: { concept: "Spy" } },
  });

  app = (await findAppByPlayer(PLAYER_ID))!;
  const rejected = {
    ...app,
    data: {
      ...app.data,
      status: "rejected" as const,
      reviewedAt: Date.now(),
      reviewedBy: "Staff",
      notes: "Incomplete background.",
    },
  };
  await chargenApps.update({ id: app.id }, rejected);

  app = (await findAppByPlayer(PLAYER_ID))!;
  assertEquals(app.data.status, "rejected");
  assertEquals(app.data.notes, "Incomplete background.");

  await cleanup();
});

// =============================================================================
// REST API
// =============================================================================

Deno.test("GET /api/v1/chargen — 401 when no userId", OPTS, async () => {
  const { status } = await call("GET", "/api/v1/chargen", null);
  assertEquals(status, 401);
});

Deno.test("GET /api/v1/chargen — 403 for non-staff player", OPTS, async () => {
  await cleanup();
  await seedPlayer();

  const { status } = await call("GET", "/api/v1/chargen", PLAYER_ID);
  assertEquals(status, 403);

  await cleanup();
});

Deno.test("GET /api/v1/chargen — returns list for staff", OPTS, async () => {
  await cleanup();
  await seedStaff();
  await seedPlayer();

  // Create a pending app
  const app = await getOrCreateApp(PLAYER_ID);
  await chargenApps.update({ id: app.id }, {
    ...app,
    data: { ...app.data, status: "pending" as const, submittedAt: Date.now(), fields: { concept: "Test" } },
  });

  const { status, data } = await call<unknown[]>("GET", "/api/v1/chargen", STAFF_ID);
  assertEquals(status, 200);
  assertEquals(Array.isArray(data), true);
  const pending = (data as Array<{ data: { status: string } }>).filter(a => a.data.status === "pending");
  assertEquals(pending.length >= 1, true);

  await cleanup();
});

Deno.test("GET /api/v1/chargen?status=pending — filters by status", OPTS, async () => {
  await cleanup();
  await seedStaff();
  await seedPlayer();
  await seedPlayer(PLAYER2_ID);

  // One pending, one draft
  const app1 = await getOrCreateApp(PLAYER_ID);
  await chargenApps.update({ id: app1.id }, {
    ...app1,
    data: { ...app1.data, status: "pending" as const, submittedAt: Date.now(), fields: { concept: "A" } },
  });
  await getOrCreateApp(PLAYER2_ID); // remains draft

  const { status, data } = await call<unknown[]>("GET", "/api/v1/chargen?status=pending", STAFF_ID);
  assertEquals(status, 200);
  const allPending = (data as Array<{ data: { status: string } }>).every(a => a.data.status === "pending");
  assertEquals(allPending, true);

  await cleanup();
});

Deno.test("GET /api/v1/chargen/:playerId — 401 when not authenticated", OPTS, async () => {
  const { status } = await call("GET", `/api/v1/chargen/${PLAYER_ID}`, null);
  assertEquals(status, 401);
});

Deno.test("GET /api/v1/chargen/:playerId — 403 when fetching another player's app", OPTS, async () => {
  await cleanup();
  await seedPlayer();
  await seedPlayer(PLAYER2_ID);

  await getOrCreateApp(PLAYER_ID);

  const { status } = await call("GET", `/api/v1/chargen/${PLAYER_ID}`, PLAYER2_ID);
  assertEquals(status, 403);

  await cleanup();
});

Deno.test("GET /api/v1/chargen/:playerId — player can view own app", OPTS, async () => {
  await cleanup();
  await seedPlayer();

  await getOrCreateApp(PLAYER_ID);

  const { status, data } = await call<{ data: { playerId: string } }>(
    "GET", `/api/v1/chargen/${PLAYER_ID}`, PLAYER_ID
  );
  assertEquals(status, 200);
  assertEquals((data as { data: { playerId: string } }).data.playerId, PLAYER_ID);

  await cleanup();
});

Deno.test("GET /api/v1/chargen/:playerId — staff can view any app", OPTS, async () => {
  await cleanup();
  await seedStaff();
  await seedPlayer();

  await getOrCreateApp(PLAYER_ID);

  const { status, data } = await call<{ data: { playerId: string } }>(
    "GET", `/api/v1/chargen/${PLAYER_ID}`, STAFF_ID
  );
  assertEquals(status, 200);
  assertEquals((data as { data: { playerId: string } }).data.playerId, PLAYER_ID);

  await cleanup();
});

Deno.test("GET /api/v1/chargen/:playerId — 404 for nonexistent player", OPTS, async () => {
  await cleanup();
  await seedStaff();

  const { status } = await call("GET", "/api/v1/chargen/cg_nobody", STAFF_ID);
  assertEquals(status, 404);

  await cleanup();
});

Deno.test("PATCH /api/v1/chargen/:playerId — 401 when not authenticated", OPTS, async () => {
  const { status } = await call("PATCH", `/api/v1/chargen/${PLAYER_ID}`, null, { status: "approved" });
  assertEquals(status, 401);
});

Deno.test("PATCH /api/v1/chargen/:playerId — 403 for non-staff", OPTS, async () => {
  await cleanup();
  await seedPlayer();

  await getOrCreateApp(PLAYER_ID);

  const { status } = await call("PATCH", `/api/v1/chargen/${PLAYER_ID}`, PLAYER_ID, { status: "approved" });
  assertEquals(status, 403);

  await cleanup();
});

Deno.test("PATCH /api/v1/chargen/:playerId — staff can update status and notes", OPTS, async () => {
  await cleanup();
  await seedStaff();
  await seedPlayer();

  const app = await getOrCreateApp(PLAYER_ID);
  await chargenApps.update({ id: app.id }, {
    ...app,
    data: { ...app.data, status: "pending" as const, submittedAt: Date.now(), fields: { concept: "Knight" } },
  });

  const { status, data } = await call<{ data: { status: string; notes: string } }>(
    "PATCH", `/api/v1/chargen/${PLAYER_ID}`, STAFF_ID,
    { status: "approved", notes: "Looks good." }
  );
  assertEquals(status, 200);
  assertEquals((data as { data: { status: string } }).data.status, "approved");
  assertEquals((data as { data: { notes: string } }).data.notes, "Looks good.");

  await cleanup();
});

Deno.test("PATCH /api/v1/chargen/:playerId — 400 on invalid status", OPTS, async () => {
  await cleanup();
  await seedStaff();
  await seedPlayer();

  await getOrCreateApp(PLAYER_ID);

  const { status } = await call(
    "PATCH", `/api/v1/chargen/${PLAYER_ID}`, STAFF_ID,
    { status: "invalid-status" }
  );
  assertEquals(status, 400);

  await cleanup();
});

Deno.test("PATCH /api/v1/chargen/:playerId — 400 on invalid JSON", OPTS, async () => {
  await cleanup();
  await seedStaff();
  await seedPlayer();

  await getOrCreateApp(PLAYER_ID);

  const r = new Request(`http://localhost/api/v1/chargen/${PLAYER_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: "not-json",
  });
  const res = await chargenRouteHandler(r, STAFF_ID);
  assertEquals(res.status, 400);

  await cleanup();
});

Deno.test("unknown route — 404", OPTS, async () => {
  const { status } = await call("GET", "/api/v1/chargen/foo/bar/baz", STAFF_ID);
  assertEquals(status, 404);
  await seedStaff();
  await cleanup();
});

// Close DB at end of all tests
Deno.test("cleanup — close DB", OPTS, async () => {
  await DBO.close();
});
