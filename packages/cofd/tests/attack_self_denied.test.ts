// +attack must refuse self-targeting.

import { assertStringIncludes } from "@std/assert";
import { mockPlayer, mockU } from "./helpers/mockU.ts";
import { defaultSheet } from "../src/stats/index.ts";
import { attackExec } from "../src/commands/attack.ts";
import {
  addParticipant,
  createEncounter,
  encounterDb,
} from "../src/combat/encounter.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("+attack refuses self as target", OPTS, async () => {
  const me = mockPlayer({
    id: "p-self",
    name: "Jax",
    location: "room-self",
    state: { cofd: defaultSheet() },
  });

  const enc = await createEncounter("room-self", me.id);
  await addParticipant(enc.id, {
    actorId: me.id,
    name: "Jax",
    kind: "pc",
    initiative: 15,
  });
  await addParticipant(enc.id, {
    actorId: "p-other",
    name: "Bob",
    kind: "pc",
    initiative: 5,
  });

  // Activate encounter with Jax first in order.
  // deno-lint-ignore no-explicit-any
  await encounterDb.update({ id: enc.id } as any, {
    status: "active",
    round: 1,
    turnIdx: 0,
    participants: [
      {
        actorId: me.id,
        name: "Jax",
        kind: "pc",
        initiative: 15,
        appliedDefense: 0,
        isDodging: false,
        isOut: false,
        actionUsed: false,
        movedThisRound: false,
      },
      {
        actorId: "p-other",
        name: "Bob",
        kind: "pc",
        initiative: 5,
        appliedDefense: 0,
        isDodging: false,
        isOut: false,
        actionUsed: false,
        movedThisRound: false,
      },
    ],
  });

  const u = mockU({
    me,
    args: ["", "Jax"],
    targetResult: me as never,
  });
  (u as unknown as { here: { id: string } }).here = {
    id: "room-self",
  };
  u.util.target = () => Promise.resolve(me as never);
  u.cmd.args = ["", "Jax"];

  await attackExec(u);
  assertStringIncludes(
    u._sent.join("\n"),
    "cannot attack yourself",
  );
});
