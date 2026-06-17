// +throw command -- CoFD 2e thrown attacks: grenades (AoE) and aerodynamic
// single-target weapons (knives, shuriken, throwing-knives).
//
// Syntax:
//   +throw <item-key> [at <target>]
//   +throw/fratricide <item-key>            Include the thrower in the blast.
//   +throw/into-melee[=<n>] <item-key>      -n dice for bystanders.
//
// Resolution order:
//   1. Active encounter required (for grenades that need participants).
//   2. Must be thrower's turn.
//   3. Resolve item from thrower's inventory (must own it).
//   4. Identify aerodynamic (single target) vs blast (AoE) via tags.
//   5. Roll Dexterity + Athletics (+ /willpower, /into-melee).
//   6. Blast: each participant's Stamina vs successes; apply lethal damage.
//      Single: standard ranged contest against target's Defense.
//   7. Tilts: stunned (stun), knocked-down (knockdown + damage >= Size),
//      blinded (smoke). Burning is announced.
//   8. Destroy the thrown grenade from inventory (consumed).

import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import { type CofdSheet, defaultSheet } from "../stats/index.ts";
import { applyAttackDamage } from "../combat/damage.ts";
import { computeDefense } from "../combat/pools.ts";
import { addTilt } from "../subsystems/tilts.ts";
import {
  applyDefense,
  getEncounterForRoom,
  setActionUsed,
} from "../combat/encounter.ts";
import {
  autoJoinTarget,
  endTurnAndWalk,
  ensureEncounter,
  resolveOrSpawnTarget,
} from "../combat/auto.ts";
import { handleTargetIncapacitated } from "../combat/resolution.ts";
import { executeRoll } from "../roller/index.ts";
import {
  destroyItem,
  inventoryItems,
  itemData,
} from "../equipment/objects.ts";
import { lookupItem, type WeaponEntry } from "../equipment/catalog.ts";
import {
  computeBlastDamage,
  parseWeaponTags,
  type WeaponTags,
} from "../equipment/tags.ts";

