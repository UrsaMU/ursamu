/** +attack — Dangerous combat + specialty (shotgun/mono/ammo). */
import { addCmd, gameHooks } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  ARR,
  ERR,
  bad,
  dim,
  good,
  val,
  ylw,
} from "./chrome.ts";
import { type StatKey } from "../db/schemas.ts";
import {
  attackModeTags,
  combatGearBonus,
  gatherBonuses,
  resolveAction,
  applyResilience,
} from "../engine/action.ts";
import {
  getChar,
  getInventory,
  requireChar,
  saveChar,
} from "../engine/sheet-io.ts";
import {
  displayName,
  hostCombatBonus,
  itemData,
  itemDataRepaired,
  repairItemData,
  shortPartName,
  writeItemData,
} from "../engine/items.ts";
import {
  ammoSpecialty,
  isShotgun,
  knifeToGunfight,
  monofilamentAdjust,
  parseMultiDs,
  resolveShotgunBand,
  shotgunDamageBonus,
} from "../engine/specialty-combat.ts";
import {
  applyHullDamage,
  applyPcOccupantHits,
  catalogVehicleDs,
  effectiveVehicleDs,
  getActiveVehicle,
  resolveOccupantFire,
  resolveVehicleRef,
  vehicleActionBonus,
  vehicleIsArmoured,
  vehicleLabel,
} from "../engine/vehicles.ts";
import {
  magLabel,
  modeFromAttack,
  spendMag,
} from "../engine/mags.ts";
import {
  dotKindFromAmmo,
  hasDots,
  igniteAndTick,
  tickDots,
} from "../engine/dots.ts";
import { rollVehicleCritical } from "../engine/crit-tables.ts";
import { rangeAttackMod } from "../engine/range.ts";
import {
  hitHorde,
  hordeDs,
} from "../engine/hordes.ts";
import {
  catalogNpc,
  hitNpcObject,
  igniteNpcDot,
  isSprawlNpc,
  loadRoomNpcs,
  npcData,
  resolveNpcInRoom,
  spawnNpc,
  tickNpcDots,
} from "../engine/npcs.ts";
import {
  applyKillLoot,
  formatLootLine,
  lootForHorde,
  lootForNpc,
  type KillLoot,
} from "../engine/npc-loot.ts";
import {
  dropGigToken,
  isGigBossNpc,
  isGigMinionNpc,
} from "../engine/gigs.ts";
import { onGigMinionKilled } from "../engine/gig-run.ts";
import {
  combatFlavorLine,
  flavorEnabled,
} from "../engine/combat-flavor.ts";
import {
  clearPendingGlitch,
  forceCriticalRoll,
  formatCriticalStatus,
  tickCritical,
  woundGlitch,
} from "../engine/damage.ts";
import { rollCybershellCritical } from "../engine/crit-tables.ts";
import {
  SHOWROOM,
  VEHICLES,
  find,
  findByName,
} from "../engine/catalog.ts";
import {
  parseDs,
  parseMods,
  pickPrimaryWeapon,
  renderResult,
} from "./attack-shared.ts";
import { buildRollPayload, emitSprawl } from "./frame.ts";

