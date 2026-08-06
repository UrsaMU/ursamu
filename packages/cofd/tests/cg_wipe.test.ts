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

Deno.test(
  "HTTP wipeChargen self clears approved sheet",
  OPTS,
  async () => {
    const { wipeChargen } = await import(
      "../src/chargen/http.ts"
    );
    const id = "wipe_http_self";
    await dbojs.delete({ id }).catch(() => {});
    await dbojs.create({
      id,
      name: "Selfie",
      flags: "player connected approved admin",
      data: {
        name: "Selfie",
        cofd: {
          template: "vampire",
          concept: "Kindred",
        },
        cofd_cg: {
          stage: 7,
          sheet: { template: "vampire" },
          isSubmitted: true,
          isApproved: true,
        },
      },
    });

    const res = await wipeChargen(id, {});
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);
    assertEquals(body.wiped, true);
    assertEquals(body.started, true);
    assertEquals(body.stage, 1);
    assertEquals(body.canWipe, true);

    const row = await dbojs.queryOne({ id });
    const data = (row as { data?: Record<string, unknown> })
      ?.data ?? {};
    assertEquals(data.cofd, undefined);
    const flags = String(
      (row as { flags?: string }).flags ?? "",
    ).toLowerCase();
    assertEquals(flags.includes("approved"), false);

    await dbojs.delete({ id }).catch(() => {});
  },
);

Deno.test(
  "HTTP wipeChargen rejects approved non-staff self",
  OPTS,
  async () => {
    const { wipeChargen } = await import(
      "../src/chargen/http.ts"
    );
    const id = "wipe_http_player";
    await dbojs.delete({ id }).catch(() => {});
    await dbojs.create({
      id,
      name: "Mortal",
      flags: "player connected approved",
      data: {
        name: "Mortal",
        cofd: { template: "mortal" },
      },
    });

    const res = await wipeChargen(id, {});
    assertEquals(res.status, 403);
    const body = await res.json();
    assertStringIncludes(body.error ?? "", "approved");

    await dbojs.delete({ id }).catch(() => {});
  },
);

Deno.test(
  "HTTP wipeChargen other requires staff + reason",
  OPTS,
  async () => {
    const { wipeChargen } = await import(
      "../src/chargen/http.ts"
    );
    const staffId = "wipe_http_st";
    const vicId = "wipe_http_vic2";
    for (const id of [staffId, vicId]) {
      await dbojs.delete({ id }).catch(() => {});
    }
    await dbojs.create({
      id: staffId,
      name: "ST",
      flags: "player connected wizard",
      data: { name: "ST" },
    });
    await dbojs.create({
      id: vicId,
      name: "Target",
      flags: "player connected approved",
      data: {
        name: "Target",
        cofd: { template: "changeling" },
      },
    });

    const noReason = await wipeChargen(staffId, {
      playerId: vicId,
    });
    assertEquals(noReason.status, 400);

    const ok = await wipeChargen(staffId, {
      playerId: vicId,
      reason: "Chronicle retcon",
    });
    assertEquals(ok.status, 200);
    const body = await ok.json();
    assertEquals(body.ok, true);
    assertEquals(body.wiped, true);

    const row = await dbojs.queryOne({ id: vicId });
    const data = (row as { data?: Record<string, unknown> })
      ?.data ?? {};
    assertEquals(data.cofd, undefined);

    for (const id of [staffId, vicId]) {
      await dbojs.delete({ id }).catch(() => {});
    }
  },
);
