/**
 * Walker ends when all PCs are out (not only when NPCs are).
 */
import { assertEquals } from "@std/assert";
import {
  allPcsDown,
  allNpcsDown,
  shouldResolveEncounter,
  type Encounter,
  type Participant,
} from "../mod.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function enc(parts: Participant[]): Encounter {
  return {
    id: "e1",
    roomId: "r1",
    round: 2,
    turnIdx: 0,
    status: "active",
    createdAt: 0,
    participants: parts,
  };
}

function p(
  id: string,
  kind: "pc" | "npc",
  isOut: boolean,
): Participant {
  return {
    actorId: id,
    name: id,
    kind,
    initiative: 10,
    isOut,
    appliedDefense: 0,
    isDodging: false,
  };
}

Deno.test("allPcsDown / shouldResolve", OPTS, () => {
  const tpk = enc([
    p("hero", "pc", true),
    p("wolf", "npc", false),
    p("kobold", "npc", false),
  ]);
  assertEquals(allPcsDown(tpk), true);
  assertEquals(allNpcsDown(tpk), false);
  assertEquals(shouldResolveEncounter(tpk), true);

  const win = enc([
    p("hero", "pc", false),
    p("wolf", "npc", true),
  ]);
  assertEquals(allNpcsDown(win), true);
  assertEquals(shouldResolveEncounter(win), true);

  const mid = enc([
    p("hero", "pc", false),
    p("wolf", "npc", false),
  ]);
  assertEquals(shouldResolveEncounter(mid), false);
});
