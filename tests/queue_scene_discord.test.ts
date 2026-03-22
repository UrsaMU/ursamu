/**
 * tests/queue_scene_discord.test.ts
 *
 * Tests for:
 *  - Queue service (enqueue / cancel)
 *  - Scene router (CRUD, /locations, fail-closed lock)
 */
import { assertEquals, assertExists } from "@std/assert";
import { queue } from "../src/services/Queue/index.ts";
import { sceneHandler } from "../src/routes/sceneRouter.ts";
import { dbojs, scenes, DBO } from "../src/services/Database/database.ts";
import { hash } from "../deps.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// Stable IDs to avoid collisions
const U_ID   = "qsd_user1";
const ROOM_ID = "qsd_room1";
const ROOM_ID2 = "qsd_room2";

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

async function cleanupScenes(...ids: string[]) {
  for (const id of ids) await scenes.delete({ id }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

Deno.test("Queue/Scene/Discord — setup fixtures", OPTS, async () => {
  await cleanup(U_ID, ROOM_ID, ROOM_ID2);

  await dbojs.create({
    id: U_ID,
    flags: "player connected",
    data: {
      name: "QsdUser",
      alias: "qsduser",
      password: await hash("pass", 10),
      channels: [
        { id: "ch1", channel: "Public", alias: "pub", active: true },
      ],
    },
  });

  await dbojs.create({
    id: ROOM_ID,
    flags: "room",
    data: { name: "QSD Public Room" },
  });

  await dbojs.create({
    id: ROOM_ID2,
    flags: "room",
    data: { name: "QSD Locked Room", locks: { enter: "admin" } },
  });
});

// ---------------------------------------------------------------------------
// Queue — enqueue / cancel
// ---------------------------------------------------------------------------

Deno.test("Queue — enqueue returns a numeric pid", OPTS, async () => {
  const pid = await queue.enqueue({
    command: "say hello",
    executor: U_ID,
    enactor: U_ID,
  });
  assertEquals(typeof pid, "number");
  // Clean up
  await queue.cancel(pid);
});

Deno.test("Queue — cancel returns true for existing task", OPTS, async () => {
  const pid = await queue.enqueue({
    command: "look",
    executor: U_ID,
    enactor: U_ID,
    delay: 60_000, // far future so it doesn't run during test
  });
  const cancelled = await queue.cancel(pid);
  assertEquals(cancelled, true);
});

Deno.test("Queue — cancel returns false for non-existent pid", OPTS, async () => {
  const result = await queue.cancel(99999999);
  assertEquals(result, false);
});

Deno.test("Queue — enqueue with delay stores task data", OPTS, async () => {
  const pid = await queue.enqueue(
    { command: "score", executor: U_ID, enactor: U_ID, data: { x: 42 } },
    5000
  );
  assertEquals(typeof pid, "number");
  const cancelled = await queue.cancel(pid);
  assertEquals(cancelled, true);
});

// ---------------------------------------------------------------------------
// Scene Router — basic CRUD
// ---------------------------------------------------------------------------

let createdSceneId = "";

Deno.test("Scene — GET /api/v1/scenes returns empty array initially", OPTS, async () => {
  const req = new Request("http://localhost/api/v1/scenes", { method: "GET" });
  const res = await sceneHandler(req, U_ID);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(Array.isArray(body), true);
});

Deno.test("Scene — POST /api/v1/scenes creates a scene", OPTS, async () => {
  const req = new Request("http://localhost/api/v1/scenes", {
    method: "POST",
    body: JSON.stringify({ name: "Test Scene", location: ROOM_ID }),
    headers: { "Content-Type": "application/json" },
  });
  const res = await sceneHandler(req, U_ID);
  assertEquals(res.status, 201);
  const body = await res.json();
  assertExists(body.id);
  assertEquals(body.name, "Test Scene");
  createdSceneId = body.id;
});

Deno.test("Scene — GET /api/v1/scenes/:id returns scene", OPTS, async () => {
  const req = new Request(`http://localhost/api/v1/scenes/${createdSceneId}`, {
    method: "GET",
  });
  const res = await sceneHandler(req, U_ID);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.id, createdSceneId);
});

Deno.test("Scene — GET /api/v1/scenes/nonexistent returns 404", OPTS, async () => {
  const req = new Request("http://localhost/api/v1/scenes/nonexistent_id", {
    method: "GET",
  });
  const res = await sceneHandler(req, U_ID);
  assertEquals(res.status, 404);
});

Deno.test("Scene — POST /api/v1/scenes missing name returns 400", OPTS, async () => {
  const req = new Request("http://localhost/api/v1/scenes", {
    method: "POST",
    body: JSON.stringify({ location: ROOM_ID }),
    headers: { "Content-Type": "application/json" },
  });
  const res = await sceneHandler(req, U_ID);
  assertEquals(res.status, 400);
});

// ---------------------------------------------------------------------------
// Scene Router — /locations endpoint
// ---------------------------------------------------------------------------

Deno.test("Scene — GET /api/v1/scenes/locations is distinct from /:id lookup", OPTS, async () => {
  // /locations is handled before the :id regex, should NOT return 404 or misroute
  const req = new Request("http://localhost/api/v1/scenes/locations", {
    method: "GET",
  });
  const res = await sceneHandler(req, U_ID);
  // Should return 200 with an array, not 404
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(Array.isArray(body), true);
});

Deno.test("Scene — /locations includes public room", OPTS, async () => {
  const req = new Request("http://localhost/api/v1/scenes/locations", {
    method: "GET",
  });
  const res = await sceneHandler(req, U_ID);
  assertEquals(res.status, 200);
  const body = await res.json() as Array<{ id: string; type: string }>;
  const found = body.find((r) => r.id === ROOM_ID);
  assertExists(found);
  assertEquals(found.type, "public");
});

// ---------------------------------------------------------------------------
// Scene Router — fail-closed lock evaluation
// ---------------------------------------------------------------------------

Deno.test("Scene — /locations excludes locked room for non-admin", OPTS, async () => {
  // ROOM_ID2 has lock "admin" and our user is just a player
  const req = new Request("http://localhost/api/v1/scenes/locations", {
    method: "GET",
  });
  const res = await sceneHandler(req, U_ID);
  assertEquals(res.status, 200);
  const body = await res.json() as Array<{ id: string }>;
  // The locked room should not appear for a plain player
  const found = body.find((r) => r.id === ROOM_ID2);
  assertEquals(found, undefined);
});

// ---------------------------------------------------------------------------
// Scene Router — export endpoint
// ---------------------------------------------------------------------------

Deno.test("Scene — GET /api/v1/scenes/:id/export?format=json returns full JSON", OPTS, async () => {
  // Add a pose first so the export has content
  const poseReq = new Request(`http://localhost/api/v1/scenes/${createdSceneId}/pose`, {
    method: "POST",
    body: JSON.stringify({ msg: "Hello world.", type: "pose" }),
    headers: { "Content-Type": "application/json" },
  });
  await sceneHandler(poseReq, U_ID);

  const req = new Request(`http://localhost/api/v1/scenes/${createdSceneId}/export?format=json`, {
    method: "GET",
  });
  const res = await sceneHandler(req, U_ID);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "application/json");
  const body = await res.json();
  assertEquals(body.id, createdSceneId);
  assertEquals(body.name, "Test Scene");
});

