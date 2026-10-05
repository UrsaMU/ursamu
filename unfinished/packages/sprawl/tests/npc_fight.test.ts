import { assertEquals } from "@std/assert";
import { defaultChar } from "../db/schemas.ts";
import {
  ensureSceneNpc,
  hitSceneNpc,
  listSceneNpcs,
} from "../engine/npc-fight.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("NPC DS drops on hit and dies at 0", OPTS, () => {
  let c = defaultChar("Neon");
  c.chargenComplete = true;
  const ens = ensureSceneNpc(c, {
    key: "sprawl-cop",
    name: "Sprawl Cop",
    slug: "sprawl-cop",
    seedDs: 10,
  });
  c = ens.next;
  assertEquals(ens.npc.ds, 10);

  const hit1 = hitSceneNpc(c, "sprawl-cop", 4)!;
  c = hit1.next;
  assertEquals(hit1.before, 10);
  assertEquals(hit1.after, 6);
  assertEquals(hit1.dead, false);
  assertEquals(listSceneNpcs(c)[0]!.ds, 6);

  // Second attack uses reduced DS
  const ens2 = ensureSceneNpc(c, {
    key: "sprawl-cop",
    name: "Sprawl Cop",
    slug: "sprawl-cop",
    seedDs: 10,
  });
  assertEquals(ens2.fresh, false);
  assertEquals(ens2.npc.ds, 6);

  const hit2 = hitSceneNpc(c, "sprawl-cop", 6)!;
  assertEquals(hit2.dead, true);
  assertEquals(hit2.after, 0);
  assertEquals(listSceneNpcs(hit2.next).length, 0);
});

Deno.test("exact hit with 0 margin does not kill", OPTS, () => {
  let c = defaultChar("Neon");
  c = ensureSceneNpc(c, {
    key: "ds-12",
    name: "DS12 foe",
    seedDs: 12,
  }).next;
  const hit = hitSceneNpc(c, "ds-12", 0)!;
  assertEquals(hit.after, 12);
  assertEquals(hit.dead, false);
});
