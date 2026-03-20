/**
 * tests/routes.test.ts
 *
 * HTTP route handler tests:
 *   - authRouter   (register + login)
 *   - dbObjRouter  (GET /dbos, GET /dbobj/:id, PATCH /dbobj/:id)
 *   - buildingRouter (POST /building/room)
 *   - wikiRouter   (GET /wiki, GET /wiki/:topic)
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { authHandler } from "../src/routes/authRouter.ts";
import { dbObjHandler } from "../src/routes/dbObjRouter.ts";
import { buildingHandler } from "../src/routes/buildingRouter.ts";
import { wikiHandler } from "../src/routes/wikiRouter.ts";
import { txtFiles } from "../src/services/commands/cmdParser.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { hash, genSalt } from "../deps.ts";
import { sign } from "../src/services/jwt/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// IDs prefixed to avoid collisions with other test files
const ADMIN_ID  = "rt_admin1";
const PLAYER_ID = "rt_player1";
const ROOM_ID   = "rt_room1";
const OBJ_ID    = "rt_obj1";

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

// ===========================================================================
// authRouter — register
// ===========================================================================

Deno.test("POST /register — missing fields returns 400", OPTS, async () => {
  const req = new Request("http://localhost/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ username: "OnlyName" }),
    headers: { "Content-Type": "application/json" },
  });
  const res = await authHandler(req);
  assertEquals(res.status, 400);
});

Deno.test("POST /register — creates user and returns token", OPTS, async () => {
  // Pre-clean
  await dbojs.delete({ "data.name": "RegTestUser" }).catch(() => {});

  const req = new Request("http://localhost/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ username: "RegTestUser", password: "pass1234", email: "reg@test.com" }),
    headers: { "Content-Type": "application/json" },
  });
  const res = await authHandler(req);
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(typeof body.token, "string");
  assertEquals(body.name, "RegTestUser");

  // Cleanup
  if (body.id) await cleanup(body.id);
});

Deno.test("POST /register — duplicate username returns 409", OPTS, async () => {
  const pw = await hash("pw", await genSalt(10));
  await dbojs.create({ id: "rt_dup1", flags: "player", data: { name: "DupUser", alias: "dupuser", email: "dup@test.com", password: pw } });

  const req = new Request("http://localhost/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ username: "DupUser", password: "password1", email: "other@test.com" }),
    headers: { "Content-Type": "application/json" },
  });
  const res = await authHandler(req);
  assertEquals(res.status, 409);
  await cleanup("rt_dup1");
});

// ===========================================================================
// authRouter — login (existing from auth.test.ts, add more coverage)
// ===========================================================================

Deno.test("POST /login — wrong method returns 405", OPTS, async () => {
  const req = new Request("http://localhost/api/v1/auth", { method: "GET" });
  const res = await authHandler(req);
  assertEquals(res.status, 405);
});

// ===========================================================================
// dbObjRouter — GET /dbos
// ===========================================================================

Deno.test("GET /dbos — returns list of editable objects", OPTS, async () => {
  const pw = await hash("pw", await genSalt(10));
  await dbojs.create({ id: ADMIN_ID, flags: "player admin connected", data: { name: "RouteAdmin", password: pw } });
  await dbojs.create({ id: OBJ_ID, flags: "thing", data: { name: "TestObject" }, location: ROOM_ID });

  const req = new Request("http://localhost/api/v1/dbos", { method: "GET" });
  const res = await dbObjHandler(req, ADMIN_ID);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(Array.isArray(body), true);
  // Password should be stripped
  body.forEach((obj: Record<string, unknown>) => {
    const data = obj.data as Record<string, unknown> | undefined;
    assertEquals(data?.password, undefined);
  });

  await cleanup(ADMIN_ID, OBJ_ID);
});

Deno.test("GET /dbos — unknown userId returns 404", OPTS, async () => {
  const req = new Request("http://localhost/api/v1/dbos", { method: "GET" });
  const res = await dbObjHandler(req, "rt_nobody");
  assertEquals(res.status, 404);
});

// ===========================================================================
// dbObjRouter — GET /dbobj/:id
// ===========================================================================

Deno.test("GET /dbobj/:id — returns specific object", OPTS, async () => {
  const pw = await hash("pw", await genSalt(10));
  await dbojs.create({ id: ADMIN_ID, flags: "player admin connected", data: { name: "RouteAdmin2", password: pw } });
  await dbojs.create({ id: OBJ_ID, flags: "thing", data: { name: "SpecificObj" } });

  const req = new Request(`http://localhost/api/v1/dbobj/${OBJ_ID}`, { method: "GET" });
  const res = await dbObjHandler(req, ADMIN_ID);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.id, OBJ_ID);

  await cleanup(ADMIN_ID, OBJ_ID);
});

Deno.test("GET /dbobj/:id — object not found returns 404", OPTS, async () => {
  const pw = await hash("pw", await genSalt(10));
  await dbojs.create({ id: ADMIN_ID, flags: "player admin connected", data: { name: "RouteAdmin3", password: pw } });

  const req = new Request("http://localhost/api/v1/dbobj/rt_nonexistent", { method: "GET" });
  const res = await dbObjHandler(req, ADMIN_ID);
  assertEquals(res.status, 404);

  await cleanup(ADMIN_ID);
});

// ===========================================================================
// dbObjRouter — PATCH /dbobj/:id
// ===========================================================================

Deno.test("PATCH /dbobj/:id — updates data fields", OPTS, async () => {
  const pw = await hash("pw", await genSalt(10));
  await dbojs.create({ id: ADMIN_ID, flags: "player admin connected", data: { name: "RouteAdmin4", password: pw } });
  await dbojs.create({ id: OBJ_ID, flags: "thing", data: { name: "OldName" } });

  const req = new Request(`http://localhost/api/v1/dbobj/${OBJ_ID}`, {
    method: "PATCH",
    body: JSON.stringify({ data: { name: "NewName" } }),
    headers: { "Content-Type": "application/json" },
  });
  const res = await dbObjHandler(req, ADMIN_ID);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data?.name, "NewName");
  // Password should still be stripped
  assertEquals(body.data?.password, undefined);

  await cleanup(ADMIN_ID, OBJ_ID);
});

// ===========================================================================
// buildingRouter — POST /building/room
// ===========================================================================

Deno.test("POST /building/room — non-builder returns 403", OPTS, async () => {
  const pw = await hash("pw", await genSalt(10));
  await dbojs.create({ id: PLAYER_ID, flags: "player connected", data: { name: "PlainPlayer", password: pw } });

  const req = new Request("http://localhost/api/v1/building/room", {
    method: "POST",
    body: JSON.stringify({ name: "My Room" }),
    headers: { "Content-Type": "application/json" },
  });
  const res = await buildingHandler(req, PLAYER_ID);
  assertEquals(res.status, 403);

  await cleanup(PLAYER_ID);
});

Deno.test("POST /building/room — builder creates room", OPTS, async () => {
  await dbojs.create({ id: ADMIN_ID, flags: "player builder connected", data: { name: "BuilderUser" } });

  const req = new Request("http://localhost/api/v1/building/room", {
    method: "POST",
    body: JSON.stringify({ name: "New Room", description: "A test room." }),
    headers: { "Content-Type": "application/json" },
  });
  const res = await buildingHandler(req, ADMIN_ID);
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.data?.name, "New Room");
  assertStringIncludes(body.flags, "room");

  await cleanup(ADMIN_ID, body.id);
});

Deno.test("POST /building/room — missing name returns 400", OPTS, async () => {
  await dbojs.create({ id: ADMIN_ID, flags: "player admin connected", data: { name: "BuildAdmin" } });

  const req = new Request("http://localhost/api/v1/building/room", {
    method: "POST",
    body: JSON.stringify({ description: "No name" }),
    headers: { "Content-Type": "application/json" },
  });
  const res = await buildingHandler(req, ADMIN_ID);
  assertEquals(res.status, 400);

  await cleanup(ADMIN_ID);
});

Deno.test("POST /building/room — unknown route returns 404", OPTS, async () => {
  const req = new Request("http://localhost/api/v1/building/exit", {
    method: "POST",
    body: JSON.stringify({ name: "East" }),
    headers: { "Content-Type": "application/json" },
  });
  const res = await buildingHandler(req, ADMIN_ID);
  assertEquals(res.status, 404);
});

// ===========================================================================
// wikiRouter — GET /wiki and GET /wiki/:topic
// ===========================================================================

Deno.test("GET /wiki — returns list of loaded topics", OPTS, async () => {
  // Seed a topic directly in the in-memory txtFiles Map
  txtFiles.set("test_topic.txt", "This is a test topic.");

  const req = new Request("http://localhost/api/v1/wiki");
  const res = wikiHandler(req);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(Array.isArray(body), true);
  assertEquals(body.includes("test_topic.txt"), true);
});

Deno.test("GET /wiki/:topic — returns topic content", OPTS, async () => {
  txtFiles.set("test_topic.txt", "This is a test topic.");

  const req = new Request("http://localhost/api/v1/wiki/test_topic.txt");
  const res = wikiHandler(req);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.topic, "test_topic.txt");
  assertStringIncludes(body.content, "test topic");
});

Deno.test("GET /wiki/:topic — unknown topic returns 404", OPTS, () => {
  const req = new Request("http://localhost/api/v1/wiki/nonexistent_topic.txt");
  const res = wikiHandler(req);
  assertEquals(res.status, 404);
});

Deno.test("GET /wiki/:topic — URL-decoded topic name", OPTS, async () => {
  txtFiles.set("help/connect.txt", "Connect help content.");

  const req = new Request("http://localhost/api/v1/wiki/help%2Fconnect.txt");
  const res = wikiHandler(req);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertStringIncludes(body.content, "Connect help");
});

// ===========================================================================
// JWT sign utility used by auth routes
// ===========================================================================

Deno.test("sign — generates verifiable JWT token", OPTS, async () => {
  const { verify } = await import("../src/services/jwt/index.ts");
  const token = await sign({ id: "test123" });
  assertEquals(typeof token, "string");
  const payload = await verify(token);
  assertEquals(payload.id, "test123");
});

// ===========================================================================
// Cleanup
// ===========================================================================
Deno.test("cleanup — close DB", OPTS, async () => {
  txtFiles.clear();
  await DBO.close();
});
