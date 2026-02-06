import { assertEquals } from "@std/assert";
import { authHandler } from "../src/routes/authRouter.ts";
import { dbojs } from "../src/services/Database/index.ts";
import { hash } from "../deps.ts";

// Mock KV
const kv = await Deno.openKv(":memory:");
// @ts-ignore: Mocking openKv
Deno.openKv = () => Promise.resolve(kv);

Deno.test("Auth Route", async (t) => {
  // Setup: Create a test user
  await t.step("Setup test user", async () => {
    const existing = await dbojs.queryOne({ "data.name": "AuthTestUser" });
    if (!existing) {
      await dbojs.create({
        id: "123",
        flags: "player",
        data: {
          name: "AuthTestUser",
          alias: "authtestuser",
          password: await hash("password123", 10),
        },
      });
    }
  });

  await t.step("Login Success", async () => {
    const req = new Request("http://localhost/api/v1/auth", {
      method: "POST",
      body: JSON.stringify({ username: "AuthTestUser", password: "password123" }),
      headers: { "Content-Type": "application/json" }
    });
    
    const res = await authHandler(req);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(typeof body.token, "string");
  });

  await t.step("Login Failure", async () => {
    const req = new Request("http://localhost/api/v1/auth", {
      method: "POST",
      body: JSON.stringify({ username: "AuthTestUser", password: "wrongpassword" }),
      headers: { "Content-Type": "application/json" }
    });
    
    const res = await authHandler(req);
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "Invalid username or password.");
  });
});