function parseIntSwitch(val: string | undefined, min: number, max: number, def: number): number {
  if (!val) return def;
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

/**
 * Resolve a key string against the thrower's inventory.
 * Returns the inventory IDBObj plus its catalog entry, or null when missing.
 */
async function findInventoryItem(
  u: IUrsamuSDK,
  ownerId: string,
  key: string,
): Promise<{ obj: IDBObj; entry: WeaponEntry } | null> {
  const inv = await inventoryItems(u, ownerId);
  const k = key.toLowerCase().trim();
  for (const obj of inv) {
    const d = itemData(obj);
    if (!d) continue;
    if (d.key === k) {
      const resolved = lookupItem(d.key);
      if (!resolved) return null;
      if (resolved.type !== "weapon-ranged" && resolved.type !== "weapon-melee") return null;
      return { obj, entry: resolved.entry as WeaponEntry };
    }
  }
  return null;
}

export async function throwExec(u: IUrsamuSDK) {
  // ---- Switches & args ------------------------------------------------
  const swRaw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  const switches = swRaw ? swRaw.split("/").map((s) => s.trim()).filter(Boolean) : [];
  let fratricide = false;
  let wantWillpower = false;
  let intoMelee = 0;

  for (const sw of switches) {
    if (sw === "fratricide") fratricide = true;
    else if (sw === "willpower" || sw === "wp") wantWillpower = true;
    else if (sw === "cover") {
      u.send("%cyNote:%cn /cover is not implemented yet. (TODO: cover system.)");
      return;
    } else if (sw.startsWith("into-melee")) {
      const eqIdx = sw.indexOf("=");
      intoMelee = eqIdx >= 0 ? parseIntSwitch(sw.slice(eqIdx + 1), 1, 10, 1) : 1;
    } else {
      u.send(`Unknown +throw switch: /${sw}`);
      return;
    }
  }

  if (!rest) {
    u.send("Usage: +throw <item-key> [at <target>]");
    return;
  }

  // Parse "<key>" or "<key> at <target>".
  let itemKey = rest;
  let targetName = "";
  const atMatch = rest.match(/^(\S+)\s+at\s+(.+)$/i);
  if (atMatch) {
    itemKey = atMatch[1].trim();
    targetName = atMatch[2].trim();
  }
  itemKey = itemKey.toLowerCase();

  // ---- Encounter ------------------------------------------------------
  const roomId = u.here?.id ?? "";
  let encounter = roomId ? await getEncounterForRoom(roomId) : null;
  if (!encounter || encounter.status !== "active") {
    encounter = await ensureEncounter(u, u.me);
  }
  if (!encounter) {
    u.send("There is no active combat encounter in this room. Start one with +combat.");
    return;
  }
  const currentActor = encounter.participants[encounter.turnIdx];
  if (!currentActor || currentActor.actorId !== u.me.id) {
    u.send("It is not your turn.");
    return;
  }

  // ---- Inventory --------------------------------------------------------
  const found = await findInventoryItem(u, u.me.id, itemKey);
  if (!found) {
    u.send(`You do not have '${itemKey}' in your inventory.`);
    return;
  }
  const { obj: itemObj, entry } = found;
  const tags: WeaponTags = parseWeaponTags(entry.special);
  const isBlast = tags.blast > 0;

  if (!isBlast && !tags.aerodynamic && !tags.thrown) {
    u.send(`'${entry.name}' is not a thrown weapon.`);
    return;
  }

  // ---- Sheets and pool --------------------------------------------------
  const mySheet: CofdSheet = (u.me.state?.cofd as CofdSheet) ?? defaultSheet();
  const dex = (mySheet.attributes as Record<string, number>)["dexterity"] ?? 1;
  const ath = (mySheet.skills as Record<string, number>)["athletics"] ?? 0;
  let pool = dex + ath;

  // Aerodynamic single-thrown weapons ignore the ranged penalty.
  // We approximate "no range penalty" by default since the encounter room is
  // close-range; non-aerodynamic single throws get -1 for short range.
  let aerodynamicNote = "";
  if (!isBlast && tags.aerodynamic) aerodynamicNote = " [aerodynamic]";

  // /into-melee penalty.
  if (intoMelee > 0) pool -= intoMelee;

  // /willpower
  let spentWp = false;
  if (wantWillpower) {
    if (mySheet.advantages.willpowerCurrent < 1) {
      u.send("You have no Willpower left to spend.");
      return;
    }
    pool += 3;
    spentWp = true;
    await u.db.modify(u.me.id, "$set", {
      "data.cofd": {
        ...mySheet,
        advantages: {
          ...mySheet.advantages,
          willpowerCurrent: mySheet.advantages.willpowerCurrent - 1,
        },
      },
    });
  }

  // ---- Single-target aerodynamic throw -------------------------------
  if (!isBlast) {
    if (!targetName) {
      u.send(`'+throw ${entry.name}' requires 'at <target>'.`);
      return;
    }
    const target = await resolveOrSpawnTarget(u, u.me, targetName);
    if (!target) {
      u.send(`Target '${targetName}' not found.`);
      return;
    }
    if (!(await u.canEdit(u.me, target))) {
      u.send("You do not have permission to apply damage to that target.");
      return;
    }

    await autoJoinTarget(u, encounter, target);

    const targetSheet: CofdSheet = (target.state?.cofd as CofdSheet) ?? defaultSheet();
    let defense = computeDefense(targetSheet);
    const targetPart = encounter.participants.find((p) => p.actorId === target.id);
    if (targetPart) defense = Math.max(0, defense - targetPart.appliedDefense);
    const finalPool = Math.max(0, pool - defense);

    const result = executeRoll(finalPool, { again: tags.again });
    const dmgMod = entry.damage ?? 0;
    const rawHits = result.successes + (result.successes > 0 ? dmgMod : 0);

    let netDamage = 0;
    if (result.successes > 0) {
      const dmg = applyAttackDamage(targetSheet, rawHits, "lethal", 0, 0, false);
      netDamage = dmg.netDamage;
      if (netDamage > 0) {
        await u.db.modify(target.id, "$set", { "data.cofd": dmg.sheet });
        await applyDefense(encounter.id, target.id);
      }
    }

    // Consume the thrown weapon (ammo: clip 1).
    await destroyItem(u, itemObj.id);

    const attacker = u.me.name ?? "Unknown";
    const tName = target.name ?? "Unknown";
    const hitWord = result.successes > 0 ? "hits" : "misses";
    u.broadcast(
      `%cyTHROW>>%cn ${attacker} hurls ${entry.name} at ${tName}: ` +
        `%cw${result.successes}%cn success${result.successes === 1 ? "" : "es"} ${hitWord}` +
        (netDamage > 0 ? ` ${netDamage} lethal` : "") + ".",
    );
    u.send(
      `%cgROLL DETAIL:%cn Dex+Athletics-Def=${finalPool > 0 ? finalPool : "chance"}d ` +
        `(${result.rolls.join(" ")})${aerodynamicNote}` +
        (spentWp ? " [+3 WP]" : "") +
        (result.dramaticFailure ? " %crDRAMATIC FAILURE%cn" : ""),
    );
    if (netDamage > 0 && target.id !== u.me.id) {
      u.send(`%cyINJURED:%cn ${attacker} dealt ${netDamage} lethal damage to you.`, target.id);
    }
    if (netDamage > 0) {
      await handleTargetIncapacitated(u, encounter.id, target.id);
    }
    await setActionUsed(encounter.id, u.me.id, true);
    await endTurnAndWalk(u, encounter.id);
    return;
  }

  // ---- Blast (AoE) throw --------------------------------------------
  // Aim roll: no Defense subtracted -- the grenade is thrown at a zone.
  const finalPool = Math.max(0, pool);
  const result = executeRoll(finalPool, { again: tags.again });
  const successes = result.successes;

  // Build affected target list.
  const others = encounter.participants.filter((p) =>
    fratricide ? true : p.actorId !== u.me.id
  );

  const thrower = u.me.name ?? "Unknown";
  u.broadcast(
    `%cyTHROW>>%cn ${thrower} lobs a ${entry.name}! ` +
      `(%cw${successes}%cn success${successes === 1 ? "" : "es"} to place the blast.)`,
  );
  u.send(
    `%cgROLL DETAIL:%cn Dex+Athletics=${finalPool > 0 ? finalPool : "chance"}d ` +
      `(${result.rolls.join(" ")})` +
      (spentWp ? " [+3 WP]" : "") +
      (intoMelee > 0 ? ` [-${intoMelee} into-melee]` : "") +
      (result.dramaticFailure ? " %crDRAMATIC FAILURE%cn" : ""),
  );

  // Resolve per-target.
  for (const p of others) {
    const arr = await u.db.search({ id: p.actorId } as unknown as Record<string, unknown>);
    const targetObj = arr[0];
    if (!targetObj) continue;
    const tSheet: CofdSheet = (targetObj.state?.cofd as CofdSheet) ?? defaultSheet();
    const stamina = (tSheet.attributes as Record<string, number>)["stamina"] ?? 1;
    const size = tSheet.advantages?.size ?? 5;

    let damage = computeBlastDamage(successes, stamina, tags.force);
    let applied = 0;
    if (damage > 0) {
      // Builder permissions: if attacker cannot edit, skip damage write (still
      // announce). Self always editable.
      const canWrite = p.actorId === u.me.id ? true : await u.canEdit(u.me, targetObj);
      if (canWrite) {
        const dmg = applyAttackDamage(tSheet, damage, "lethal", 0, 0, false);
        applied = dmg.netDamage;
        if (applied > 0) {
          await u.db.modify(targetObj.id, "$set", { "data.cofd": dmg.sheet });
        }
      } else {
        damage = 0; // no write, no announce of damage
      }
    }

    // Tilts on hit (successes > 0 even if no damage, e.g. stun/smoke).
    const tiltsApplied: string[] = [];
    if (successes > 0) {
      let tSheetForTilts = tSheet;
      if (tags.stun) {
        tSheetForTilts = addTilt(tSheetForTilts, "stunned");
        tiltsApplied.push("stunned");
      }
      if (tags.smoke) {
        tSheetForTilts = addTilt(tSheetForTilts, "blinded");
        tiltsApplied.push("blinded");
      }
      if (tags.knockdown && applied >= size && applied > 0) {
        tSheetForTilts = addTilt(tSheetForTilts, "knocked-down");
        tiltsApplied.push("knocked-down");
      }
      if (tiltsApplied.length > 0) {
        const canWrite = p.actorId === u.me.id ? true : await u.canEdit(u.me, targetObj);
        if (canWrite) {
          await u.db.modify(targetObj.id, "$set", { "data.cofd": tSheetForTilts });
        }
      }
    }

    const tName = targetObj.name ?? p.name;
    if (successes <= 0) {
      u.broadcast(`%cyATTACK>>%cn ${tName} dives clear of the blast.`);
    } else {
      const dmgPart = applied > 0 ? `${applied} lethal` : "no damage";
      u.broadcast(
        `%cyATTACK>>%cn ${tName} (Sta ${stamina} vs ${successes}): ${dmgPart}.`,
      );
      // Tilts and burning announce as separate broadcasts so the per-hit
      // line stays under 78 cols even with long target names + multi-tilt.
      if (tags.burning) {
        u.broadcast(`%cy${tName} is burning!%cn`);
      }
      for (const t of tiltsApplied) {
        u.broadcast(`%cy${tName} gains tilt: ${t}%cn`);
      }
      if (applied > 0 && targetObj.id !== u.me.id) {
        u.send(
          `%cyINJURED:%cn ${thrower}'s ${entry.name} dealt ${applied} lethal damage to you.`,
          targetObj.id,
        );
      }
    }
    if (applied > 0) {
      await handleTargetIncapacitated(u, encounter.id, targetObj.id);
    }
  }

  // Consume the grenade.
  await destroyItem(u, itemObj.id);

  await setActionUsed(encounter.id, u.me.id, true);
  await endTurnAndWalk(u, encounter.id);
}
