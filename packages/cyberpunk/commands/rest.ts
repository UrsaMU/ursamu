/**
 * +rest -- Time-Gated Wound Recovery
 * CPR Core p.224 -- Natural and medically assisted recovery.
 */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { bar, div, hdr, lbl, val, acc, dim, ARR, ERR, OK, row, wrap, grid } from "./chargen.ts";
import type { ICPRCharacter } from "../db/schemas.ts";
import {
  isRestComplete,
  calcRestHeal,
  msRemaining,
  msToDisplay,
  type RestType,
} from "../engine/rest.ts";
import { recoverStun } from "../engine/stun.ts";
import { emitGMRestCompleted } from "../engine/emitters.ts";
import { sanitizeGMSummary } from "../engine/validation.ts";

addCmd({
  name: "+rest",
  pattern: /^\+rest(?:\/(start|status|cancel))?\s*(short|long)?/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+rest[/<switch>] [short|long]  -- Manage wound recovery timers.

Short rest (8h): Heals 2d6 HP. Requires a wounded character.
Long rest (24h): Full HP recovery. Available at any wound state.

Switches:
  /start [short|long]   Begin a rest period (default: short).
  /status               Check progress; applies healing when complete.
  /cancel               Cancel an active rest with no healing applied.

Examples:
  +rest/start           Begin a short 8-hour rest.
  +rest/start long      Begin a long 24-hour full-recovery rest.
  +rest/status          Check if rest is complete and collect healing.
  +rest/cancel          Cancel your current rest.`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "status").toLowerCase().trim();
    const arg = (u.cmd.args[1] ?? "short").toLowerCase().trim() as RestType;
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    if (sw === "start")  { await startRest(u, cpr, arg);  return; }
    if (sw === "status") { await checkRest(u, cpr);        return; }
    if (sw === "cancel") { await cancelRest(u, cpr);       return; }
    u.send(`${ERR}Unknown switch ${val("/" + sw)}. Valid: ${val("/start")} ${val("/status")} ${val("/cancel")}`);
  },
});

async function startRest(u: IUrsamuSDK, cpr: ICPRCharacter, type: RestType): Promise<void> {
  if (cpr.restTimer) {
    const remaining = msToDisplay(msRemaining(cpr.restTimer));
    u.send([
      `${ERR}Already in downtime (${val(cpr.restTimer.type)}, ${val(remaining)} left).`,
      `  ${dim("Use")} ${val("+rest/cancel")} ${dim("to stop.")}`,
    ].join("\r\n"));
    return;
  }
  if (cpr.woundState === "dead") { u.send(`${ERR}The dead do not recover.`); return; }
  if (cpr.woundState === "healthy" && type === "short") {
    u.send(`${ERR}You are not wounded. Use ${val("+rest/start long")} for a full recovery rest.`);
    return;
  }
  const durationLabel = type === "short" ? "8 hours" : "24 hours";
  await u.db.modify(u.me.id, "$set", {
    "state.cpr.restTimer": { startedAt: Date.now(), type },
  });
  u.send([
    div(),
    `  ${OK}${val(u.util.displayName(u.me, u.me))} begins ${acc(type)} downtime.`,
    row("Duration", val(durationLabel)),
    row("Check in",  dim("+rest/status to collect healing when complete")),
    div(),
  ].join("\r\n"));
}

async function checkRest(u: IUrsamuSDK, cpr: ICPRCharacter): Promise<void> {
  if (!cpr.restTimer) {
    u.send([
      `${ARR}Not in downtime.`,
      row("HP",     `${val(cpr.hp.current)}/${val(cpr.hp.max)}`),
      row("Status", val(cpr.woundState.toUpperCase())),
    ].join("\r\n"));
    return;
  }
  if (!isRestComplete(cpr.restTimer)) {
    const remaining = msToDisplay(msRemaining(cpr.restTimer));
    u.send([
      `${ARR}Recovery in progress (${val(cpr.restTimer.type)}).`,
      row("Remaining", val(remaining)),
    ].join("\r\n"));
    return;
  }
  await applyRestHealing(u, cpr);
}

async function applyRestHealing(u: IUrsamuSDK, cpr: ICPRCharacter): Promise<void> {
  const { amount, newHp, newWoundState } = calcRestHeal(cpr.restTimer!.type, cpr);
  const restType = cpr.restTimer!.type;
  const restored = recoverStun(cpr);
  await u.db.modify(u.me.id, "$set", {
    "state.cpr.hp.current":  newHp,
    "state.cpr.woundState":  newWoundState,
    "state.cpr.restTimer":   null,
    "state.cpr.stun":        restored.stun,
    "state.cpr.impressedBy": null,
  });
  const name = u.util.displayName(u.me, u.me);
  const healLabel = restType === "long" ? "Full recovery." : `2d6 = ${val(amount)} HP restored.`;
  u.send([
    div(),
    `  ${OK}Downtime complete -- ${healLabel}`,
    row("HP",     `${val(newHp)}/${val(cpr.hp.max)}`),
    row("Status", val(newWoundState.toUpperCase())),
    div(),
  ].join("\r\n"));
  const gmName = sanitizeGMSummary(name);
  emitGMRestCompleted(
    u.me.location ?? "",
    u.me.id,
    gmName,
    sanitizeGMSummary(
      `${gmName} completes a ${restType} rest -- ` +
        `${amount} HP restored, now ${newWoundState.toUpperCase()} ` +
        `(HP: ${newHp}/${cpr.hp.max}).`,
    ),
  );
}

async function cancelRest(u: IUrsamuSDK, cpr: ICPRCharacter): Promise<void> {
  if (!cpr.restTimer) { u.send(`${ERR}You are not currently in downtime.`); return; }
  await u.db.modify(u.me.id, "$set", { "state.cpr.restTimer": null });
  u.send(`${OK}Downtime cancelled. No healing applied.`);
}
