/**
 * Staff +cg/wipe — full character bit reset.
 */
import {
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { mockU, mockPlayer } from "./helpers/mockU.ts";
import { wipeExec } from "../src/commands/wipe.ts";
import { wipeCharacter } from "../src/chargen/wipe_core.ts";
import { dbojs } from "@ursamu/mush";
import type { CofdCgState } from "../src/chargen/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

async function wireDb(
  target: ReturnType<typeof mockPlayer>,
) {
  await dbojs.delete({ id: target.id }).catch(() => {});
  await dbojs.create({
    id: target.id,
    name: target.name,
    flags: [...target.flags].join(" "),
    data: {
      ...(target.state as Record<string, unknown>),
    },
  });
}

Deno.test(
  "wipeCharacter clears live sheet, draft, approved, sight",
  OPTS,
  async () => {
    const id = "wipe_actor_1";
    await dbojs.delete({ id }).catch(() => {});
    await dbojs.create({
      id,
      name: "Alice",
      flags: "player connected approved fae",
      data: {
        name: "Alice",
        cofd: {
          template: "changeling",
          concept: "Lost",
          attributes: { strength: 3 },
        },
        cofd_cg: {
          stage: 4,
          sheet: { template: "changeling" },
          isSubmitted: true,
          isApproved: false,
        } as CofdCgState,
      },
    });

    const result = await wipeCharacter({
      playerId: id,
      staffId: "99",
      staffName: "Wiz",
      reason: "Rebuild",
      notify: false,
    });
    assertEquals(result.ok, true);
    if (!result.ok) return;
    assertEquals(result.hadLive, true);
    assertEquals(result.hadDraft, true);
    assertEquals(result.wasApproved, true);

    const row = await dbojs.queryOne({ id });
    const data = (row as { data?: Record<string, unknown> })
      ?.data ?? {};
    assertEquals(data.cofd, undefined);
    const cg = data.cofd_cg as CofdCgState;
    assertEquals(!!cg?.sheet, true);
    assertEquals(cg.stage, 1);
    assertEquals(cg.isSubmitted, false);

    const flags = String(
      (row as { flags?: string }).flags ?? "",
    ).toLowerCase();
    assertEquals(flags.includes("approved"), false);
    assertEquals(flags.includes("fae"), false);

    await dbojs.delete({ id }).catch(() => {});
  },
);

Deno.test(
  "wipeExec requires staff and reason for others",
  OPTS,
  async () => {
    const staff = mockPlayer({
      id: "wipe_staff",
      name: "Wiz",
      flags: new Set(["player", "connected", "admin"]),
    });
    const victim = mockPlayer({
      id: "wipe_vic",
      name: "Bob",
      flags: new Set([
        "player",
        "connected",
        "approved",
      ]),
      state: {
        name: "Bob",
        cofd: { template: "mortal" },
      },
    });
    await wireDb(victim);

    const uNoReason = mockU({
      me: staff,
      args: ["wipe", "Bob"],
    });
    uNoReason.util.target = async () => victim as never;
    uNoReason.util.displayName = (o) => o.name ?? "?";
    uNoReason.canEdit = async () => true;
    await wipeExec(uNoReason as never);
    assertStringIncludes(
      (uNoReason as { _sent: string[] })._sent.join("\n"),
      "reason is required",
    );

    const uOk = mockU({
      me: staff,
      args: ["wipe", "Bob=Full rebuild"],
    });
    uOk.util.target = async () => victim as never;
    uOk.util.displayName = (o) => o.name ?? "?";
    uOk.canEdit = async () => true;
    // header/footer may need stubs
    (uOk.util as Record<string, unknown>).center =
      (s: string) => s;
    await wipeExec(uOk as never);
    const out = (uOk as { _sent: string[] })._sent.join("\n");
    assertStringIncludes(out, "Wiped");

    await dbojs.delete({ id: victim.id }).catch(() => {});
    await dbojs.delete({ id: staff.id }).catch(() => {});
  },
);

Deno.test(
  "wipeExec rejects non-staff",
  OPTS,
  async () => {
    const u = mockU({
      me: mockPlayer({
        flags: new Set(["player", "connected"]),
      }),
      args: ["wipe", "Alice=nope"],
    });
    await wipeExec(u as never);
    assertStringIncludes(
      (u as { _sent: string[] })._sent.join("\n"),
      "Permission denied",
    );
  },
);
