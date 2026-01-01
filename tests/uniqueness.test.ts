import { assertEquals, assertNotEquals } from "@std/assert";
import { dbojs } from "../src/services/Database/index.ts";
import { isNameTaken } from "../src/utils/isNameTaken.ts";

// Mock KV
const kv = await Deno.openKv(":memory:");
// @ts-ignore: Mocking openKv
Deno.openKv = () => Promise.resolve(kv);

Deno.test("Name and Alias Uniqueness", async (t) => {
  // Clear the database for tests
  await dbojs.clear();

  await t.step("Setup: Create a test player", async () => {
    await dbojs.create({
      id: "P1",
      flags: "player",
      data: {
        name: "TestPlayer",
        alias: "tp",
      },
    });
  });

  await t.step("isNameTaken: should find existing name", async () => {
    const taken = await isNameTaken("TestPlayer");
    assertNotEquals(taken, false);
    if (taken) assertEquals(taken.id, "P1");
  });

  await t.step("isNameTaken: should find existing alias", async () => {
    const taken = await isNameTaken("tp");
    assertNotEquals(taken, false);
    if (taken) assertEquals(taken.id, "P1");
  });

  await t.step("isNameTaken: should be case-insensitive", async () => {
    const taken = await isNameTaken("testplayer");
    assertNotEquals(taken, false);
    if (taken) assertEquals(taken.id, "P1");
  });

  await t.step("isNameTaken: should return false for unknown name", async () => {
    const taken = await isNameTaken("Unknown");
    assertEquals(taken, false);
  });

  await t.step("Collision: Name already taken as alias", async () => {
    await dbojs.create({
      id: "P2",
      flags: "player",
      data: {
        name: "OtherPlayer",
        alias: "op",
      },
    });

    const taken = await isNameTaken("tp");
    assertNotEquals(taken, false);
    if (taken) assertEquals(taken.id, "P1");
  });

  await t.step("Login via Alias: isNameTaken should find the correct object", async () => {
    const player = await isNameTaken("tp");
    assertNotEquals(player, false);
    if (player) {
      assertEquals(player.id, "P1");
      assertEquals(player.data?.name, "TestPlayer");
    }
  });
});
