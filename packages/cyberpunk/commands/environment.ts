/**
 * +hazard -- GM Environmental Hazard Tools
 * Source: CPR Core p.199-206
 */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import type { ICPRCharacter } from "../db/schemas.ts";
import { applyDamageToChar } from "../engine/character.ts";
import { div, lbl, val, acc, dim, ERR, OK, row } from "./chargen.ts";

// ─── Pure calculation helpers (exported for tests) ───────────────────────────

/**
 * Calculate fall damage dice count: 1d6 per 2 meters (rounded up).
 * Minimum 1d6.
 * Source: CPR Core p.199
 */
export const fallDiceCount = (meters: number): number =>
  Math.max(1, Math.ceil(meters / 2));

/**
 * Roll fall damage (bypasses armor).
 * Returns total HP damage.
 */
export const rollFallDamage = (meters: number): number => {
  const dice = fallDiceCount(meters);
  let total = 0;
  for (let i = 0; i < dice; i++) {
    total += Math.floor(Math.random() * 6) + 1;
  }
  return total;
};

/**
 * Roll fire damage: 3 HP direct (bypasses armor) per round.
 * Source: CPR Core p.200
 */
export const fireDamage = (): number => 3;

/**
 * Roll electrocution damage (bypasses armor).
 * light = 1d6, heavy = 2d6.
 * Source: CPR Core p.203
 */
export const rollElectrocutionDamage = (severity: "light" | "heavy"): number => {
  const dice = severity === "heavy" ? 2 : 1;
  let total = 0;
  for (let i = 0; i < dice; i++) {
    total += Math.floor(Math.random() * 6) + 1;
  }
  return total;
};

// ─── Command ─────────────────────────────────────────────────────────────────

