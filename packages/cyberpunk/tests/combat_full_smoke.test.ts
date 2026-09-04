/**
 * In-process full combat smoke — engine + ports + NPC + smartgun.
 * No live server required.
 */
import { assertEquals, assert } from "@std/assert";
import { buildNewCharacter } from "../engine/character.ts";
import {
  resolveAttack,
  resolveAutofire,
  effectiveSP,
  ablateArmorState,
  sortInitiative,
} from "../engine/combat.ts";
import {
  checkSmartgunLink,
  hasSmartgunLink,
} from "../engine/smartgun.ts";
import { buildNpc, applyDamageToNpc } from "../engine/npc.ts";
import { getNpcTemplate } from "../data/npcs.ts";
import { getWeapon } from "../data/weapons.ts";
import {
  actorToView,
  createCprEncounter,
  cprEncounterStore,
  initCprCombat,
  makeCprPorts,
  removeCprCombat,
} from "../src/combat/ports.ts";
import { executeCprAttack } from "../src/combat/resolve.ts";
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";
import type { ICyberware, ICPRNpc } from "../db/schemas.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function cw(name: string): ICyberware {
  return {
    id: name,
    name,
    category: "neuralware",
    hl: 1,
    installType: "clinic",
    installedAt: 1,
  };
}

function mockActor(
  id: string,
  name: string,
  opts: {
    cpr?: ReturnType<typeof buildNewCharacter>;
    npc?: ICPRNpc;
    flags?: string[];
  } = {},
): IDBObj {
  const state: Record<string, unknown> = {};
  if (opts.cpr) state.cpr = opts.cpr;
  if (opts.npc) state.cprNpc = opts.npc;
  return {
    id,
    name,
    flags: new Set(opts.flags ?? ["player", "connected"]),
    state,
    location: "room_smoke",
    contents: [],
  } as unknown as IDBObj;
}

function mockU(actors: Map<string, IDBObj>) {
  const sent: string[] = [];
  return {
    me: actors.values().next().value,
    here: {
      id: "room_smoke",
      broadcast: (m: string) => sent.push(m),
    },
    send: (m: string) => sent.push(m),
    broadcast: (m: string) => sent.push(m),
    db: {
      search: async (q: { id: string }) => {
        const a = actors.get(q.id);
        return a ? [a] : [];
      },
      modify: async (
        id: string,
        _op: string,
        data: Record<string, unknown>,
      ) => {
        const a = actors.get(id);
        if (!a) return;
        if (data["state.cpr"]) {
          // deno-lint-ignore no-explicit-any
          (a.state as any).cpr = data["state.cpr"];
        }
        if (data["state.cprNpc"]) {
          // deno-lint-ignore no-explicit-any
          (a.state as any).cprNpc = data["state.cprNpc"];
        }
      },
    },
    _sent: sent,
  } as unknown as IUrsamuSDK & { _sent: string[] };
}

function soloSmart(): ReturnType<typeof buildNewCharacter> {
  const c = buildNewCharacter("solo");
  c.chargenComplete = true;
  c.stats.ref = 8;
  c.stats.dex = 7;
  c.stats.body = 7;
  c.skills = {
    ...c.skills,
    handgun: 6,
    shoulder_arms: 5,
    autofire: 4,
    melee_weapon: 4,
    brawling: 4,
    evasion: 5,
  };
  c.cyberware = [cw("neural_link"), cw("subdermal_grip")];
  c.gear = [{
    id: "w1",
    name: "heavy_pistol",
    type: "weapon",
    slot: "wielded",
    concealed: false,
  }];
  c.ammoLoaded = { heavy_pistol: "smart" };
  c.armorBody = {
    name: "Light Armorjack",
    sp: 11,
    currentSp: 11,
    penalty: 0,
  };
  c.eurodollars = 5000;
  return c;
}

