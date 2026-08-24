/**
 * Contested PC-vs-PC console war (breach their deck).
 */
import type { IUrsamuSDK } from "@ursamu/ursamu";
import type { ISprawlChar } from "../db/schemas.ts";
import { getChar, saveChar } from "./sheet-io.ts";
import {
  consoleSpec,
  removeSoftware,
} from "./net.ts";
import { effectiveCognition } from "./net-state.ts";
import { netOf, withNet } from "./net-state.ts";
import { resolveFastHack } from "./fast-hack.ts";
import { defendConsole } from "./net-hardware.ts";
import {
  immuneAntiPersonnel,
} from "./hull-specials.ts";
import { addPendingGlitch } from "./damage.ts";
import { applyResilience } from "./action.ts";
import { resolveSoftware } from "./net.ts";

function d6(rng: () => number): number {
  return 1 + Math.floor(rng() * 6);
}

export type WarResult = {
  ok: boolean;
  error?: string;
  notes: string[];
  attacker: ISprawlChar;
  defender?: ISprawlChar;
  defenderId?: string;
};

/**
 * Attacker Fast-Hacks defender's Firewall.
 * Breach: heat, glitch, optional soft wipe / neural.
 */
export async function consoleWar(
  u: IUrsamuSDK,
  attacker: ISprawlChar,
  targetName: string,
  rng: () => number = Math.random,
): Promise<WarResult> {
  const notes: string[] = [];
  const atkSpec = consoleSpec(attacker);
  if (!atkSpec) {
    return {
      ok: false,
      error: "equip a console first",
      notes,
      attacker,
    };
  }
  const tObj = await u.util.target(u.me, targetName, true);
  if (!tObj?.flags?.has?.("player")) {
    return {
      ok: false,
      error: "player not found",
      notes,
      attacker,
    };
  }
  if (tObj.id === u.me.id) {
    return {
      ok: false,
      error: "can't war your own deck",
      notes,
      attacker,
    };
  }
  let def = getChar(tObj);
  if (!def?.chargenComplete) {
    return {
      ok: false,
      error: "they have no live sheet",
      notes,
      attacker,
    };
  }
  const defSpec = consoleSpec(def);
  if (!defSpec) {
    return {
      ok: false,
      error: "they have no console equipped",
      notes,
      attacker,
    };
  }

  const fw = defSpec.firewall;
  const cog = effectiveCognition(attacker);
  const roll = resolveFastHack({
    cognition: cog,
    ram: atkSpec.ram,
    bonuses: atkSpec.bonus,
    ds: fw,
  }, rng);
  notes.push(
    `WAR ${atkSpec.slug} → ${defSpec.slug}`,
  );
  notes.push(
    `pool ${roll.diceCount} [${roll.kept.join("+")}]` +
      ` +${roll.bonuses} = ${roll.total} vs FW DS${fw}`,
  );

  let atk = attacker;
  if (!roll.success) {
    notes.push("BREACH FAILED — burned");
    let neural = roll.damageToSelf;
    if (neural > 0) {
      atk = applyResilience(atk, -neural);
      notes.push(`neural ${neural}`);
    }
    // defender Eyes_On
    const dn = netOf(def);
    if (dn.eyesOn) {
      notes.push("their Eyes_On logged the attempt");
      dn.heat = (dn.heat ?? 0) + 1;
      def = withNet(def, dn);
    }
    await saveChar(u, def, tObj.id);
    return {
      ok: true,
      notes,
      attacker: atk,
      defender: def,
      defenderId: tObj.id,
    };
  }

  notes.push("BREACH — inside their deck");
  const held = defendConsole(def, roll.total);
  def = held.next;
  notes.push(...held.notes);

  // Soft wipe 1 program
  const soft = [...(def.software ?? [])];
  if (soft.length) {
    const i = Math.floor(rng() * soft.length);
    const gone = soft[i]!;
    const rm = removeSoftware(def, gone);
    if (!("error" in rm)) {
      def = rm;
      notes.push(`wiped their ${gone}`);
    }
  }

  // Neural ping unless AP-immune (Nimbus)
  if (!immuneAntiPersonnel(defSpec)) {
    def = applyResilience(def, -1);
    def = addPendingGlitch(def, 1);
    notes.push("AP feedback — they take neural 1 + Glitch");
  } else {
    notes.push("their hull shrugs AP feedback (immune-ap)");
  }

  const an = netOf(atk);
  an.lastSoftNote = `war win vs ${tObj.name}`;
  an.heat = (an.heat ?? 0) + 1;
  atk = withNet(atk, an);
  notes.push("heat +1 (hostile deck war)");

  await saveChar(u, def, tObj.id);
  return {
    ok: true,
    notes,
    attacker: atk,
    defender: def,
    defenderId: tObj.id,
  };
}

