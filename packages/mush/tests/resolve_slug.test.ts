/**
 * Softcode #slug dbref resolution (not only #digits).
 */
import { assertEquals } from "@std/assert";
import { dbojs } from "../src/world/dbobjs.ts";
import { runSoftcodeSimple } from "../src/softcode/engine.ts";
import "../src/softcode/stdlib/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const ID = "slug_room_alpha";

async function wipe(): Promise<void> {
  const prior = await dbojs.queryOne({ id: ID });
  if (prior) await dbojs.delete({ id: ID });
  const a = await dbojs.queryOne({ id: "slug_actor" });
  if (a) await dbojs.delete({ id: "slug_actor" });
}

Deno.test("softcode name(#slug_id) resolves", OPTS, async () => {
  await wipe();
  await dbojs.create({
    id: ID,
    flags: "room",
    data: { name: "Alpha Room" },
  });
  await dbojs.create({
    id: "slug_actor",
    flags: "player connected",
    location: ID,
    data: { name: "SlugActor" },
  });

  const out = await runSoftcodeSimple(
    `[name(#${ID})]`,
    { actorId: "slug_actor", executorId: "slug_actor" },
  );
  assertEquals(out, "Alpha Room");

  const miss = await runSoftcodeSimple(
    "[name(#no_such_slug_zzz)]",
    { actorId: "slug_actor", executorId: "slug_actor" },
  );
  // mushcode name() on missing → empty or #-1
  assertEquals(miss === "" || miss.startsWith("#-1"), true);

  await wipe();
});