Deno.test("Scene — GET /api/v1/scenes/:id/export returns markdown by default", OPTS, async () => {
  const req = new Request(`http://localhost/api/v1/scenes/${createdSceneId}/export`, {
    method: "GET",
  });
  const res = await sceneHandler(req, U_ID);
  assertEquals(res.status, 200);
  const ct = res.headers.get("content-type") ?? "";
  assertEquals(ct.startsWith("text/markdown"), true);
  const text = await res.text();
  // Should contain the scene name as a heading
  assertEquals(text.includes("# Test Scene"), true);
  // Should contain the pose content
  assertEquals(text.includes("Hello world."), true);
});

Deno.test("Scene — GET /api/v1/scenes/nonexistent/export returns 404", OPTS, async () => {
  const req = new Request("http://localhost/api/v1/scenes/no_such_scene/export", {
    method: "GET",
  });
  const res = await sceneHandler(req, U_ID);
  assertEquals(res.status, 404);
});

// ---------------------------------------------------------------------------
// Scene Router — PATCH ownership / validation
// ---------------------------------------------------------------------------

Deno.test("Scene — PATCH /api/v1/scenes/:id missing msg pose returns 400", OPTS, async () => {
  const req = new Request(`http://localhost/api/v1/scenes/${createdSceneId}/pose`, {
    method: "POST",
    body: JSON.stringify({ type: "pose" }), // no msg
    headers: { "Content-Type": "application/json" },
  });
  const res = await sceneHandler(req, U_ID);
  assertEquals(res.status, 400);
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

Deno.test("Queue/Scene/Discord — cleanup", OPTS, async () => {
  await cleanup(U_ID, ROOM_ID, ROOM_ID2);
  if (createdSceneId) await cleanupScenes(createdSceneId);
  await DBO.close();
});
