import { assertEquals } from "@std/assert";
import type { Encounter } from "../src/types.ts";
import type { EncounterStore } from "../src/store.ts";
import {
  findActiveEncounterRoom,
  roomHasActiveEncounter,
} from "../src/zone-query.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function enc(
  roomId: string,
  status: Encounter["status"],
  kinds: Array<"pc" | "npc">,
): Encounter {
  return {
    id: `e-${roomId}`,
    roomId,
    round: 1,
    turnIdx: 0,
    status,
    createdAt: 1,
    participants: kinds.map((kind, i) => ({
      actorId: `${kind}${i}`,
      name: `${kind}${i}`,
      kind,
      initiative: 10 - i,
      appliedDefense: 0,
      isDodging: false,
      isOut: false,
    })),
  };
}

function memStore(rows: Encounter[]): EncounterStore {
  return {
    async get(id) {
      return rows.find((e) => e.id === id) ?? null;
    },
    async create() {},
    async save() {},
    async findInRoom(roomId) {
      const hit = rows.filter(
        (e) =>
          e.roomId === roomId &&
          (e.status === "intent" || e.status === "active"),
      );
      return (
        hit.find((e) => e.status === "active") ?? hit[0] ?? null
      );
    },
    async advanceTurn() {
      return null;
    },
    async patchParticipant() {
      return null;
    },
  };
}

Deno.test("roomHasActiveEncounter", OPTS, async () => {
  const store = memStore([
    enc("r1", "active", ["pc", "npc"]),
    enc("r2", "intent", ["pc"]),
  ]);
  assertEquals(
    await roomHasActiveEncounter("r1", { store }),
    true,
  );
  assertEquals(
    await roomHasActiveEncounter("r2", { store }),
    false,
  );
  assertEquals(
    await roomHasActiveEncounter("r3", { store }),
    false,
  );
});

Deno.test("findActiveEncounterRoom prefers PC fights", OPTS, async () => {
  const store = memStore([
    enc("r0", "active", ["npc", "npc"]),
    enc("r1", "active", ["pc", "npc"]),
  ]);
  const hit = await findActiveEncounterRoom(["r0", "r1"], {
    store,
  });
  assertEquals(hit?.roomId, "r1");
});

Deno.test("findActiveEncounterRoom requirePc false", OPTS, async () => {
  const store = memStore([enc("r0", "active", ["npc"])]);
  const hit = await findActiveEncounterRoom(["r0"], {
    store,
    requirePc: false,
  });
  assertEquals(hit?.roomId, "r0");
});
