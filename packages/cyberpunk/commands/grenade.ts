/**
 * +throw -- Throw a grenade from your inventory. Resolves the throw and
 * applies per-target AoE damage / saves to every combatant in the room.
 *
 * Mechanics (CPR Core p.176, errata p.345-347):
 *   - DEX + Athletics vs. DV13 (10m), DV15 (25m).
 *   - Default ammo for grenades = AP (errata p.345). SP halved per target.
 *   - Damage grenades: resolveGrenadeHit() per target in radius.
 *   - Save grenades: resolveAoeSave() per target; on fail, apply effect.
 *
 * NOTE: "In area" currently == "everyone in the same room". Distance-based
 * scatter and partial-radius targeting are a follow-up.
 */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK, IDBObj } from "@ursamu/ursamu";
import type { ICPRCharacter, IGearItem } from "../db/schemas.ts";
import { getWeapon, type IWeaponDef } from "../data/weapons.ts";
import { rollD10Critical } from "../engine/dice.ts";
import { defaultAmmoForWeaponType } from "../data/ammo.ts";
import { effectiveSP, ablateArmorState } from "../engine/combat.ts";
import { applyDamageToChar } from "../engine/character.ts";
import { resolveGrenadeHit, resolveAoeSave } from "../engine/grenade.ts";
import {
  div, val, acc, bad, dim, ARR, ERR, OK, lbl, tbl,
} from "./chargen.ts";

const RANGE_DV_NEAR = 13;

addCmd({
  name: "+throw",
  pattern: /^\+throw\s+(.+?)\s*=\s*(.+)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+throw <grenade>=<target>  -- Throw a grenade at a target or area.

Uses DEX + Athletics vs. DV13 (10m) or DV15 (25m). Default ammo is AP
(halves SP). Frag/biotoxin/rockets deal area damage; sonic/flashbang/
teargas trigger saves. Every combatant in the room is resolved.

Examples:
  +throw frag_grenade=Maelstrom
  +throw flashbang=here`,
  exec: async (u: IUrsamuSDK) => {
    const item = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const tgt  = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    if (!item || !tgt) { u.send(`${ERR}Usage: +throw <grenade>=<target>`); return; }
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }
    await throwGrenade(u, cpr, item, tgt);
  },
});

addCmd({
  name: "+grenade",
  pattern: /^\+grenade\s+(.+?)\s*=\s*(.+)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+grenade <type>=<target>  -- Alias for +throw. See +help grenade.`,
  exec: async (u: IUrsamuSDK) => {
    const item = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const tgt  = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    if (!item || !tgt) { u.send(`${ERR}Usage: +grenade <type>=<target>`); return; }
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }
    await throwGrenade(u, cpr, item, tgt);
  },
});

async function throwGrenade(
  u: IUrsamuSDK, cpr: ICPRCharacter, itemName: string, targetName: string,
): Promise<void> {
  const def = getWeapon(itemName);
  if (!def || !def.thrown) {
    u.send(`${ERR}${val(itemName)} is not a throwable grenade.`); return;
  }
  const gear = cpr.gear ?? [];
  const idx  = gear.findIndex((g: IGearItem) => g.name === def.name);
  if (idx < 0) { u.send(`${ERR}You don't carry a ${val(def.name)}.`); return; }

  const roll = rollD10Critical();
  const attackTotal = cpr.stats.dex + (cpr.skills?.["athletics"] ?? 0) + roll.total;
  const onTarget = attackTotal >= RANGE_DV_NEAR;
  const ammoType = defaultAmmoForWeaponType(def.type);

  // Consume the grenade.
  const updated = [...gear.slice(0, idx), ...gear.slice(idx + 1)];
  await u.db.modify(u.me.id, "$set", { "state.cpr.gear": updated });

  const header = [
    div(),
    `  ${lbl("THROW")}  ${val(def.name)} ${ARR}${val(targetName)}`,
    `  ${lbl("ROLL")}   ${val(String(roll.total))}  ${lbl("TOTAL")} ` +
      `${val(String(attackTotal))}  ${lbl("DV")} ${val(String(RANGE_DV_NEAR))}` +
      `  ${lbl("AMMO")} ${acc(ammoType)}  ${lbl("R")} ${val((def.areaRadius ?? 5) + "m")}`,
    `  ${lbl("RESULT")} ${onTarget ? acc("ON TARGET") : bad("SCATTER")}` +
      (def.aoeSave
        ? `  ${dim(`[${def.aoeSave.effect.toUpperCase()} DV${def.aoeSave.dv} ` +
          `${def.aoeSave.stat.toUpperCase()}]`)}`
        : ""),
  ];

  const targets = await findCombatants(u);
  const rows = await applyAoe(u, def, ammoType, targets);

  u.send([
    ...header,
    ...(rows.length
      ? tbl(
          [
            { label: "TARGET", width: 22 },
            { label: "OUTCOME", width: 12 },
            { label: "RAW", width: 6, align: "right" },
            { label: "SP", width: 5, align: "right" },
            { label: "NET", width: 5, align: "right" },
            { label: "HP", width: 14 },
          ],
          rows,
        )
      : [`  ${dim("No combatants in area.")}`]),
    div(),
  ].join("\r\n"));
  u.send(`${OK}You hurl a ${acc(def.name)} at ${val(targetName)}!`);
}

