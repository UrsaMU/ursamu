// +attack command -- CoFD 2e combat attack resolution.
//
// Syntax:
//   +attack <target>[/<switches>]
//
// Switches (stackable):
//   /unarmed /melee /ranged /thrown   -- pool override
//   /all-out                          -- +2, attacker loses Defense
//   /charge                           -- +2, attacker loses Defense
//   /aim                              -- bank +1 aim (max 3) for /ranged
//   /offhand                          -- -2
//   /pull[=<max>]                     -- pulling blow (cap damage)
//   /head /arm /leg /hand /eye /heart /torso  -- specified target
//   /burst-short /burst-med /burst-long       -- autofire
//   /into-melee[=<n>]                 -- bystanders to avoid
//   /target-prone /target-surprised   -- target state
//   /willpower                        -- spend 1 WP for +3 dice
//   /no-ammo                          -- skip ammo decrement (ST override)
//
// Resolution order:
//   1. Active encounter required
//   2. Must be attacker's turn
//   3. Target lookup
//   4. Determine pool type from weapon or switch
//   5. Compute Defense (lower of Dex/Wits + Athletics)
//   6. Build modifiers
//   7. Apply willpower (+3 dice)
//   8. Decrement firearm ammo
//   9. Roll
//  10. Apply damage, tilts, beaten-down / unconscious
//  11. Increment encounter appliedDefense for target
//  12. Output

import type { IUrsamuSDK, IDBObj } from "@ursamu/ursamu";
import { type CofdSheet, defaultSheet } from "../stats/index.ts";
import type { AttackOptions } from "../combat/modifiers.ts";
import { heavyHitterBonus } from "../combat/modifiers.ts";
import { buildPool, computeDefense, type AttackPoolType } from "../combat/pools.ts";
import { applyAttackDamage } from "../combat/damage.ts";
import { checkSpecifiedTargetTilts } from "../combat/tilts.ts";
import { addTilt } from "../subsystems/tilts.ts";
import {
  getEncounterForRoom,
  applyDefense,
  applySuppression,
  setActionUsed,
  setBeatenDown,
  setMoved,
  setSurrendered,
} from "../combat/encounter.ts";
import { getCoverDurability } from "../combat/types.ts";
import { handleTargetIncapacitated } from "../combat/resolution.ts";
import { executeRoll } from "../roller/index.ts";
import {
  damageItem,
  displayName,
  equippedWeaponEntry,
  equippedArmorEntry,
  fireShots,
  isCofdItem,
  itemData,
  parseWeaponTags,
} from "../equipment/index.ts";
import {
  ensureEncounter,
  autoJoinTarget,
  resolveOrSpawnTarget,
  endTurnAndWalk,
} from "../combat/auto.ts";

/**
 * Pass 2: callable entry point used by the AI walker so an NPC can attack
 * without going through MUSH command parsing. Inputs:
 *   - argString: "<target>" or "<target>/switch1/switch2..."
 * The function mutates u.cmd.args, defers to attackExec, then restores the
 * original args. Safe for synthetic NPC SDKs that proxy `send` to broadcast.
 */
export async function executeAttack(
  u: IUrsamuSDK,
  argString: string,
): Promise<void> {
  // deno-lint-ignore no-explicit-any
  const orig = (u as any).cmd;
  // deno-lint-ignore no-explicit-any
  (u as any).cmd = {
    name: "+attack",
    original: `+attack ${argString}`,
    args: ["", argString],
    switches: [],
  };
  try {
    await attackExec(u);
  } finally {
    // deno-lint-ignore no-explicit-any
    (u as any).cmd = orig;
  }
}