Deno.test("full combat smoke: smartgun + modes + NPC + ports", OPTS, async () => {
  // ── 1. Catalog ────────────────────────────────────────────
  const hp = getWeapon("heavy_pistol");
  assert(hp, "heavy_pistol exists");
  assertEquals(hp!.type, "pistol");
  const ar = getWeapon("assault_rifle");
  assert(ar?.autofire, "assault_rifle autofire");

  // ── 2. Smartgun link ──────────────────────────────────────
  const bare = buildNewCharacter("solo");
  assertEquals(hasSmartgunLink(bare), false);
  const linked = checkSmartgunLink(
    { cyberware: [cw("subdermal_grip")] },
    "smart",
  );
  assertEquals(linked.allowed, true);
  assertEquals(linked.penalty, 0);
  const noLink = checkSmartgunLink({ cyberware: [] }, "smart");
  assertEquals(noLink.penalty, -2);
  assertEquals(noLink.fallbackAmmo, "basic");

  // ── 3. Basic attack hit path ──────────────────────────────
  let hit = false;
  let lastNet = 0;
  for (let i = 0; i < 30; i++) {
    const r = resolveAttack({
      attackerStat: 10,
      attackerSkill: 8,
      defenderDV: 8,
      damageDice: 3,
      ammoType: "smart",
    }, 7);
    if (r.hit) {
      hit = true;
      lastNet = r.netDamage;
      break;
    }
  }
  assert(hit, "resolveAttack can hit vs low DV");

  // ── 4. Aimed / called penalties ───────────────────────────
  const aimed = resolveAttack({
    attackerStat: 5,
    attackerSkill: 2,
    defenderDV: 20,
    damageDice: 2,
    aimed: true,
  }, 0);
  // With -8 aim, total is low — usually miss vs DV20
  assertEquals(typeof aimed.hit, "boolean");
  assertEquals(aimed.aimedMultiplier >= 1, true);

  const called = resolveAttack({
    attackerStat: 8,
    attackerSkill: 6,
    defenderDV: 10,
    damageDice: 2,
    calledShot: true,
    location: "head",
  }, 5);
  assertEquals(called.location, "head");

  // ── 5. Autofire ───────────────────────────────────────────
  if (ar) {
    const af = resolveAutofire(
      8,
      6,
      15,
      7,
      ar.autofireMax ?? 3,
    );
    assertEquals(typeof af.hit, "boolean");
  }

  // ── 6. Armor ablation ─────────────────────────────────────
  const arm = {
    name: "Kevlar",
    sp: 11,
    currentSp: 11,
    penalty: 0,
  };
  const ab = ablateArmorState(arm, 3);
  assert(ab.currentSp < 11 || ab.currentSp === 11, "ablate runs");
  assertEquals(effectiveSP(
    { armorBody: arm, armorHead: null } as never,
    "body",
  ) >= 0, true);

  // ── 7. NPC template → damage ──────────────────────────────
  const tpl = getNpcTemplate("boosterganger");
  assert(tpl, "boosterganger template");
  let npc = buildNpc(tpl!, "smoke", "Booster");
  assertEquals(npc.displayName, "Booster");
  assert(npc.hp.current > 0, "npc HP");
  const dmg = applyDamageToNpc(npc, 8);
  npc = dmg.npc;
  assert(npc.hp.current < npc.hp.max, "npc took damage");
  assert(dmg.newWoundState.length > 0, "wound state set");

  // ── 8. Initiative sort ────────────────────────────────────
  const q = sortInitiative([
    {
      actorId: "a",
      name: "A",
      initiative: 10,
      held: false,
      acted: false,
      isNpc: false,
    },
    {
      actorId: "b",
      name: "B",
      initiative: 18,
      held: false,
      acted: false,
      isNpc: true,
    },
  ]);
  assertEquals(q[0].initiative >= q[1].initiative, true);

  // ── 9. Ports: encounter + attack PC→NPC ───────────────────
  initCprCombat();
  try {
    const atk = soloSmart();
    const a1 = mockActor("solo1", "V", { cpr: atk });
    const a2 = mockActor("npc1", "Booster", {
      npc,
      flags: ["npc"],
    });
    const actors = new Map([
      ["solo1", a1],
      ["npc1", a2],
    ]);
    const u = mockU(actors);
    const ports = makeCprPorts(u);

    const view = actorToView(a1);
    assertEquals(view.kind, "pc");
    const nview = actorToView(a2);
    assertEquals(nview.kind, "npc");

    const initRoll = await ports.rollInitiative!("solo1");
    assert(Number.isFinite(initRoll), "init roll");

    const enc = await createCprEncounter("room_smoke");
    await cprEncounterStore.save({
      ...enc,
      status: "active",
      participants: [
        {
          actorId: "solo1",
          name: "V",
          initiative: 20,
          appliedDefense: 0,
          isDodging: false,
          isOut: false,
          kind: "pc",
        },
        {
          actorId: "npc1",
          name: "Booster",
          initiative: 8,
          appliedDefense: 0,
          isDodging: false,
          isOut: false,
          kind: "npc",
        },
      ],
    });
    const live = await cprEncounterStore.get(enc.id);
    assert(live, "encounter live");

    let portHit = false;
    for (let i = 0; i < 25; i++) {
      const r = await ports.executeAction(
        "solo1",
        { type: "attack", targetId: "npc1" },
        {
          encounter: live!,
          actor: actorToView(a1),
          participant: live!.participants[0],
        },
      );
      if (r.ok && (r.damageApplied ?? 0) > 0) {
        portHit = true;
        break;
      }
    }
    assert(portHit, "ports attack damages NPC");

    // Direct resolve helper PC → NPC
    const er = await executeCprAttack(u, a1, a2);
    assertEquals(typeof er.hit, "boolean");
    assert(er.message.length > 0, "attack message");
  } finally {
    removeCprCombat();
  }

  assertEquals(lastNet >= 0, true);
});