addCmd({
  name: "+attack",
  pattern: /^\+attack(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+attack[/<mode>] <target>[,ds…] [mods]
  — Dangerous Action (Reaction or Morphology).

Target: DS · PC name · NPC · horde · hull.
Modes: aim burst auto pb melee fastdraw knife
  sg | sg-close | sg-pb

+range sets PB/OOR. Mags spend; hellfire auto-DoT.
Horde: +horde/spawn then +attack horde.

Examples:
  +attack/sg-pb 10,12,14
  +attack Razor
  +attack horde
  +attack/auto ground-car`,

  exec: async (u: IUrsamuSDK) => {
    const mode = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const raw = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    if (!raw) {
      u.send(
        `${ERR}Usage: ${val("+attack[/<mode>] <ds|npc|veh>")}`,
      );
      return;
    }
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet. ${val("+chargen")} first.`);
      return;
    }

    const [targetTok, ...rest] = raw.split(/\s+/);
    const multiDs = parseMultiDs(targetTok);
    let ds = multiDs.length === 1
      ? multiDs[0]
      : multiDs.length > 1
      ? multiDs[0]
      : null;
    const bareDs = multiDs.length === 0
      ? parseDs(targetTok)
      : null;
    let hullTarget: Awaited<
      ReturnType<typeof resolveVehicleRef>
    > = null;
    let hullLabel = "";
    /** Room NPC Thing (flag npc + sprawl_npc). */
    let npcObj: IDBObj | null = null;

    // Room NPC Thing first (look / contents / DB).
    if (ds === null && multiDs.length === 0) {
      const roomNpcs = await loadRoomNpcs(u);
      let found = resolveNpcInRoom(roomNpcs, targetTok);
      if (!found) {
        const t = await u.util.target(u.me, targetTok, false);
        if (t && isSprawlNpc(t)) found = t;
      }
      if (found) {
        const nd = npcData(found);
        if (nd?.dead || (nd && nd.ds <= 0)) {
          u.send(
            `${ARR}${val(nd.name)} is already down (DS0).`,
          );
          return;
        }
        if (nd) {
          npcObj = found;
          ds = nd.ds;
        }
      }
    }

    // Owned garage hull → live DS + damage on hit.
    if (ds === null && multiDs.length === 0) {
      hullTarget = await resolveVehicleRef(
        u,
        u.me.id,
        targetTok,
      );
      if (hullTarget) {
        const hd = itemData(hullTarget);
        ds = hd ? effectiveVehicleDs(hd) : null;
        hullLabel = vehicleLabel(hullTarget);
      }
    }

    // Catalog NPC → auto-spawn into this room, then fight.
    if (ds === null && multiDs.length === 0 && !npcObj) {
      const row = catalogNpc(targetTok);
      if (row && typeof row.ds === "number") {
        const spawned = await spawnNpc(u, {
          slug: String(row.slug),
          name: String(row.name ?? row.slug),
          ds: row.ds as number,
          loadout: row.loadout
            ? String(row.loadout)
            : undefined,
        });
        if (spawned) {
          npcObj = spawned;
          ds = npcData(spawned)?.ds ?? (row.ds as number);
          u.send(
            `${ARR}Spawned ${val(String(row.name))} ` +
              `here (DS${val(ds)}).`,
          );
        }
      }
    }

    // Bare DS → spawn ad-hoc NPC object in room.
    if (ds === null && !npcObj && bareDs != null) {
      const spawned = await spawnNpc(u, {
        name: `DS${bareDs} foe`,
        ds: bareDs,
        slug: `ds-${bareDs}`,
      });
      if (spawned) {
        npcObj = spawned;
        ds = bareDs;
        u.send(
          `${ARR}Spawned ${val(`DS${bareDs} foe`)} here.`,
        );
      } else {
        ds = bareDs;
      }
    }

    // Catalog chassis / showroom (DS only, no hull write).
    if (ds === null && !npcObj) {
      const vrow = find("vehicle", targetTok) ??
        find("showroom", targetTok) ??
        findByName([...VEHICLES, ...SHOWROOM], targetTok);
      const cds = catalogVehicleDs(vrow);
      if (cds != null) {
        ds = cds;
        hullLabel = String(vrow?.name ?? targetTok);
      }
    }
    // Hollywood Hordes: DS = living members
    let vsHorde = false;
    if (
      ds === null &&
      !npcObj &&
      /^(horde|mob|punks?)$/i.test(targetTok)
    ) {
      const hd = hordeDs(c);
      if (hd == null) {
        u.send(
          `${ERR}No horde. ${val("+horde/spawn 8 punks")}`,
        );
        return;
      }
      ds = hd;
      vsHorde = true;
    }

    // Live PC: DS ≈ 10 + Reaction (street dodge).
    let pcTarget: IDBObj | undefined;
    if (ds === null && !npcObj) {
      const found = await u.util.target(u.me, targetTok, true);
      if (found?.flags?.has?.("player")) {
        const pcSheet = getChar(found);
        if (pcSheet) {
          ds = 10 + (pcSheet.stats?.reaction ?? 0);
          pcTarget = found;
        }
      }
    }

    let sheet = c;
    if (ds === null) {
      u.send(
        `${ERR}Need DS, PC, NPC, horde, chassis, or hull.` +
          ` ${dim("+npc/spawn <slug>")}`,
      );
      return;
    }

    const mods = parseMods(rest.join(" "));
    // Optional +ammo=slug in rest
    let ammoTok = "";
    for (const t of rest) {
      const m = t.match(/^\+?ammo=(.+)$/i);
      if (m) ammoTok = m[1];
    }

    let modeBonus = 0;
    const modeParts: string[] = [];
    let stat: StatKey = "reaction";
    let extraUpgrade = 0;
    let rangeGlitch = 0;
    const isKnife = mode === "knife" || mode === "charge" ||
      mode === "rush";
    const isFd = mode === "fastdraw" || mode === "fd" ||
      mode === "draw";

    if (isKnife) {
      const k = knifeToGunfight({
        unaware: rest.some((t) =>
          /unaware|ambush|sneak/i.test(t)
        ),
      });
      stat = k.stat;
      extraUpgrade += k.upgrade;
      modeParts.push(...k.parts);
    } else if (mode === "melee") {
      stat = "morphology";
      modeParts.push("melee");
    } else if (mode === "burst") {
      modeBonus = 2;
      modeParts.push("burst+2");
    } else if (mode === "auto" || mode === "fullauto") {
      modeBonus = 4;
      modeParts.push("auto+4");
    } else if (mode === "pb" || mode === "pointblank") {
      modeBonus = 3;
      modeParts.push("pb+3");
    } else if (mode.startsWith("aim")) {
      const n = Math.min(
        3,
        Math.max(1, Number(mode.slice(3)) || 1),
      );
      modeBonus = n;
      modeParts.push(`aim+${n}`);
    } else if (isFd) {
      modeParts.push("fastdraw");
    }

    const { items, load } = await getInventory(u, u.me);
    // Repair market mints (kind=gear, bonus 0) so gear counts
    for (const it of items) {
      const cur = itemData(it);
      if (!cur) continue;
      const { data, changed } = repairItemData(cur, {
        name: String(it.name ?? ""),
      });
      if (changed) {
        await writeItemData(u, it, data);
      }
    }
    const primary = pickPrimaryWeapon(
      items,
      stat === "morphology",
    );
    let primaryD = primary
      ? (itemDataRepaired(primary) ?? itemData(primary))
      : null;
    if (primary && primaryD) {
      const { data, changed } = repairItemData(primaryD, {
        name: String(primary.name ?? ""),
      });
      if (changed || hostCombatBonus(data) > 0) {
        primaryD = {
          ...data,
          bonus: hostCombatBonus(data) || data.bonus || 1,
        };
        await writeItemData(u, primary, primaryD);
      }
    }

    // Auto range from +range (unless mode already set PB)
    const rMod = !isKnife && stat === "reaction"
      ? rangeAttackMod(c.engageRangeM, primaryD)
      : null;
    if (rMod) {
      if (
        rMod.band === "pb" &&
        mode !== "pb" && mode !== "pointblank" &&
        !mode.startsWith("sg")
      ) {
        modeBonus += rMod.bonus;
        modeParts.push(...rMod.parts.filter((p) =>
          p.startsWith("pb") || p.startsWith("range")
        ));
      } else if (rMod.band !== "pb") {
        modeParts.push(...rMod.parts);
      }
      rangeGlitch += rMod.glitch;
      // Shotgun specialty band from range if mode is plain sg
      if (
        mode === "sg" && rMod.shotgunBand &&
        rMod.shotgunBand !== "range"
      ) {
        // resolved below via resolveShotgunBand — inject hint
        void rMod.shotgunBand;
      }
    }

    // Magazine spend (ranged only)
    const fireMode = modeFromAttack(
      mode === "auto" || mode === "burst" || mode === "fa"
        ? mode
        : "shot",
    );
    const ranged = primaryD &&
      (primaryD.kind === "firearm" ||
        primaryD.kind === "heavy" ||
        primaryD.kind === "weapon") &&
      stat === "reaction";
    if (ranged && primary && primaryD && !isKnife) {
      const spent = spendMag(
        primaryD,
        mode === "auto" || mode === "fa" ? "auto" : fireMode,
      );
      if (!spent.ok) {
        u.send(
          `${ERR}Magazine empty — ${val("+reload")}` +
            (primaryD.magMax != null
              ? ` (${magLabel(primaryD)})`
              : ""),
        );
        return;
      }
      if (spent.spent > 0) {
        primaryD = spent.data;
        await writeItemData(u, primary, primaryD);
      }
    }

    // Shotgun band + damage (p.30) — range can supply pb/close
    let sgMode = mode;
    if (
      (mode === "sg" || mode === "shotgun") &&
      rMod?.shotgunBand &&
      rMod.shotgunBand !== "range"
    ) {
      sgMode = rMod.shotgunBand === "pb" ? "sg-pb" : "sg-close";
    }
    const sgBand = resolveShotgunBand(sgMode, primaryD);
    let specialtyDmg = 0;
    if (sgBand && isShotgun(primaryD)) {
      const sgd = shotgunDamageBonus(sgBand);
      specialtyDmg += sgd;
      if (sgd) modeParts.push(`sg-${sgBand}+${sgd}`);
      else modeParts.push("sg");
    }

    const actionTags = attackModeTags(
      isKnife
        ? "melee"
        : mode.startsWith("sg")
        ? (mode.includes("pb") || mode === "pb"
          ? "pb"
          : "shot")
        : mode,
    );
    let gear = combatGearBonus(items, { actionTags });
    // If inventory repair still missed the primary, force +N
    if (primary && primaryD) {
      const wb = Math.max(1, hostCombatBonus(primaryD));
      const tag = `${
        shortPartName(displayName(primary), primaryD.slug)
      }+${wb}`;
      const named = gear.parts.some((p) =>
        /^\S+\+\d+$/.test(p) && !p.startsWith("aim") &&
        !p.startsWith("burst") && !p.startsWith("auto") &&
        !p.startsWith("pb")
      );
      if (!named || gear.total < wb) {
        const bump = named ? 0 : wb;
        gear = {
          total: gear.total + bump,
          parts: named
            ? gear.parts
            : [tag, ...gear.parts],
          upgrade: gear.upgrade,
        };
      }
    }

    // Target armour unknown for NPC DS unless +armoured flag.
    const targetArmour = rest.some((t) =>
        /armou?red|kevlar|plated/i.test(t)
      )
      ? 1
      : 0;
    const mono = monofilamentAdjust({
      weapon: primaryD,
      targetArmourBonus: targetArmour,
    });
    if (mono.ignoreArmour) {
      modeParts.push(...mono.parts);
      specialtyDmg += mono.damageBonus;
    }

    const ammoKey = ammoTok || primaryD?.ammoSlug ||
      (primaryD?.tags ?? []).join(" ");
    const ammo = ammoSpecialty(ammoKey);
    specialtyDmg += ammo.damageBonus;
    modeParts.push(...ammo.parts);
    modeBonus += ammo.rollBonus;

    const ride = await getActiveVehicle(u, u.me, c);
    const rideD = ride ? itemData(ride) : null;
    const fromVeh = vehicleActionBonus(rideD, [
      "combat",
      "mecha",
      "ram",
    ]);
    if (ride) {
      const rd = itemData(ride);
      modeParts.push(
        `from ${
          shortPartName(
            displayName(ride),
            rd?.slug ?? rd?.chassis,
          )
        }`,
      );
    }

    const gath = gatherBonuses(
      c,
      stat,
      gear.total + modeBonus + mods.bonus + fromVeh.total,
      [...gear.parts, ...modeParts, ...fromVeh.parts],
      load,
      items,
    );

    const hadPending = (c.pendingGlitch ?? 0) > 0;
    const glitch = mods.glitch + woundGlitch(c) +
      (isFd ? 1 : 0) + rangeGlitch;
    const result = resolveAction({
      stat,
      statValue: c.stats[stat],
      bonuses: gath.total,
      ds,
      glitch,
      upgrade: mods.upgrade + gear.upgrade + fromVeh.upgrade +
        extraUpgrade,
      dangerous: true,
      tags: [...modeParts, ...actionTags],
    });

    // sheet may already hold live NPC/horde state from ensure*
    if (hadPending) {
      sheet = clearPendingGlitch(sheet);
    }
    if (result.damageToSelf > 0) {
      sheet = applyResilience(sheet, -result.damageToSelf);
    }

    // Existing crit: bleed + dying clock each swing
    let critTickLines: string[] = [];
    if (sheet.critical) {
      const ticked = tickCritical(sheet);
      sheet = ticked.next;
      critTickLines = ticked.lines;
    }

    // Horde: damage removes members 1:1
    let hordeNote: string | null = null;
    let loot: KillLoot | null = null;
    if (vsHorde && result.success) {
      const dmg = result.damageToTarget + specialtyDmg;
      const hit = hitHorde(sheet, Math.max(1, dmg));
      if (hit) {
        sheet = hit.next;
        hordeNote = hit.wiped
          ? `HORDE wiped (−${hit.dropped})`
          : `HORDE ${hit.before}→${hit.after}` +
            ` (−${hit.dropped} punks)`;
        if (hit.wiped) {
          const max = c.horde?.sizeMax ?? hit.before;
          loot = lootForHorde(
            max,
            c.horde?.name ?? "horde",
          );
          sheet = applyKillLoot(sheet, loot);
        }
      }
    }

    // Room NPC object: DS is Resilience (p.26)
    let npcNote: string | null = null;
    let gigTokenNote: string | null = null;
    let gigNodeNote: string | null = null;
    const npcDotLines: string[] = [];
    // Ongoing burn ticks once per swing unless this hit re-ignites
    // (ignite path already applies the round's burn).
    const willIgniteNpc = !!(
      npcObj &&
      result.success &&
      ammo.fireRounds > 0
    );
    if (
      npcObj &&
      npcData(npcObj)?.dots?.length &&
      !willIgniteNpc
    ) {
      const pre = await tickNpcDots(u, npcObj);
      npcDotLines.push(...pre.lines);
      if (pre.hit?.dead) {
        const nm = pre.data?.name ?? "NPC";
        npcNote = `${nm} DOWN (burned out)`;
        if (pre.data && !loot) {
          const row = catalogNpc(pre.data.slug);
          loot = lootForNpc(pre.data, row);
          sheet = applyKillLoot(sheet, loot);
        }
        const gig = sheet.activeGig ?? c.activeGig;
        if (
          gig &&
          isGigBossNpc(npcObj, gig, u.me.id)
        ) {
          const dropped = await dropGigToken(u, sheet, gig);
          if (dropped.token) {
            sheet = dropped.next;
            gigTokenNote =
              `TARGET ${gig.targetName} (+gig/turnin)`;
          }
        } else if (
          gig &&
          isGigMinionNpc(npcObj, gig, u.me.id)
        ) {
          const mk = onGigMinionKilled(sheet, npcObj.id);
          sheet = mk.next;
          if (mk.cleared) {
            gigNodeNote = `NODE CLEAR — +gig/push`;
          }
        }
      }
    }
    if (
      npcObj && result.success &&
      !(npcData(npcObj)?.dead)
    ) {
      const dmg = result.damageToTarget + specialtyDmg;
      const hit = await hitNpcObject(u, npcObj, dmg);
      if (hit) {
        const nm = hit.data.name;
        const pile = Math.max(1, hit.data.stack ?? 1);
        npcNote = hit.dead
          ? `${nm} DOWN (DS${hit.before}→0 · −${hit.dropped})` +
            (pile > 1 ? ` · bodies ×${pile}` : "")
          : `${nm} DS${hit.before}→${hit.after}` +
            ` (−${hit.dropped})`;
        if (hit.dead) {
          const row = catalogNpc(hit.data.slug) ??
            find("antagonist", hit.data.slug);
          loot = lootForNpc(hit.data, row);
          sheet = applyKillLoot(sheet, loot);
          const gig = sheet.activeGig ?? c.activeGig;
          if (
            gig &&
            isGigBossNpc(npcObj, gig, u.me.id)
          ) {
            const dropped = await dropGigToken(
              u,
              sheet,
              gig,
            );
            if (dropped.token) {
              sheet = dropped.next;
              gigTokenNote =
                `TARGET ${gig.targetName} ` +
                `(+gig/turnin)`;
            }
          } else if (
            gig &&
            isGigMinionNpc(npcObj, gig, u.me.id)
          ) {
            const mk = onGigMinionKilled(sheet, npcObj.id);
            sheet = mk.next;
            if (mk.cleared) {
              gigNodeNote =
                `NODE CLEAR — +gig/push`;
            }
          }
        }
      }
    } else if (npcObj && !result.success) {
      const nd = npcData(npcObj);
      if (nd) {
        npcNote = `${nd.name} DS${nd.ds}/${nd.dsMax}` +
          ` ${dim("(standing)")}`;
      }
    }

    // Burning while you shoot — auto-tick own DoTs each attack.
    let selfBurnLines: string[] = [];
    if (hasDots(sheet)) {
      const selfBurn = tickDots(sheet, applyResilience);
      sheet = selfBurn.next;
      selfBurnLines = selfBurn.lines;
    }
    if (
      result.damageToSelf > 0 ||
      selfBurnLines.length ||
      hordeNote ||
      loot ||
      gigTokenNote ||
      gigNodeNote
    ) {
      await saveChar(u, sheet);
    }

    const fireDotPreview = result.success && ammo.fireRounds > 0;
    const npcName = npcObj
      ? String(npcData(npcObj)?.name ?? npcObj.name ?? "")
      : "";
    const flavor = flavorEnabled(c)
      ? combatFlavorLine({
        result,
        mode: sgMode || mode,
        kind: primaryD ? String(primaryD.kind) : undefined,
        category: primaryD?.category
          ? String(primaryD.category)
          : undefined,
        mono: !!mono.ignoreArmour ||
          mono.parts.some((p) => /mono/i.test(p)),
        shotgun: isShotgun(primaryD),
        horde: vsHorde,
        fire: fireDotPreview,
        weaponName: primary
          ? displayName(primary)
          : undefined,
        targetName: pcTarget
          ? String(pcTarget.name ?? "")
          : vsHorde
          ? "the horde"
          : npcName || undefined,
      })
      : null;

    const lines = [
      renderResult(
        vsHorde
          ? "HORDE"
          : npcObj
          ? "NPC"
          : "ATTACK",
        result,
        gath.parts,
        { flavor },
      ),
      `  Resilience ${val(sheet.resilience)}` +
      `/${val(sheet.resilienceMax)}`,
    ];
    if (hordeNote) {
      lines.push(
        `  ${hordeNote.includes("wiped")
          ? bad(hordeNote)
          : ylw(hordeNote)}`,
      );
    }
    if (npcNote) {
      lines.push(
        `  ${npcNote.includes("DOWN")
          ? bad(npcNote)
          : ylw(npcNote)}`,
      );
    }
    if (loot) {
      const ll = formatLootLine(loot);
      if (ll) {
        lines.push(`  ${good(ll)}`);
        lines.push(
          `  ${dim(`b¥ ${sheet.bityuan} · AP ${sheet.ap}`)}`,
        );
      }
    }
    if (gigTokenNote) {
      lines.push(`  ${good(gigTokenNote)}`);
    }
    if (gigNodeNote) {
      lines.push(`  ${ylw(gigNodeNote)}`);
    }
    for (const L of selfBurnLines) {
      lines.push(`  ${ylw("YOUR DoT")} ${L}`);
    }
    if (ranged && primaryD?.magMax != null) {
      lines.push(
        `  Mag ${val(magLabel(primaryD))}` +
          (primaryD.mag === 0
            ? ` ${bad("EMPTY")} ${dim("+reload")}`
            : ""),
      );
    }

    // Bunched shotgun targets (one roll, many DS).
    const bunch = multiDs.length > 1 ? multiDs : [];
    if (bunch.length > 1 && isShotgun(primaryD)) {
      lines.push(`  ${ylw("BUNCHED")} ≤3 targets`);
      for (const tds of bunch) {
        const hit = result.total >= tds;
        const margin = hit ? result.total - tds : 0;
        const extra = hit ? specialtyDmg : 0;
        lines.push(
          hit
            ? `  vs DS${tds} ${good("HIT")}` +
              ` +${margin + extra}`
            : `  vs DS${tds} ${dim("miss")}`,
        );
      }
    } else if (result.success && specialtyDmg > 0) {
      lines.push(
        `  ${good("+" + specialtyDmg)} specialty dmg` +
          ` (margin ${result.damageToTarget}+${specialtyDmg})`,
      );
    }

    // Fire/acid: auto-ignite on hit (PC Res or NPC DS).
    const fireDot = result.success && ammo.fireRounds > 0;
    const dotKind = fireDot ? dotKindFromAmmo(ammoKey) : "fire";
    if (fireDot) {
      lines.push(
        `  ${ylw("FIRE/ACID")} ${ammo.fireRounds}rd ` +
          `${dotKind} — auto`,
      );
      const pcT = pcTarget ??
        await u.util.target(u.me, targetTok, true);
      const isPc = !!(
        pcT?.flags?.has?.("player") && pcT.id !== u.me.id
      );
      if (isPc && pcT) {
        const tc = getChar(pcT);
        if (tc) {
          const burn = igniteAndTick(
            tc,
            {
              kind: dotKind,
              rounds: ammo.fireRounds,
              dmg: 1,
              source: primaryD?.slug,
            },
            applyResilience,
          );
          await saveChar(u, burn.next, pcT.id);
          for (const L of burn.lines) {
            lines.push(
              `  ${ylw(String(pcT.name))} ${L}`,
            );
          }
          if (burn.next.resilience <= 0) {
            lines.push(
              `  ${bad(String(pcT.name) + " RES 0")}`,
            );
          }
        }
      } else if (npcObj && !npcData(npcObj)?.dead) {
        const burn = await igniteNpcDot(u, npcObj, {
          kind: dotKind,
          rounds: ammo.fireRounds,
          dmg: 1,
        });
        for (const L of burn.lines) {
          lines.push(`  ${ylw("NPC")} ${L}`);
        }
        if (burn.hit) {
          const nm = burn.data?.name ?? "NPC";
          lines.push(
            `  ${nm} DS${burn.hit.before}→${burn.hit.after}` +
              (burn.hit.dead ? ` ${bad("DOWN")}` : ""),
          );
          if (burn.hit.dead && !npcNote?.includes("DOWN")) {
            npcNote =
              `${nm} DOWN (DS${burn.hit.before}→0 · burn)`;
            // loot / gig hooks if kill via burn only
            if (!loot) {
              const row = catalogNpc(
                burn.data?.slug ?? "",
              );
              if (burn.data) {
                loot = lootForNpc(burn.data, row);
                sheet = applyKillLoot(sheet, loot);
              }
            }
            const gig = sheet.activeGig ?? c.activeGig;
            if (
              gig &&
              isGigBossNpc(npcObj, gig, u.me.id)
            ) {
              const dropped = await dropGigToken(
                u,
                sheet,
                gig,
              );
              if (dropped.token) {
                sheet = dropped.next;
                gigTokenNote =
                  `TARGET ${gig.targetName} ` +
                  `(+gig/turnin)`;
              }
            } else if (
              gig &&
              isGigMinionNpc(npcObj, gig, u.me.id)
            ) {
              const mk = onGigMinionKilled(sheet, npcObj.id);
              sheet = mk.next;
              if (mk.cleared) {
                gigNodeNote = `NODE CLEAR — +gig/push`;
              }
            }
          }
        }
      } else if (!hullTarget && bareDs != null) {
        // No object yet — fold one burn into reported dmg
        lines.push(
          `  ${ylw(dotKind)} +1 burn on impact` +
            ` · ${val(Math.max(0, ammo.fireRounds - 1))}` +
            ` rd if they linger`,
        );
      }
    }
    for (const L of npcDotLines) {
      lines.push(`  ${ylw("NPC DoT")} ${L}`);
    }
    if (result.success && ammo.stun) {
      lines.push(`  ${dim("stun only — no lethal")}`);
    }

    // Shooting INTO a garage hull — hull DS + occupants (p.32).
    if (hullTarget && result.success) {
      const hd = itemData(hullTarget)!;
      const armoured = vehicleIsArmoured(hd);
      const wielded = items.find((o) =>
        itemData(o)?.slot === "wielded"
      );
      const crackArmour = !!wielded &&
        itemData(wielded)?.kind === "heavy";
      if (armoured && !crackArmour) {
        lines.push(
          `  ${ylw("ARMOURED")} hull — small arms glance` +
            ` (wield heavy: ${val("+gear/wield <at>")})`,
        );
        lines.push(
          `  ${dim("Crew shielded behind armour")}`,
        );
      } else {
        let hullData = hd;
        if (result.damageToTarget > 0) {
          const hit = applyHullDamage(
            hullData,
            result.damageToTarget,
          );
          hullData = hit.data;
          const hName = shortPartName(
            hullLabel || displayName(hullTarget),
          );
          lines.push(
            `  Hull ${val(hName)}` +
              ` DS${val(hit.before)}→${val(hit.after)}` +
              (hit.destroyed ? ` ${bad("WRECK")}` : ""),
          );
          if (hit.destroyed || hit.after <= 3) {
            const vc = rollVehicleCritical(hit.destroyed);
            lines.push(
              `  ${ylw("VEHICLE CRIT")} ${vc.roll}: ` +
                `${vc.effect}`,
            );
          }
        } else {
          lines.push(
            `  Hull ${val(shortPartName(displayName(hullTarget)))}` +
              ` — no DS loss`,
          );
        }
        // Same attack total vs every seat (book limo example).
        const fire = resolveOccupantFire(
          hullData,
          result.total,
        );
        await writeItemData(u, hullTarget, fire.data);
        if (fire.lines.length) {
          lines.push(`  ${ylw("CREW FIRE")}`);
          for (const L of fire.lines) {
            if (L.pcId) {
              lines.push(
                `    ${L.name} (PC) vs DS${L.ds}: ` +
                  (L.hit
                    ? `${good("HIT")} margin ${L.margin}`
                    : `${dim("miss")}`),
              );
            } else if (L.hit) {
              lines.push(
                `    ${L.name} DS${L.ds}→${L.afterDs}` +
                  (L.down ? ` ${bad("OUT")}` : "") +
                  ` (total ${L.total})`,
              );
            } else {
              lines.push(
                `    ${L.name} DS${L.ds} ${dim("unharmed")}` +
                  ` (need ${L.ds}, rolled ${L.total})`,
              );
            }
          }
          if (fire.pcHits.length) {
            const pcLines = await applyPcOccupantHits(
              u,
              fire.pcHits,
            );
            for (const p of pcLines) {
              lines.push(`    ${bad(p)}`);
            }
            // Fire ammo: ignite PC crew who were hit
            if (fireDot) {
              for (const h of fire.pcHits) {
                if (h.margin <= 0) continue;
                // deno-lint-ignore no-explicit-any
                const found = await (u.db as any).get?.(h.id) ??
                  (await u.db.search({ id: h.id }))[0];
                if (!found) continue;
                const tc = getChar(found);
                if (!tc) continue;
                const burn = igniteAndTick(
                  tc,
                  {
                    kind: dotKind,
                    rounds: ammo.fireRounds,
                    dmg: 1,
                    source: primaryD?.slug,
                  },
                  applyResilience,
                );
                await saveChar(u, burn.next, h.id);
                for (const L of burn.lines) {
                  lines.push(`    ${ylw(h.name)} ${L}`);
                }
              }
            }
          }
        } else {
          lines.push(
            `  ${dim("No crew seated — +vehicle/seat")}`,
          );
        }
      }
    } else if (
      hullLabel && !hullTarget && result.success
    ) {
      lines.push(
        `  ${dim("vs " + hullLabel + " (catalog DS — no hull write)")}`,
      );
    }

    for (const L of critTickLines) {
      lines.push(`  ${bad("CRIT")} ${L}`);
    }
    if (sheet.resilience <= 0 && !sheet.critical) {
      const injury = sheet.isCybershell
        ? rollCybershellCritical(false)
        : undefined;
      const forced = forceCriticalRoll(sheet, { injury });
      sheet = forced.next;
      lines.push(`  ${bad("RES 0")} — critical`);
      for (const L of formatCriticalStatus(forced.injury)) {
        lines.push(L);
      }
    } else if (sheet.resilience <= 0 && sheet.critical) {
      lines.push(
        `  ${bad("RES 0")} · crit ${sheet.critical.location}` +
          ` sev${sheet.critical.severity}`,
      );
    }
    // Persist sheet if crit/bleed/res changed
    if (
      critTickLines.length ||
      (sheet.critical && sheet.resilience <= 0) ||
      result.damageToSelf > 0
    ) {
      await saveChar(u, sheet);
    }
    const text = lines.join("\r\n");
    emitSprawl(
      u,
      "roll",
      buildRollPayload(result, {
        verb: "attack",
        title: "ATTACK",
        parts: result.tags,
        target: hullLabel || npcObj?.name || pcTarget?.name ||
          (vsHorde ? "horde" : ""),
      }),
      text,
    );
    // deno-lint-ignore no-explicit-any
    (gameHooks as any).emit?.("sprawl:combat", {
      actorId: u.me.id,
      ...result,
      hullId: hullTarget?.id,
    });
  },
});

