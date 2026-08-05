import { assertEquals } from "@std/assert";
import {
  scrubObject,
  objectTypeFromFlags,
} from "../src/admin-ws-objects.ts";

Deno.test("scrubObject — strips secret data keys", () => {
  const out = scrubObject({
    id: "1",
    flags: "player",
    data: {
      name: "Ada",
      password: "secret",
      passwordHash: "x",
      moniker: "A",
    },
  });
  const d = out.data as Record<string, unknown>;
  assertEquals(d.name, "Ada");
  assertEquals(d.moniker, "A");
  assertEquals(d.password, undefined);
  assertEquals(d.passwordHash, undefined);
});

Deno.test("objectTypeFromFlags", () => {
  assertEquals(objectTypeFromFlags("player connected"), "player");
  assertEquals(objectTypeFromFlags("room"), "room");
  assertEquals(objectTypeFromFlags(new Set(["exit"])), "exit");
  assertEquals(objectTypeFromFlags("thing"), "thing");
});