async function findCombatants(u: IUrsamuSDK): Promise<IDBObj[]> {
  const all = await u.db.search({ location: u.me.location });
  return (all as IDBObj[]).filter((o) => {
    const c = (o.state as { cpr?: ICPRCharacter }).cpr;
    return c?.chargenComplete === true && c.hp.current > 0;
  });
}

async function applyAoe(
  u: IUrsamuSDK, def: IWeaponDef, ammoType: string, targets: IDBObj[],
): Promise<string[][]> {
  const rows: string[][] = [];
  for (const t of targets) {
    const tcpr = (t.state as { cpr?: ICPRCharacter }).cpr;
    if (!tcpr) continue;
    const name = u.util.displayName(t, u.me);
    if (def.aoeSave) {
      rows.push(resolveSaveTarget(tcpr, def, name));
      continue;
    }
    if (def.damageDice > 0) {
      rows.push(await resolveDamageTarget(u, t, tcpr, def, ammoType, name));
    }
  }
  return rows;
}

function resolveSaveTarget(
  tcpr: ICPRCharacter, def: IWeaponDef, name: string,
): string[] {
  const stat = tcpr.stats[def.aoeSave!.stat] ?? 0;
  const save = resolveAoeSave({ saveStatValue: stat, saveDV: def.aoeSave!.dv });
  if (save.success) return [name, dim("SAVED"), "", "", "", ""];
  // Effect persistence is engine/effects.ts territory (other agent owns it).
  return [name, bad(def.aoeSave!.effect.toUpperCase()), "", "", "",
    dim(`r:${save.total}/${def.aoeSave!.dv}`)];
}

async function resolveDamageTarget(
  u: IUrsamuSDK, t: IDBObj, tcpr: ICPRCharacter,
  def: IWeaponDef, ammoType: string, name: string,
): Promise<string[]> {
  const sp = effectiveSP(tcpr, "body");
  const hit = resolveGrenadeHit({
    damageDice: def.damageDice,
    ammoType: ammoType as Parameters<typeof resolveGrenadeHit>[0]["ammoType"],
    defenderSp: sp,
  });
  if (hit.blockedByArmor) {
    return [name, bad("BLOCKED"), "", String(sp), "0", ""];
  }
  if (hit.netDamage <= 0) {
    return [name, dim("NO DMG"), String(hit.rawDamage), String(sp), "0", ""];
  }
  const { char: post } = applyDamageToChar(tcpr, hit.netDamage);
  await u.db.modify(t.id, "$set", {
    "state.cpr.hp": post.hp,
    "state.cpr.woundState": post.woundState,
    "state.cpr.armorBody": ablateArmorState(tcpr.armorBody),
  });
  return [
    name, acc("HIT"),
    String(hit.rawDamage), String(sp), String(hit.netDamage),
    `${post.hp.current}/${post.hp.max}`,
  ];
}
