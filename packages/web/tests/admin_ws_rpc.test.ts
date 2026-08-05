import { assertEquals } from "@std/assert";
import { pathAllowed } from "../src/admin-ws-rpc.ts";

Deno.test("pathAllowed — staff API surfaces", () => {
  assertEquals(pathAllowed("/api/v1/me"), true);
  assertEquals(pathAllowed("/api/v1/wiki"), true);
  assertEquals(pathAllowed("/api/v1/wiki/news/x"), true);
  assertEquals(pathAllowed("/api/v1/jobs"), true);
  assertEquals(pathAllowed("/api/v1/jobs/stats"), true);
  assertEquals(pathAllowed("/api/v1/jobs/12/comment"), true);
  assertEquals(pathAllowed("/api/v1/boards"), true);
  assertEquals(pathAllowed("/api/v1/boards/board-1"), true);
  assertEquals(
    pathAllowed("/api/v1/boards/board-1/posts/3"),
    true,
  );
  assertEquals(pathAllowed("/api/v1/dbos"), true);
  assertEquals(pathAllowed("/api/v1/dbobj/5"), true);
  assertEquals(pathAllowed("/api/v1/players/online"), true);
  assertEquals(pathAllowed("/api/v1/objects"), true);
  assertEquals(pathAllowed("/api/v1/admin/settings"), true);
  assertEquals(pathAllowed("/api/v1/admin/restart"), true);
  assertEquals(pathAllowed("/api/v1/admin/plugins"), true);
  assertEquals(pathAllowed("/api/v1/map/entities"), true);
  assertEquals(pathAllowed("/api/v1/map/prune"), true);
  assertEquals(pathAllowed("/api/v1/mail"), true);
  assertEquals(pathAllowed("/api/v1/mail/stats"), true);
  assertEquals(pathAllowed("/api/v1/mail/all"), true);
  assertEquals(pathAllowed("/api/v1/channels"), true);
  assertEquals(
    pathAllowed("/api/v1/channels/public/history"),
    true,
  );
  assertEquals(pathAllowed("/api/v1/help"), true);
  assertEquals(pathAllowed("/api/v1/help/mail/send"), true);
  assertEquals(
    pathAllowed("/api/v1/map/realm/default/render"),
    true,
  );
});

Deno.test("pathAllowed — rejects escape and foreign APIs", () => {
  assertEquals(pathAllowed("/api/v1/login"), false);
  assertEquals(pathAllowed("/admin/ws"), false);
  assertEquals(pathAllowed("/api/v1/../etc/passwd"), false);
  assertEquals(pathAllowed("/api/v2/wiki"), false);
  assertEquals(pathAllowed("http://evil/api/v1/me"), false);
});