/** Helper: parse an integer from a switch value string, clamped to range. */
function parseIntSwitch(val: string | undefined, min: number, max: number, def: number): number {
  if (!val) return def;
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

export async function attackExec(u: IUrsamuSDK) {
  // Accepts both syntaxes:
  //   +attack <target>[/<switch>...]            (target first)
  //   +attack/<switch> <target>[/<switch>...]   (switch first, MUSH convention)
  const leadSwitch = (u.cmd.args[0] ?? "").trim();
  const tail = (u.cmd.args[1] ?? "").trim();
  let rawArgs: string;
  if (leadSwitch && tail) {
    // Switch-first form: args[0]=switch, args[1]=target[/switches...]
    const slashIdx = tail.indexOf("/");
    rawArgs = slashIdx >= 0
      ? `${tail.slice(0, slashIdx)}/${leadSwitch}${tail.slice(slashIdx)}`
      : `${tail}/${leadSwitch}`;
  } else if (tail) {
    // Pattern matched no switch; args[1] holds the legacy <target>[/<switches>].
    rawArgs = tail;
  } else {
    // Direct callers (or older mocks) pass everything in args[0].
    rawArgs = leadSwitch;
  }
  const rest = u.util.stripSubs(rawArgs).trim();

  if (!rest) {
    u.send("Usage: +attack <target>[/<switches>]  e.g. +attack Bob/melee/all-out");
    return;
  }

  // Parse "<target>[/<switch>[/<switch>...]]" from the single arg.
  // Switches are everything after the first "/" that contains no spaces.
  // Target name may not contain "/".
  const slashIdx = rest.indexOf("/");
  let targetName = slashIdx >= 0 ? rest.slice(0, slashIdx).trim() : rest;
  const switchStr = slashIdx >= 0 ? rest.slice(slashIdx + 1) : "";
  const rawSwitches = switchStr
    ? switchStr.split("/").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];

  targetName = u.util.stripSubs(targetName).trim();
  if (!targetName) {
    u.send("Usage: +attack <target>[/<switches>]");
    return;
  }

  // ---- Object-target soak path ---------------------------------------
  // If the target is a CoFD item (not a PC), apply attacker pool vs item
  // Durability and chip Structure with damageItem(). Skip the PC-vs-PC flow.
  const earlyTarget = await u.util.target(u.me, targetName, true);
  if (earlyTarget && isCofdItem(earlyTarget)) {
    // Scope: item must be on the floor of this room, or carried by someone
    // currently in this room. No cross-room reach.
    const myRoomId = u.here?.id;
    const itemLoc = (earlyTarget as { location?: string }).location;
    const onFloor = !!myRoomId && itemLoc === myRoomId;
    const occupants = (u.here?.contents ?? []) as Array<{ id: string }>;
    const carriedHere = !!itemLoc && occupants.some((o) => o && o.id === itemLoc);
    if (!onFloor && !carriedHere) {
      u.send("You cannot reach that from here.");
      return;
    }
    await attackObject(u, earlyTarget);
    return;
  }

  // ---- Encounter check ------------------------------------------------
  const roomId = u.here?.id ?? "";
  let encounter = roomId ? await getEncounterForRoom(roomId) : null;
  if (!encounter || encounter.status !== "active") {
    encounter = await ensureEncounter(u, u.me);
    if (!encounter) {
      u.send("There is no active combat encounter in this room. Start one with +combat.");
      return;
    }
  }

  // Must be your turn.
  const currentActor = encounter.participants[encounter.turnIdx];
  if (!currentActor || currentActor.actorId !== u.me.id) {
    u.send("It is not your turn.");
    return;
  }
  // Action economy: one instant action per turn. Doesn't apply to /aim
  // which short-circuits below before reaching the resolver, or to
  // reflexive actions handled by +combat.
  if (currentActor.actionUsed) {
    u.send("You already used your instant action this turn. Use +combat/next to end your turn.");
    return;
  }

  // Multi-target burst: targets separated by "=".
  const targetNames = targetName.includes("=")
    ? targetName.split("=").map((s) => s.trim()).filter(Boolean)
    : [targetName];

  // ---- Parse switches -------------------------------------------------
  let poolOverride: AttackPoolType | undefined;
  let allOut = false;
  let charge = false;
  let offhand = false;
  let pulling: { max: number } | undefined;
  let burstShort = false;
  let burstMed = false;
  let burstLong = false;
  let suppress = false;
  let intoMeleeCount: number | undefined;
  let targetProne = false;
  let targetSurprised = false;
  let wantWillpower = false;
  let skipAmmo = false;
  let doAim = false;
  let specified: AttackOptions["specified"];
  let aimBankVal: number | undefined;

  for (const sw of rawSwitches) {
    if (sw === "unarmed") poolOverride = "unarmed";
    else if (sw === "melee") poolOverride = "melee";
    else if (sw === "ranged") poolOverride = "ranged";
    else if (sw === "thrown") poolOverride = "thrown";
    else if (sw === "all-out" || sw === "allout") allOut = true;
    else if (sw === "charge") charge = true;
    else if (sw === "aim") doAim = true;
    else if (sw === "offhand") offhand = true;
    else if (sw.startsWith("pull")) {
      const eqIdx = sw.indexOf("=");
      const max = eqIdx >= 0 ? parseIntSwitch(sw.slice(eqIdx + 1), 1, 99, 1) : 1;
      pulling = { max };
    } else if (sw === "burst-short") burstShort = true;
    else if (sw === "burst-med") burstMed = true;
    else if (sw === "burst-long") burstLong = true;
    else if (sw === "suppress") { suppress = true; burstLong = true; }
    else if (sw.startsWith("into-melee")) {
      const eqIdx = sw.indexOf("=");
      intoMeleeCount = eqIdx >= 0 ? parseIntSwitch(sw.slice(eqIdx + 1), 1, 10, 1) : 1;
    } else if (sw === "target-prone") targetProne = true;
    else if (sw === "target-surprised") targetSurprised = true;
    else if (sw === "willpower" || sw === "wp") wantWillpower = true;
    else if (sw === "no-ammo") skipAmmo = true;
    else if (sw === "head") specified = "head";
    else if (sw === "arm") specified = "arm";
    else if (sw === "leg") specified = "leg";
    else if (sw === "hand") specified = "hand";
    else if (sw === "eye") specified = "eye";
    else if (sw === "heart") specified = "heart";
    else if (sw === "torso") specified = "torso";
    else {
      u.send(`Unknown attack switch: /${sw}`);
      return;
    }
  }

  // ---- Attacker sheet -------------------------------------------------
  const mySheet: CofdSheet = (u.me.state?.cofd as CofdSheet) ?? defaultSheet();

  // ---- Aim banking (/aim stores for next ranged attack) ---------------
  const aimState = (u.me.state?.cofd_aim as { banked: number } | undefined) ?? { banked: 0 };
  if (doAim) {
    const newBanked = Math.min(3, aimState.banked + 1);
    await u.db.modify(u.me.id, "$set", { "data.cofd_aim": { banked: newBanked } });
    u.send(`%cgAim banked.%cn You now have +${newBanked} aim bonus for your next ranged attack.`);
    return;
  }
  const aimBonus = poolOverride === "ranged" ? aimState.banked : 0;
  if (aimBonus > 0) {
    // Consume aim after use.
    aimBankVal = aimBonus;
    await u.db.modify(u.me.id, "$set", { "data.cofd_aim": { banked: 0 } });
  }

  // ---- Weapon info ----------------------------------------------------
  const equippedWeaponId = mySheet.equipment?.equippedWeapon ?? null;
  const weaponInfo = await equippedWeaponEntry(u, equippedWeaponId);
  const weaponTags = parseWeaponTags(weaponInfo?.entry?.special);

  if (offhand && weaponTags.twoHanded) {
    u.send("You cannot use /offhand with a two-handed weapon.");
    return;
  }

  const wantsBurst = burstShort || burstMed || burstLong;
  if (wantsBurst && !weaponTags.autofire) {
    u.send("Your equipped weapon does not support autofire bursts.");
    return;
  }

  // Determine pool type.
  let poolType: AttackPoolType;
  if (poolOverride) {
    poolType = poolOverride;
  } else if (weaponInfo) {
    // Infer from the catalog type embedded in the lookup result.
    // equippedWeaponEntry only returns weapon-ranged and weapon-melee types.
    const key = weaponInfo.entry.key ?? "";
    // We need the catalog type. Look it up again for type.
    const { lookupItem } = await import("../equipment/catalog.ts");
    const resolved = lookupItem(key);
    poolType = resolved?.type === "weapon-ranged" ? "ranged" : "melee";
  } else {
    poolType = "unarmed";
  }

  const isFirearm = poolType === "ranged";

  // ---- Validate target count vs burst type ---------------------------
  const isMultiTargetBurst = burstMed || burstLong;
  if (!isMultiTargetBurst && targetNames.length > 1) {
    u.send("Multiple targets are only allowed with /burst-med or /burst-long.");
    return;
  }
  const maxTargets = isMultiTargetBurst ? 3 : 1;
  if (targetNames.length > maxTargets) {
    u.send(`Too many targets: max ${maxTargets} for this burst.`);
    return;
  }

  // ---- Resolve all targets -------------------------------------------
  const targets: IDBObj[] = [];
  for (const name of targetNames) {
    const t = await resolveOrSpawnTarget(u, u.me, name);
    if (!t) { u.send(`Target '${name}' not found.`); return; }
    await autoJoinTarget(u, encounter, t);
    // Surrender refusal: cannot target a participant who has surrendered.
    const tp = encounter.participants.find((p) => p.actorId === t.id);
    if (tp?.surrendered) {
      u.send(`${t.name ?? "Target"} has surrendered; deliberate violation requires Storyteller approval.`);
      return;
    }
    if (!(await u.canEdit(u.me, t))) {
      u.send(`You do not have permission to apply damage to ${name}.`);
      return;
    }
    targets.push(t);
  }

  // Charge feasibility: can't charge after already moving this round.
  const myParticipant = encounter.participants.find((p) => p.actorId === u.me.id);
  if (charge && myParticipant?.movedThisRound) {
    u.send("You already moved; you can't charge.");
    return;
  }

  // Suppressive fire: own branch, no damage, applies pin to all others.
  if (suppress) {
    if (!isFirearm || !weaponInfo) {
      u.send("Suppressive fire requires an equipped firearm.");
      return;
    }
    if (!weaponTags.autofire) {
      u.send("This weapon cannot perform suppressive fire (no autofire).");
      return;
    }
    if (!skipAmmo && equippedWeaponId) {
      const remaining = await fireShots(u, equippedWeaponId, 20);
      if (remaining === null) {
        u.send("Not enough ammo (need 20 rounds for suppressive fire).");
        return;
      }
    }
    const dex = (mySheet.attributes as Record<string, number>).dexterity ?? 1;
    const firearms = (mySheet.skills as Record<string, number>).firearms ?? 0;
    const pool = dex + firearms + 3;
    const result = executeRoll(Math.max(0, pool));
    await applySuppression(encounter.id, u.me.id);
    await setActionUsed(encounter.id, u.me.id, true);
    await endTurnAndWalk(u, encounter.id);
    const attackerName = u.me.name ?? "Unknown";
    u.broadcast(
      `%cySUPPRESS>>%cn ${attackerName} lays down suppressive fire ` +
        `(${pool}d): %cw${result.successes}%cn success` +
        `${result.successes === 1 ? "" : "es"}. All others are pinned.`,
    );
    return;
  }

  // Pinned attackers take -2 dice to any aggressive action.
  const isPinned = !!(myParticipant?.pinnedBy && myParticipant.pinnedBy !== u.me.id);

  // ---- Willpower (once per attack) ------------------------------------
  let extraDice = 0;
  let spentWp = false;
  if (wantWillpower) {
    if (mySheet.advantages.willpowerCurrent < 1) {
      u.send("You have no Willpower left to spend.");
      return;
    }
    extraDice = 3;
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

  // ---- Aim bonus ------------------------------------------------------
  if (aimBankVal) {
    extraDice += aimBankVal;
  }

  // ---- Pinned penalty -------------------------------------------------
  if (isPinned) extraDice -= 2;

  // ---- Movement / surrender bookkeeping ------------------------------
  if (charge && myParticipant) {
    await setMoved(encounter.id, u.me.id, true);
  }
  if (myParticipant?.surrendered) {
    await setSurrendered(encounter.id, u.me.id, false);
  }

  // ---- Ammo decrement (once per burst, cost depends on burst type) ----
  if (isFirearm && !skipAmmo && equippedWeaponId) {
    const ammoCost = burstLong ? 20 : burstMed ? 10 : burstShort ? 3 : 1;
    const remaining = await fireShots(u, equippedWeaponId, ammoCost);
    if (remaining === null) {
      u.send(`Your firearm has insufficient ammo for this burst (need ${ammoCost}). Reload with +gear/reload.`);
      return;
    }
  }

  // ---- Per-target attack resolution -----------------------------------
  const attackerName = u.me.name ?? "Unknown";
  const damageType: "bashing" | "lethal" = isFirearm ? "lethal" : "bashing";

  for (const target of targets) {
    let finalTarget = target;
    const tp = encounter.participants.find((p) => p.actorId === target.id);
    let finalTp = tp;

    // Take Cover redirection: ranged attacks made against the holder automatically hit the victim.
    const targetGrapple = target.state?.cofd_grapple as { grappleWith: string | null } | undefined;
    const partnerId = targetGrapple?.grappleWith;
    if (tp?.isUsingAsCover && partnerId && (poolType === "ranged" || poolType === "thrown")) {
      const partner = await u.util.target(u.me, partnerId, true);
      if (partner) {
        finalTarget = partner;
        finalTp = encounter.participants.find((p) => p.actorId === partner.id);
        u.broadcast(
          `%cyCOVER>>%cn ${target.name ?? "Unknown"} uses ${partner.name ?? "Unknown"} as a human shield! The attack is redirected!`
        );
      }
    }

    const targetSheet: CofdSheet = (finalTarget.state?.cofd as CofdSheet) ?? defaultSheet();
    let targetDefense = computeDefense(targetSheet);

    // Applied defense from prior attacks this round.
    if (finalTp) targetDefense = Math.max(0, targetDefense - finalTp.appliedDefense);

    let dodging = false;
    let dodgeSuccesses = 0;
    let dodgePool = 0;

    const finalTargetGrapple = finalTarget.state?.cofd_grapple as { grappleWith: string | null } | undefined;
    const finalPartnerId = finalTargetGrapple?.grappleWith;
    const finalPartnerParticipant = finalPartnerId ? encounter.participants.find((p) => p.actorId === finalPartnerId) : null;
    const isPartnerHolding = !!finalPartnerParticipant?.hasHold;

    if (finalTp?.surprised || finalTp?.isRestrained || finalTp?.hasHold || isPartnerHolding) {
      targetDefense = 0;
    } else if (finalTp?.isDodging) {
      dodging = true;
      const baseDefense = Math.max(0, computeDefense(targetSheet) - finalTp.appliedDefense);
      dodgePool = baseDefense * 2;
      dodgeSuccesses = dodgePool > 0 ? executeRoll(dodgePool).successes : 0;
    }

    // Cover / concealment from declared participant state.
    const rawCover = tp ? getCoverDurability(tp) : 0;
    const rawConceal = tp?.concealment ?? 0;
    const targetCoverVal = rawCover > 0 ? rawCover : undefined;
    const targetConcealVal: 1 | 2 | 3 | undefined =
      rawConceal === 1 || rawConceal === 2 || rawConceal === 3 ? rawConceal : undefined;

    const myConceal = myParticipant?.concealment ?? 0;
    const opts: AttackOptions = {
      pool: poolType,
      allOut,
      charge,
      offhand,
      pulling,
      burstShort,
      burstMed,
      burstLong,
      concealment: myConceal === 1 || myConceal === 2 || myConceal === 3 ? myConceal : undefined,
      targetCover: targetCoverVal,
      targetConcealment: targetConcealVal,
      targets: targets.length,
      intoMelee: intoMeleeCount,
      targetProne,
      targetSurprised,
      specified,
      aim: aimBankVal ?? 0,
    };

    // Reach delta: in melee, the longer reach grants +1 dice over the shorter.
    let reachDelta = 0;
    if (poolType === "melee" && weaponTags.reach > 1) {
      const targetWeaponId = targetSheet.equipment?.equippedWeapon ?? null;
      const targetWeapon = await equippedWeaponEntry(u, targetWeaponId);
      const targetReach = parseWeaponTags(targetWeapon?.entry?.special).reach;
      reachDelta = Math.max(0, weaponTags.reach - targetReach);
    }

    const built = buildPool(mySheet, poolType, opts, dodging ? 0 : targetDefense, extraDice + reachDelta);
    const finalPool = built.total;
    const result = executeRoll(Math.max(0, finalPool), { again: weaponTags.again });

    const finalSuccesses = dodging ? Math.max(0, result.successes - dodgeSuccesses) : result.successes;

    const weaponDmgMod = weaponInfo?.entry?.damage ?? 0;
    // Heavy Hitter (3 dots, melee only): +1 raw hit when wielding melee.
    const heavyHitter = finalSuccesses > 0 ? heavyHitterBonus(mySheet, isFirearm) : 0;
    const rawHits = finalSuccesses + (finalSuccesses > 0 ? weaponDmgMod : 0) + heavyHitter;

    const armorId = targetSheet.equipment?.equippedArmor ?? null;
    const targetArmor = await equippedArmorEntry(u, armorId);
    // Armor piercing reduces whichever armor band applies before damage calc.
    const armorGeneral = Math.max(0, (targetArmor?.entry?.ratingGeneral ?? 0) - weaponTags.armorPiercing);
    const armorBallistic = Math.max(0, (targetArmor?.entry?.ratingBallistic ?? 0) - weaponTags.armorPiercing);

    const effectiveHits = pulling ? Math.min(rawHits, pulling.max) : rawHits;

    let netDamage = 0;
    let beatenDown = false;
    let unconscious = false;
    let appliedTilts: string[] = [];

    if (finalSuccesses > 0) {
      const dmgResult = applyAttackDamage(
        targetSheet,
        effectiveHits,
        damageType,
        armorGeneral,
        armorBallistic,
        isFirearm,
      );

      netDamage = dmgResult.netDamage;
      beatenDown = dmgResult.beatenDown;
      unconscious = dmgResult.unconscious;

      if (netDamage > 0) {
        await u.db.modify(finalTarget.id, "$set", { "data.cofd": dmgResult.sheet });

        const stamina = targetSheet.attributes?.stamina ?? 1;
        const size = targetSheet.advantages?.size ?? 5;
        appliedTilts = checkSpecifiedTargetTilts(netDamage, stamina, size, specified);

        // Weapon-property tilts: Stun applies on any hit; Knockdown when net damage >= Size.
        if (weaponTags.stun && !appliedTilts.includes("stunned")) {
          appliedTilts.push("stunned");
        }
        if (weaponTags.knockdown && netDamage >= size && !appliedTilts.includes("knocked-down")) {
          appliedTilts.push("knocked-down");
        }

        if (appliedTilts.length > 0) {
          let tiltSheet = dmgResult.sheet;
          for (const key of appliedTilts) {
            if (key !== "heart-strike") tiltSheet = addTilt(tiltSheet, key);
          }
          await u.db.modify(finalTarget.id, "$set", { "data.cofd": tiltSheet });
        }

        await applyDefense(encounter.id, finalTarget.id);
      }
    }

    // ---- Output (per target) ------------------------------------------
    const targetName2 = finalTarget.name ?? "Unknown";
    const hitWord = finalSuccesses > 0 ? "hits" : "misses";
    const poolDesc = `${built.formula}=${finalPool > 0 ? finalPool : "chance"}d`;
    const diceStr = result.rolls.join(" ");
    const dmgPart = netDamage > 0 ? ` ${netDamage} ${damageType}` : "";
    const dodgeNote = dodging ? ` (dodging; active Dodge rolled ${dodgeSuccesses} success${dodgeSuccesses === 1 ? "" : "es"})` : "";

    u.broadcast(
      `%cyATTACK>>%cn ${attackerName} attacks ${targetName2}${dodgeNote}: ` +
        `%cw${finalSuccesses}%cn success${finalSuccesses === 1 ? "" : "es"} ${hitWord}${dmgPart}.`,
    );

    u.send(
      `%cgROLL DETAIL:%cn ${attackerName} ${poolDesc} (${diceStr})` +
        (spentWp ? " [+3 WP]" : "") +
        (aimBankVal ? ` [+${aimBankVal} aim]` : "") +
        (targetCoverVal ? ` [cover -${targetCoverVal}]` : "") +
        (targetConcealVal ? ` [conceal -${targetConcealVal}]` : "") +
        (result.dramaticFailure ? " %crDRAMATIC FAILURE%cn" : ""),
    );

    if (netDamage > 0 && finalTarget.id !== u.me.id) {
      u.send(
        `%cyINJURED:%cn ${attackerName} dealt ${netDamage} ${damageType} damage to you.`,
        finalTarget.id,
      );
    }

    if (beatenDown) {
      u.broadcast(`%cr${targetName2} is Beaten Down!%cn`);
      await setBeatenDown(encounter.id, finalTarget.id, true);
    }
    if (unconscious) {
      u.broadcast(`%cr${targetName2} is Incapacitated!%cn`);
      await handleTargetIncapacitated(u, encounter.id, finalTarget.id);
    }
    for (const tiltKey of appliedTilts) {
      if (tiltKey === "heart-strike") {
        u.broadcast(`%cy${targetName2} takes a strike to the heart!%cn`);
      } else {
        u.broadcast(`%cy${targetName2} gains tilt: ${tiltKey}%cn`);
      }
    }

    if (built.mods.attackerLosesDefense) {
      u.send("%cyNote:%cn You lose your Defense until your next turn (all-out / charge).");
    }
    if (reachDelta > 0) {
      u.send(`%cyNote:%cn Reach advantage applied (+${reachDelta} dice).`);
    }
  }

  // Consume the attacker's instant action for this turn.
  await setActionUsed(encounter.id, u.me.id, true);
  await endTurnAndWalk(u, encounter.id);

  if (weaponTags.slow) {
    u.send("%cyNote:%cn This weapon is Slow -- drawing or stowing it costs an instant action.");
  }
}

/**
 * Resolve an attack against an inert object (a CoFD item, not a player).
 * Roll attacker's Strength + Brawl/Weaponry (or weapon class pool), subtract
 * the item's Durability, and chip the remainder off Structure via
 * damageItem(). Broken items report broken; otherwise show current hp.
 */
async function attackObject(u: IUrsamuSDK, target: IDBObj): Promise<void> {
  const d = itemData(target);
  if (!d) { u.send("That is not a damageable object."); return; }

  // Use a simple Strength + Athletics pool against passive resistance of 0
  // (no Defense from inert objects). Equipped weapons add their damage mod.
  const mySheet: CofdSheet = (u.me.state?.cofd as CofdSheet) ?? defaultSheet();
  const strength = (mySheet.attributes as Record<string, number>)?.strength ?? 1;
  const athletics = (mySheet.skills as Record<string, number>)?.athletics ?? 0;
  const weaponInfo = await equippedWeaponEntry(u, mySheet.equipment?.equippedWeapon ?? null);
  const weaponMod = weaponInfo?.entry?.damage ?? 0;
  const pool = Math.max(0, strength + athletics);
  const result = executeRoll(pool);
  const raw = result.successes + (result.successes > 0 ? weaponMod : 0);
  const dur = d.durability ?? 0;
  const damage = Math.max(0, raw - dur);

  if (damage <= 0) {
    u.send(`You strike %ch${displayName(target)}%cn but its armor holds (${result.successes} success${result.successes === 1 ? "" : "es"} vs Durability ${dur}).`);
    return;
  }

  const dmgResult = await damageItem(u, target.id, damage);
  const max = d.maxStructure ?? d.structure ?? 1;
  if (dmgResult.broken) {
    u.send(`You smash %ch${displayName(target)}%cn. It is %cr[broken]%cn.`);
  } else {
    u.send(`You shred %ch${displayName(target)}%cn for ${damage} damage. (hp ${dmgResult.newStructure}/${max})`);
  }
  if (dmgResult.autoUnequipped && u.here?.broadcast) {
    u.here.broadcast(`${displayName(target)} breaks apart.`);
  }
}