addCmd({
  name: "+hazard",
  pattern: /^\+hazard(?:\/(\S+))?\s*(.*)/i,
  lock: "connected admin+",
  category: "Cyberpunk RED",
  help: `+hazard/<switch> <target> [args]  -- Apply environmental hazards (GM only).

Switches:
  /fire <target>                Apply 3 HP direct fire damage (bypasses SP).
                                Use each round the target remains on fire.
  /extinguish <target>          Remove the on-fire flag from target.
  /drown <target>               Apply 3 HP direct drowning damage (per round submerged).
  /fall <target> <meters>       Apply falling damage: 1d6 per 2m (rounded up), bypasses SP.
  /electrocute <target> [light|heavy]
                                Apply electrocution damage (bypasses SP).
                                light = 1d6 (default), heavy = 2d6.

Examples:
  +hazard/fire Rogue            Apply one round of fire damage to Rogue.
  +hazard/extinguish Rogue      Put Rogue out.
  +hazard/drown Rogue           Apply one round of drowning damage to Rogue.
  +hazard/fall Rogue 5          Rogue falls 5 meters (3d6 impact damage).
  +hazard/electrocute Rogue heavy  Hit Rogue with industrial current (2d6).`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (!sw) {
      u.send(`${ERR}Usage: ${val("+hazard/<switch> <target> [args]")}. Type ${val("+help +hazard")} for details.`);
      return;
    }

    switch (sw) {
      case "fire":        await applyFire(u, arg); break;
      case "extinguish":  await extinguish(u, arg); break;
      case "drown":       await applyDrown(u, arg); break;
      case "fall":        await applyFall(u, arg); break;
      case "electrocute": await applyElectrocute(u, arg); break;
      default:
        u.send(`${ERR}Unknown switch ${val("/" + sw)}. Type ${val("+help +hazard")} for valid switches.`);
    }
  },
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function resolveTarget(u: IUrsamuSDK, targetName: string) {
  if (!targetName) {
    u.send(`${ERR}Specify a target.`);
    return null;
  }
  const target = await u.util.target(u.me, targetName || "", true);
  if (!target) { u.send(`${ERR}Target not found.`); return null; }
  const cpr = target.state.cpr as ICPRCharacter | undefined;
  if (!cpr?.chargenComplete) {
    u.send(`${ERR}${u.util.displayName(target, u.me)} has no character sheet.`);
    return null;
  }
  return { target, cpr };
}

async function applyDirectDamage(
  u: IUrsamuSDK,
  targetName: string,
  damage: number,
  hazardLabel: string,
  detail: string,
): Promise<void> {
  const resolved = await resolveTarget(u, targetName);
  if (!resolved) return;
  const { target, cpr } = resolved;

  const { char: updated, newWoundState } = applyDamageToChar(cpr, damage);
  await u.db.modify(target.id, "$set", {
    "state.cpr.hp": updated.hp,
    "state.cpr.woundState": updated.woundState,
  });

  const name = u.util.displayName(target, u.me);
  const gmMsg = [
    div(),
    `  ${lbl(hazardLabel)}`,
    row("TARGET",  val(name)),
    row("DETAIL",  acc(detail)),
    row("DAMAGE",  `${val(String(damage))} ${dim("(bypasses SP)")}`),
    row("HP",      `${val(String(updated.hp.current))} / ${dim(String(updated.hp.max))}`),
    row("STATUS",  val(newWoundState.toUpperCase())),
    div(),
  ].join("\r\n");

  const targetMsg = [
    `  ${ERR}Environmental hazard hits you! ${acc(detail)}`,
    row("DAMAGE", `${val(String(damage))} ${dim("(bypasses SP)")}`),
    row("HP",     `${val(String(updated.hp.current))} / ${dim(String(updated.hp.max))}`),
    row("STATUS", val(newWoundState.toUpperCase())),
  ].join("\r\n");

  u.send(gmMsg);
  u.send(targetMsg, target.id);
  u.here.broadcast?.(
    `  ${ERR}${val(name)} takes ${val(String(damage))} ${dim(detail)} damage!`,
    u.me.id,
  );
}

async function applyFire(u: IUrsamuSDK, arg: string): Promise<void> {
  const targetName = arg.trim();
  const damage = fireDamage();
  await applyDirectDamage(u, targetName, damage, "HAZARD :: FIRE", "3 HP fire / round");
}

async function extinguish(u: IUrsamuSDK, arg: string): Promise<void> {
  const targetName = arg.trim();
  if (!targetName) { u.send(`${ERR}Specify a target.`); return; }
  const target = await u.util.target(u.me, targetName || "", true);
  if (!target) { u.send(`${ERR}Target not found.`); return; }

  const name = u.util.displayName(target, u.me);
  // Remove onFire flag if present (stored in activeEffects as { type: "onFire" })
  const cpr = target.state.cpr as ICPRCharacter | undefined;
  if (cpr) {
    const filtered = (cpr.activeEffects ?? []).filter(
      (e) => (e as unknown as { type: string }).type !== "onFire",
    );
    await u.db.modify(target.id, "$set", { "state.cpr.activeEffects": filtered });
  }

  u.send(`${OK}${val(name)} extinguished -- fire status cleared.`);
  u.send(`  ${OK}You have been put out. The flames are gone.`, target.id);
  u.here.broadcast?.(
    `  ${OK}${val(name)} ${dim("-- fire extinguished.")}`,
    u.me.id,
  );
}

async function applyDrown(u: IUrsamuSDK, arg: string): Promise<void> {
  const targetName = arg.trim();
  const damage = 3; // 3 HP direct per round, per simplified rule
  await applyDirectDamage(u, targetName, damage, "HAZARD :: DROWNING", "3 HP / round submerged");
}

async function applyFall(u: IUrsamuSDK, arg: string): Promise<void> {
  // arg format: "<target> <meters>"
  const parts = arg.split(/\s+/);
  const metersStr = parts[parts.length - 1];
  const targetName = parts.slice(0, -1).join(" ").trim();

  const meters = parseFloat(metersStr);
  if (!targetName || isNaN(meters) || meters <= 0) {
    u.send(`${ERR}Usage: ${val("+hazard/fall <target> <meters>")}`);
    return;
  }

  const dice = fallDiceCount(meters);
  const damage = rollFallDamage(meters);
  const detail = `fall ${meters}m (${dice}d6 impact)`;
  await applyDirectDamage(u, targetName, damage, "HAZARD :: FALL", detail);
}

async function applyElectrocute(u: IUrsamuSDK, arg: string): Promise<void> {
  // arg format: "<target> [light|heavy]"
  const parts = arg.split(/\s+/);
  const last = (parts[parts.length - 1] ?? "").toLowerCase();
  let severity: "light" | "heavy" = "light";
  let targetName: string;

  if (last === "light" || last === "heavy") {
    severity = last;
    targetName = parts.slice(0, -1).join(" ").trim();
  } else {
    targetName = arg.trim();
  }

  if (!targetName) {
    u.send(`${ERR}Usage: ${val("+hazard/electrocute <target> [light|heavy]")}`);
    return;
  }

  const damage = rollElectrocutionDamage(severity);
  const diceLabel = severity === "heavy" ? "2d6" : "1d6";
  const detail = `${severity} current (${diceLabel})`;
  await applyDirectDamage(u, targetName, damage, "HAZARD :: ELECTROCUTION", detail);
}
