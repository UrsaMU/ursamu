/**
 * +pack -- Nomad Pack/Family Support Requests
 * Implements the non-vehicle mechanics of the Moto role ability.
 * CPR Core -- Nomad role, Moto ability (family support aspects).
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { bar, div, hdr, lbl, val, acc, dim, ARR, ERR, OK, row, wrap, grid } from "./chargen.ts";
import type { ICPRCharacter } from "../db/schemas.ts";
import { d6 } from "../engine/dice.ts";
import { applyHealingToChar } from "../engine/character.ts";
import { canReceiveHealing } from "../engine/validation.ts";
import {
  PACK_MIN_RANK,
  PACK_COOLDOWN_MS,
  isPackOnCooldown,
  packCooldownRemaining,
  canRequestPack,
  type PackRequestType,
} from "../engine/pack.ts";

interface IPackDef {
  label: string;
  narrative: (rank: number) => string;
}

const PACK_DEFS: Record<PackRequestType, IPackDef> = {
  supplies: {
    label: "Supplies",
    narrative: (rank) => rank >= 7
      ? "Your pack delivers premium gear, extra ammo, and a week's rations."
      : rank >= 4
      ? "Your pack sends ammo, basic meds, and food for a few days."
      : "Your pack scrapes together basic ammo and a day's food.",
  },
  backup: {
    label: "Backup",
    narrative: (rank) => rank >= 7
      ? "Your pack mobilizes a crew of 10+ armed members. ETA: 30 minutes."
      : "Two armed pack members are on their way. ETA: 1d6×10 minutes.",
  },
  medical: {
    label: "Medical",
    narrative: (_rank) => "Your pack's medic arrives and patches up your wounds.",
  },
  haven: {
    label: "Safe Haven",
    narrative: (rank) => rank >= 9
      ? "Your pack escorts you to a fortified compound -- full rest and protection."
      : "Your pack opens a safe house for you, secure for 48 hours.",
  },
};

addCmd({
  name: "+pack",
  pattern: /^\+pack(?:\/(request|status))?\s*(supplies|backup|medical|haven)?/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+pack[/<switch>] [<type>]  -- Nomad pack support requests.

Nomad role only. Your pack provides support scaled to your role rank.
Each request type has a 24-hour cooldown.

Request types (minimum rank):
  supplies   Rank 1+: ammo, food, basic supplies.
  backup     Rank 4+: armed pack members arrive.
  medical    Rank 4+: pack medic heals you (2d6 HP).
  haven      Rank 7+: secure safe house or fortified compound.

Switches:
  /request <type>   Call in pack support.
  /status           View cooldowns and available support options.

Examples:
  +pack/status             See what support your pack can provide.
  +pack/request medical    Call your pack medic for healing.
  +pack/request supplies   Request supplies from your pack.`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "status").toLowerCase().trim();
    const arg = (u.cmd.args[1] ?? "").toLowerCase().trim() as PackRequestType | "";
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }
    if (cpr.role !== "nomad")  { u.send(`${ERR}Only Nomads can call on pack support.`); return; }

    if (!sw || sw === "status") { showPackStatus(u, cpr);             return; }
    if (sw === "request")       { await handleRequest(u, cpr, arg); return; }
    u.send(`${ERR}Unknown switch ${val("/" + sw)}. Valid: ${val("/request")} ${val("/status")}`);
  },
});

function showPackStatus(u: IUrsamuSDK, cpr: ICPRCharacter): void {
  const now      = Date.now();
  const lastUsed = (cpr.roleData.packLastUsed as Record<string, number> | undefined) ?? {};
  const name     = u.util.displayName(u.me, u.me);
  const lines    = [
    bar(),
    hdr(`PACK STATUS -- ${name.toUpperCase()}`),
    bar(),
    row("ROLE RANK", val(cpr.roleRank)),
    div(),
  ];

  for (const [type, def] of Object.entries(PACK_DEFS) as [PackRequestType, IPackDef][]) {
    const rankOk  = canRequestPack(cpr.roleRank, type);
    const ready   = !isPackOnCooldown(lastUsed[type], now);
    const status  = !rankOk
      ? dim(`(Rank ${PACK_MIN_RANK[type]}+ required)`)
      : ready
      ? `%cg:: Ready%cn`
      : `%cr!! ${Math.ceil(packCooldownRemaining(lastUsed[type], now) / 3_600_000)}h cooldown%cn`;
    lines.push(row(acc(def.label), status));
  }
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

async function handleRequest(u: IUrsamuSDK, cpr: ICPRCharacter, type: PackRequestType | ""): Promise<void> {
  if (!type || !PACK_DEFS[type]) {
    u.send(
      `${ERR}Specify a loadout type: ${val("supplies")}  ${val("backup")}  ${val("medical")}  ${val("haven")}.`,
    );
    return;
  }
  if (!canRequestPack(cpr.roleRank, type)) {
    u.send(
      `${ERR}${val(PACK_DEFS[type].label)} requires Rank ${val(PACK_MIN_RANK[type] + "+")}. Your rank: ${val(cpr.roleRank)}.`,
    );
    return;
  }

  const now      = Date.now();
  const lastUsed = (cpr.roleData.packLastUsed as Record<string, number> | undefined) ?? {};
  if (isPackOnCooldown(lastUsed[type], now)) {
    const hoursLeft = Math.ceil(packCooldownRemaining(lastUsed[type], now) / 3_600_000);
    u.send(`${ERR}${val(PACK_DEFS[type].label)} is on cooldown. Available in ${val(hoursLeft + "h")}.`);
    return;
  }

  const name = u.util.displayName(u.me, u.me);
  const msg  = [
    div(),
    `  %cy[PACK SUPPORT]%cn ${val(name)} calls for ${acc(PACK_DEFS[type].label)}.`,
    ...wrap(PACK_DEFS[type].narrative(cpr.roleRank), 74, "    "),
    div(),
  ].join("\r\n");
  u.send(msg);
  u.here.broadcast?.(msg, { exclude: [u.me.id] });

  const updates: Record<string, unknown> = {
    [`state.cpr.roleData.packLastUsed.${type}`]: now,
  };

  if (type === "medical") {
    if (!canReceiveHealing(cpr)) {
      u.send(`${ERR}The dead cannot be healed by pack support.`);
      return;
    }
    const healed = d6() + d6();
    const { newHp, newWoundState } = applyHealingToChar(cpr, healed);
    updates["state.cpr.hp.current"] = newHp;
    updates["state.cpr.woundState"] = newWoundState;
    u.send([
      `  ${OK}Pack medic patches you up.`,
      row("Healed",  val(healed + " HP")),
      row("HP",      `${val(newHp)}/${val(cpr.hp.max)}`),
      row("Status",  val(newWoundState.toUpperCase())),
    ].join("\r\n"));
  }
  await u.db.modify(u.me.id, "$set", updates);
}