/**
 * AP software against a player — respects immune-ap.
 */
export async function runApSoftOnPlayer(
  u: IUrsamuSDK,
  attacker: ISprawlChar,
  softSlug: string,
  targetName: string,
  rng: () => number = Math.random,
): Promise<WarResult> {
  const notes: string[] = [];
  const row = resolveSoftware(softSlug);
  if (!row) {
    return {
      ok: false,
      error: "unknown software",
      notes,
      attacker,
    };
  }
  const tags = (row.tags as string[] | undefined) ?? [];
  const effect = String(row.effect ?? "");
  const isAp = tags.includes("anti-personnel") ||
    /stun|drain|seizure|frazzle|quiver|brain/.test(effect);
  if (!isAp) {
    return {
      ok: false,
      error: "not anti-personnel software",
      notes,
      attacker,
    };
  }
  if (!(attacker.software ?? []).includes(row.slug)) {
    return {
      ok: false,
      error: "software not loaded",
      notes,
      attacker,
    };
  }

  const tObj = await u.util.target(u.me, targetName, true);
  if (!tObj?.flags?.has?.("player")) {
    return {
      ok: false,
      error: "player not found",
      notes,
      attacker,
    };
  }
  let def = getChar(tObj);
  if (!def) {
    return {
      ok: false,
      error: "no sheet",
      notes,
      attacker,
    };
  }
  const defSpec = consoleSpec(def);
  if (defSpec && immuneAntiPersonnel(defSpec)) {
    return {
      ok: true,
      notes: [
        `${defSpec.name} is AP-safe — ${row.name} fizzles`,
      ],
      attacker,
      defender: def,
      defenderId: tObj.id,
    };
  }

  // Apply crude AP effect
  const mins = d6(rng);
  if (effect === "stun-hacker-d6" || effect.includes("stun")) {
    const n = netOf(def);
    n.immobileUntil = Date.now() + mins * 60_000;
    def = withNet(def, n);
    notes.push(`${row.name}: stunned ${mins}m`);
  } else if (effect === "drain-cognition") {
    const n = netOf(def);
    n.cogPenalty = (n.cogPenalty ?? 0) + 1;
    n.immobileUntil = Date.now() + nd6(2, rng) * 3_600_000;
    def = withNet(def, n);
    notes.push(`${row.name}: Cog -1, blackout hours`);
  } else {
    def = applyResilience(def, -2);
    def = addPendingGlitch(def, 1);
    notes.push(`${row.name}: neural 2 + Glitch`);
  }

  await saveChar(u, def, tObj.id);
  // burn single-use
  let atk = attacker;
  if (row.multiUse === false) {
    const rm = removeSoftware(atk, row.slug);
    if (!("error" in rm)) atk = rm;
    notes.push(`${row.slug} spent`);
  }
  return {
    ok: true,
    notes,
    attacker: atk,
    defender: def,
    defenderId: tObj.id,
  };
}

function nd6(n: number, rng: () => number): number {
  let t = 0;
  for (let i = 0; i < n; i++) t += d6(rng);
  return t;
}
