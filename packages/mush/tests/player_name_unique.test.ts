/**
 * Player login names must be unique across @name / create / pcreate.
 */
import { assertEquals } from "@std/assert";
import {
  isPlayerNameTaken,
  primaryName,
} from "../src/main_utils.ts";
import { dbojs } from "../src/world/dbobjs.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("primaryName uses first ; segment", OPTS, () => {
  assertEquals(primaryName("Alice;ali"), "Alice");
  assertEquals(primaryName("  Bob  "), "Bob");
});

Deno.test(
  "isPlayerNameTaken finds other players, ignores self",
  OPTS,
  async () => {
    const a = await dbojs.create({
      id: "pn_a",
      flags: "player",
      data: { name: "UniqueAlice" },
    } as never);
    const b = await dbojs.create({
      id: "pn_b",
      flags: "player",
      data: { name: "UniqueBob" },
    } as never);
    try {
      const hit = await isPlayerNameTaken("uniquealice");
      assertEquals(hit?.id, "pn_a");

      const selfOk = await isPlayerNameTaken("UniqueAlice", "pn_a");
      assertEquals(selfOk, undefined);

      const free = await isPlayerNameTaken("UniqueCarol");
      assertEquals(free, undefined);

      // Non-player same name does not block
      await dbojs.create({
        id: "pn_room",
        flags: "room",
        data: { name: "UniqueCarol" },
      } as never);
      const stillFree = await isPlayerNameTaken("UniqueCarol");
      assertEquals(stillFree, undefined);
    } finally {
      await dbojs.delete({ id: "pn_a" });
      await dbojs.delete({ id: "pn_b" });
      await dbojs.delete({ id: "pn_room" });
    }
  },
);
