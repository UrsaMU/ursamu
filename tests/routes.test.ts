/**
 * tests/routes.test.ts
 *
 * HTTP route handler tests:
 *   - authRouter   (register + login)
 *   - dbObjRouter  (GET /dbos, GET /dbobj/:id, PATCH /dbobj/:id)
 *
 * Note: building routes moved to UrsaMU/builder-plugin.
 */
import { assertEquals } from "@std/assert";
import { authHandler } from "../src/routes/authRouter.ts";
import { dbObjHandler } from "../src/routes/dbObjRouter.ts";
import { txtFiles } from "../src/services/commands/cmdParser.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { hash, genSalt } from "../deps.ts";
import { sign } from "../src/services/jwt/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// IDs prefixed to avoid collisions with other test files
const ADMIN_ID  = "rt_admin1";
const OBJ_ID    = "rt_obj1";
const ROOM_ID   = "rt_room1";

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
