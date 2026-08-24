/** +damage +heal +lazarus +critical — injury & recovery. */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  footer,
  ARR,
  ERR,
  OK,
  bad,
  good,
  header,
  dim,
  gauge,
  divider,
  val,
  ylw,
  plain,
} from "./chrome.ts";
import {
  applyResilience,
} from "../engine/action.ts";
import {
  applyCritical,
  clearCritical,
  forceCriticalRoll,
  formatCriticalStatus,
  rollCritical,
  stabilizeCritical,
  tickCritical,
  woundGlitch,
} from "../engine/damage.ts";
import healingRules from "../data/healing-rules.json" with {
  type: "json",
};
import {
  rollCyberlimbMalfunction,
  rollCybershellCritical,
  rollVehicleCritical,
} from "../engine/crit-tables.ts";
// rollCybershellCritical used with forceCriticalRoll
import {
  getChar,
  getInventory,
  isStaff,
  requireChar,
  saveChar,
} from "../engine/sheet-io.ts";
import { resolveAction } from "../engine/action.ts";
import { gatherBonuses } from "../engine/action.ts";
import {
  applyUseEffect,
  findUsableByEffect,
} from "../engine/use-effect.ts";
import {
  buildFightPayload,
  buildRollPayload,
  emitSprawl,
} from "./frame.ts";
import {
  destroyItem,
  displayName,
  itemData,
} from "../engine/items.ts";
import {
  flavorEnabled,
  setFlavorEnabled,
} from "../engine/combat-flavor.ts";
import {
  drowningPenalty,
  explosiveDamage,
  fallingDamage,
} from "../engine/specialty-combat.ts";

addCmd({
  name: "+damage",
  pattern: /^\+damage\s+(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+damage [<player>=]<n>  — Apply Resilience loss.

Examples:
  +damage 3
  +damage Alice=4`,

  exec: async (u: IUrsamuSDK) => {
    const raw = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const m = raw.match(/^(?:(.+)=)?(-?\d+)$/);
    if (!m) {
      u.send(`${ERR}Usage: ${val("+damage [player=]n")}`);
      return;
    }
    let target = u.me;
    if (m[1]) {
      if (!isStaff(u) && m[1].toLowerCase() !== "me") {
        u.send(`${ERR}Only staff damage others.`);
        return;
      }
      const t = await u.util.target(u.me, m[1], true);
      if (!t) {
        u.send(`${ERR}Not found.`);
        return;
      }
      if (!(await u.canEdit(u.me, t)) && !isStaff(u)) {
        u.send(`${ERR}Permission denied.`);
        return;
      }
      target = t;
    }
    const c = getChar(target);
    if (!c?.chargenComplete) {
      u.send(`${ARR}No live sheet.`);
      return;
    }
    const amt = Math.abs(Number(m[2]));
    const next = applyResilience(c, -amt);
    await saveChar(u, next, target.id);
    let live = next;
    const bits = [
      `${OK}${val(amt)} Resilience off` +
        ` → ${gauge(next.resilience, next.resilienceMax)}` +
        ` ${val(next.resilience)}/${val(next.resilienceMax)}`,
    ];
    if (next.resilience <= 0 && !next.critical) {
      const injury = next.isCybershell
        ? rollCybershellCritical(false)
        : undefined;
      const forced = forceCriticalRoll(next, { injury });
      await saveChar(u, forced.next, target.id);
      live = forced.next;
      bits.push(
        `  ${bad("RES 0")} — critical hit`,
        ...formatCriticalStatus(forced.injury),
      );
    } else if (next.resilience <= 0) {
      bits.push(`  ${bad("RES 0")} — already critical`);
    }
    const text = bits.join("\r\n");
    emitSprawl(
      u,
      "fight",
      buildFightPayload({
        verb: "damage",
        who: String(target.name ?? "you"),
        resilience: live.resilience,
        resilienceMax: live.resilienceMax,
        amount: -amt,
        note: live.resilience <= 0 ? "RES 0" : "",
        critical: live.critical,
      }),
      text,
    );
  },
});

const HEAL = healingRules as {
  firstAid?: { heal?: number; ds?: number };
  stabilize?: { heal?: number; ds?: number };
  lazarusPatch?: number;
  medpro?: {
    cost?: number;
    fullRes?: boolean;
    name?: string;
    blurb?: string;
  };
};

function medproCost(): number {
  return Math.max(0, Number(HEAL.medpro?.cost ?? 250));
}

/**
 * Pay b¥ (always the command runner), clear patient's crit,
 * full Res. Player-facing "visit a medpro".
 */
async function runMedproVisit(
  u: IUrsamuSDK,
  patientObj: { id: string; name?: string },
): Promise<{ ok: boolean; msg: string }> {
  const payer = requireChar(u);
  const patient = getChar(patientObj as never);
  if (!payer) return { ok: false, msg: `${ARR}No sheet.` };
  if (!patient?.chargenComplete) {
    return { ok: false, msg: `${ARR}Patient has no live sheet.` };
  }
  const cost = medproCost();
  if ((payer.bityuan ?? 0) < cost) {
    return {
      ok: false,
      msg: `${ERR}Need ${val(cost)} b¥` +
        ` (have ${val(payer.bityuan)}).`,
    };
  }
  let nextP = clearCritical(patient);
  if (HEAL.medpro?.fullRes !== false) {
    nextP = { ...nextP, resilience: nextP.resilienceMax };
  }
  const nextPay = {
    ...payer,
    bityuan: payer.bityuan - cost,
  };
  if (patientObj.id === u.me.id) {
    await saveChar(u, {
      ...nextP,
      bityuan: nextPay.bityuan,
    });
  } else {
    await saveChar(u, nextP, patientObj.id);
    await saveChar(u, nextPay);
  }
  const who = patientObj.id === u.me.id
    ? "you"
    : val(String(patientObj.name ?? "patient"));
  const clinic = String(
    HEAL.medpro?.name ?? "Street medpro",
  );
  return {
    ok: true,
    msg:
      `${OK}${clinic} treats ${who}. ` +
      `−${val(cost)} b¥ · Res ` +
      `${val(nextP.resilience)}/${val(nextP.resilienceMax)}` +
      ` · critical cleared.`,
  };
}

addCmd({
  name: "+heal",
  pattern: /^\+heal(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+heal[/<switch>] [<player>]  — Field medicine.

  (none) <player>  First aid: COG vs DS10, +2 Res
  /rest            8h safe rest → full Res (no crit)

Crits block first aid — use +stabilize, then medpro.

Examples:
  +heal
  +heal Alice
  +heal/rest`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const raw = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "rest" || raw.toLowerCase() === "rest") {
      const c = requireChar(u);
      if (!c) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      if (c.critical) {
        u.send(
          `${ERR}Critical — rest won't clear it.` +
            ` Stabilize, then medpro` +
            ` (${val("+critical/clear")} staff).`,
        );
        return;
      }
      const next = {
        ...c,
        resilience: c.resilienceMax,
      };
      await saveChar(u, next);
      emitSprawl(
        u,
        "fight",
        buildFightPayload({
          verb: "rest",
          who: String(u.me.name ?? "you"),
          resilience: next.resilience,
          resilienceMax: next.resilienceMax,
          amount: next.resilienceMax,
          note: "Eight hours down.",
        }),
        `${OK}Eight hours down. Res full` +
          ` ${val(next.resilience)}.`,
      );
      return;
    }

    if (sw && sw !== "aid" && sw !== "first") {
      u.send(
        `${ERR}Unknown. ${val("+heal")} · /rest · ` +
          `${val("+stabilize")} · ${val("+lazarus")}`,
      );
      return;
    }

    let target = u.me;
    if (raw) {
      const t = await u.util.target(u.me, raw, true);
      if (!t) {
        u.send(`${ERR}Not found.`);
        return;
      }
      target = t;
    }
    const patient = getChar(target);
    const medic = requireChar(u);
    if (!patient?.chargenComplete || !medic) {
      u.send(`${ARR}Need live sheets on both sides.`);
      return;
    }
    if (patient.critical) {
      const bleed = (patient.critical.bleed ?? 0) > 0 ||
        patient.critical.flags?.includes("dying");
      const nm = String(target.name ?? "");
      u.send(
        `${ERR}Critical — first aid won't clear it.` +
          (bleed
            ? ` ${val("+stabilize " + nm)} first.`
            : "") +
          ` Full clear: ${val("+clinic " + nm)}` +
          ` (${medproCost()} b¥) or staff` +
          ` ${val("+critical/clear")}.`,
      );
      return;
    }
    const ds = Number(HEAL.firstAid?.ds ?? 10);
    const healAmt = Number(HEAL.firstAid?.heal ?? 2);
    const inv = await getInventory(u, u.me);
    const gath = gatherBonuses(
      medic,
      "cognition",
      0,
      [],
      inv.load,
      inv.items,
    );
    const roll = resolveAction({
      stat: "cognition",
      statValue: medic.stats.cognition,
      bonuses: gath.total,
      ds,
      dangerous: false,
    });
    if (!roll.success) {
      const fail =
        `${ARR}${bad("First aid fails")}` +
        ` (total ${val(roll.total)} vs DS${ds}).`;
      emitSprawl(
        u,
        "roll",
        buildRollPayload(roll, { title: "FIRST AID", parts: gath.parts }),
        fail,
      );
      return;
    }
    const next = applyResilience(patient, healAmt);
    await saveChar(u, next, target.id);
    const label = target.id === u.me.id
      ? "you"
      : val(String(target.name));
    emitSprawl(
      u,
      "fight",
      buildFightPayload({
        verb: "heal",
        who: String(target.name ?? "you"),
        resilience: next.resilience,
        resilienceMax: next.resilienceMax,
        amount: healAmt,
        note: `First aid (COG ${roll.total} vs ${ds})`,
      }),
      `${OK}First aid on ${label} +${healAmt} Res → ` +
        `${val(next.resilience)}/${val(next.resilienceMax)}` +
        ` ${dim(`(COG ${roll.total} vs ${ds})`)}`,
    );
    if (target.id !== u.me.id) {
      u.send(
        `${OK}${val(String(u.me.name))} patches you` +
          ` +${healAmt} Res → ` +
          `${val(next.resilience)}/${val(next.resilienceMax)}.`,
        target.id,
      );
    }
  },
});

addCmd({
  name: "+lazarus",
  pattern: /^\+lazarus\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+lazarus [<player>]  — Spend a patch for +3 Res.

Uses a Lazarus from YOUR inventory on you or a patient.
Does not clear criticals (use +stabilize for bleed).

Examples:
  +lazarus
  +lazarus Alice
  use lazarus`,

  exec: async (u: IUrsamuSDK) => {
    const raw = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const medic = requireChar(u);
    if (!medic) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    let patientObj = u.me;
    if (raw) {
      const t = await u.util.target(u.me, raw, true);
      if (!t) {
        u.send(`${ERR}Not found.`);
        return;
      }
      if (!t.flags?.has?.("player")) {
        u.send(`${ERR}Target a player.`);
        return;
      }
      patientObj = t;
    }
    const patient = getChar(patientObj);
    if (!patient?.chargenComplete) {
      u.send(`${ARR}Patient has no live sheet.`);
      return;
    }
    await getInventory(u, u.me);
    const patch = await findUsableByEffect(u, u.me.id, "lazarus");
    if (!patch) {
      u.send(
        `${ERR}No Lazarus Patch on you. ` +
          `${val("+market/buy lazarus")}.`,
      );
      return;
    }
    const r = await applyUseEffect(u, u.me, patch, {
      patient: patientObj,
    });
    if (r.message) {
      const after = getChar(patientObj) ?? patient;
      emitSprawl(
        u,
        "fight",
        buildFightPayload({
          verb: "lazarus",
          who: String(patientObj.name ?? "you"),
          resilience: after.resilience,
          resilienceMax: after.resilienceMax,
          amount: 3,
          note: plain(r.message),
          critical: after.critical,
        }),
        r.message,
      );
    }
  },
});

addCmd({
  name: "+stabilize",
  pattern: /^\+stabilize\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+stabilize [<player>]  — Stop bleed / dying clock.

COG vs DS12. Packs arterial bleed and fatal countdown.
Does NOT clear the critical (Glitch/penalties remain)
until staff medpro +critical/clear.

Examples:
  +stabilize
  +stabilize Alice`,

  exec: async (u: IUrsamuSDK) => {
    const raw = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const medic = requireChar(u);
    if (!medic) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    let target = u.me;
    if (raw) {
      const t = await u.util.target(u.me, raw, true);
      if (!t) {
        u.send(`${ERR}Not found.`);
        return;
      }
      target = t;
    }
    const patient = getChar(target);
    if (!patient?.chargenComplete) {
      u.send(`${ARR}No live sheet on patient.`);
      return;
    }
    if (!patient.critical) {
      u.send(`${ARR}No critical — nothing to stabilize.`);
      return;
    }
    const ds = Number(HEAL.stabilize?.ds ?? 12);
    const healAmt = Number(HEAL.stabilize?.heal ?? 1);
    const inv = await getInventory(u, u.me);
    const gath = gatherBonuses(
      medic,
      "cognition",
      0,
      [],
      inv.load,
      inv.items,
    );
    const used = resolveAction({
      stat: "cognition",
      statValue: medic.stats.cognition,
      bonuses: gath.total,
      ds,
      dangerous: false,
      glitch: woundGlitch(medic),
    });
    if (!used.success) {
      const fail =
        `${ARR}${bad("Stabilize fails")}` +
        ` (total ${val(used.total)} vs DS${ds}).`;
      emitSprawl(
        u,
        "roll",
        buildRollPayload(used, { title: "STABILIZE", parts: gath.parts }),
        fail,
      );
      return;
    }
    const st = stabilizeCritical(patient);
    if (!st.changed) {
      u.send(`${ARR}${st.note}`);
      return;
    }
    let next = st.next;
    if (healAmt > 0 && next.resilience < next.resilienceMax) {
      next = applyResilience(next, healAmt);
    }
    await saveChar(u, next, target.id);
    const who = target.id === u.me.id
      ? "you"
      : val(String(target.name));
    const text = [
      `${OK}Stabilized ${who}. ${st.note}`,
      `  Res ${val(next.resilience)}` +
      `/${val(next.resilienceMax)}` +
      (healAmt ? ` (+${healAmt})` : ""),
      `  ${dim(
        "Crit remains — +clinic to clear, or staff",
      )}`,
    ].join("\r\n");
    emitSprawl(
      u,
      "fight",
      buildFightPayload({
        verb: "stabilize",
        who: String(target.name ?? "you"),
        resilience: next.resilience,
        resilienceMax: next.resilienceMax,
        amount: healAmt,
        note: st.note,
        critical: next.critical,
      }),
      text,
    );
    if (target.id !== u.me.id) {
      u.send(
        `${OK}${val(String(u.me.name))} stabilizes you. ` +
          `${st.note} Res ` +
          `${val(next.resilience)}/${val(next.resilienceMax)}.`,
        target.id,
      );
    }
  },
});

async function clinicExec(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const cost = medproCost();
  const clinic = String(
    HEAL.medpro?.name ?? "Street medpro",
  );
  const blurb = String(
    HEAL.medpro?.blurb ??
      "Pay-per-use. Few questions asked.",
  );

  if (sw === "info" || sw === "cost" || sw === "prices") {
    u.send(
      [
        header("CLINIC"),
        `  ${val(clinic)}`,
        `  ${dim(blurb)}`,
        `  Cost ${val(cost)} b¥` +
        ` · clears crit · full Res`,
        `  ${dim("+clinic · +clinic <player> · /call")}`,
        footer(),
      ].join("\r\n"),
    );
    return;
  }

  if (sw === "call" || sw === "spawn" || sw === "summon") {
    if (!requireChar(u)) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    const roomId = u.here?.id ?? u.me.location;
    if (!roomId) {
      u.send(`${ERR}No room.`);
      return;
    }
    const obj = await u.db.create({
      name: "Street Medpro",
      flags: new Set(["thing"]),
      location: roomId,
      state: {
        sprawl_medpro: {
          cost,
          at: Date.now(),
          by: u.me.id,
        },
        description:
          `${clinic}. ${blurb} ` +
          `Pay ${cost} b¥ via ${val("+clinic")}.`,
        "short-desc": `medpro · ${cost} b¥ · +clinic`,
        attributes: [{
          name: "short-desc",
          value: `medpro · ${cost} b¥ · +clinic`,
        }],
      },
      contents: [],
    });
    if (!obj) {
      u.send(`${ERR}Could not place medpro.`);
      return;
    }
    u.send(
      `${OK}${clinic} is on-site. ` +
        `${dim("look · +clinic to pay")}`,
    );
    return;
  }

  if (sw && !["treat", "visit", "go"].includes(sw)) {
    u.send(
      `${ERR}Unknown. ${val("+clinic")} /info /call` +
        ` · ${val("+clinic Alice")}`,
    );
    return;
  }

  if (!requireChar(u)) {
    u.send(`${ARR}No sheet.`);
    return;
  }
  let patient = u.me;
  if (arg) {
    const t = await u.util.target(u.me, arg, true);
    if (!t) {
      u.send(`${ERR}Not found.`);
      return;
    }
    if (!t.flags?.has?.("player")) {
      u.send(`${ERR}Target a player.`);
      return;
    }
    patient = t;
  }
  const pSheet = getChar(patient);
  if (!pSheet?.chargenComplete) {
    u.send(`${ARR}No live sheet.`);
    return;
  }
  if (
    !pSheet.critical &&
    pSheet.resilience >= pSheet.resilienceMax
  ) {
    u.send(
      `${ARR}No critical and Res full.` +
        ` Save your ${val(cost)} b¥.`,
    );
    return;
  }
  const r = await runMedproVisit(u, patient);
  u.send(r.msg);
  if (r.ok && patient.id !== u.me.id) {
    u.send(
      `${OK}${val(String(u.me.name))} paid a medpro` +
        ` for you. Critical cleared; Res full.`,
      patient.id,
    );
  }
}

const CLINIC_HELP =
  `+clinic[/<switch>] [<player>]  — Visit a medpro.

Pay-per-use street clinic / van medic. Clears critical
and restores full Res. You pay the bill.

  (none) [<player>]  Treat you or a patient
  /call              Spawn Medpro prop in this room
  /info              Cost and blurb

Aliases: +medpro

Examples:
  +clinic
  +clinic Alice
  +clinic/call`;

addCmd({
  name: "+clinic",
  pattern: /^\+clinic(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: CLINIC_HELP,
  exec: clinicExec,
});

addCmd({
  name: "+medpro",
  pattern: /^\+medpro(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+medpro — Same as +clinic.

Examples:
  +medpro
  +medpro Alice
  +medpro/call`,
  exec: clinicExec,
});

addCmd({
  name: "+flavor",
  pattern: /^\+flavor\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+flavor [on|off]  — Combat prose under +attack.

Default on. One street line per swing; numbers stay first.

Examples:
  +flavor
  +flavor on
  +flavor off`,

  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim()
      .toLowerCase();
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    if (!arg) {
      u.send(
        `  Combat flavor: ${
          flavorEnabled(c) ? good("ON") : dim("off")
        }  ${dim("+flavor on|off")}`,
      );
      return;
    }
    if (arg === "on" || arg === "yes" || arg === "1") {
      await saveChar(u, setFlavorEnabled(c, true));
      u.send(`${OK}Combat flavor on.`);
      return;
    }
    if (arg === "off" || arg === "no" || arg === "0") {
      await saveChar(u, setFlavorEnabled(c, false));
      u.send(`${OK}Combat flavor off.`);
      return;
    }
    u.send(`${ERR}Usage: ${val("+flavor on|off")}`);
  },
});

addCmd({
  name: "+critical",
  pattern: /^\+critical(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+critical[/<switch>] [<player>]  — Injury tables + mechanics.

At Res 0: auto-rolls (or +critical). Crits apply Glitch,
location penalties, bleed, and fatal clocks.

Switches:
  (none)|/status  Show current crit mechanics
  /roll|/force    Roll flesh crit (Res 0)
  /shell          Cybershell table (p.37)
  /limb           Cyberlimb fault 2d6 (p.36)
  /vehicle        Vehicle crit d6 (p.104)
  /tick           Bleed / dying clock once
  /slag           Trash worn armour to clear
  /clear          Staff: clear after care

Examples:
  +critical
  +critical/roll
  +critical/slag
  +critical/clear Alice`,

  exec: async (u: IUrsamuSDK) => {
    const rawSw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const sw = rawSw || "status";

    if (sw === "limb" || sw === "cyberlimb" || sw === "fault") {
      const c = requireChar(u);
      if (!c) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      const m = rollCyberlimbMalfunction();
      const next = {
        ...c,
        limbFault: {
          slug: m.slug,
          effect: m.effect,
          glitch: m.glitch,
          at: Date.now(),
        },
      };
      await saveChar(u, next);
      u.send(
        [
          header("CYBERLIMB FAULT"),
          `  2d6 → ${val(m.roll)}`,
          `  ${m.effect}`,
          m.glitch
            ? `  ${bad("Glitch")} on task rolls`
            : `  ${dim("no automatic Glitch")}`,
          footer("CHROME"),
        ].join("\r\n"),
      );
      return;
    }

    if (sw === "vehicle" || sw === "veh" || sw === "hull") {
      const vc = rollVehicleCritical(/stack|bad/i.test(arg));
      u.send(
        [
          header("VEHICLE CRIT"),
          `  d6 → ${val(vc.roll)}` +
          (vc.wrecked ? ` ${bad("WRECK")}` : ""),
          `  ${vc.effect}`,
          footer("WHEELS"),
        ].join("\r\n"),
      );
      return;
    }

    if (sw === "status" || sw === "show" || sw === "view") {
      const c = requireChar(u);
      if (!c) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      if (!c.critical) {
        if (c.resilience <= 0) {
          u.send(
            `${ARR}Res 0, no crit yet — ` +
              `${val("+critical/roll")}.`,
          );
          return;
        }
        u.send(
          `${ARR}No critical. Drop to Res 0 to take one.`,
        );
        return;
      }
      u.send(
        [
          header("CRITICAL"),
          ...formatCriticalStatus(c.critical),
          `  ${dim(
            "+critical/slag armour · staff +critical/clear",
          )}`,
          footer("SPRAWL"),
        ].join("\r\n"),
      );
      return;
    }

    if (sw === "tick" || sw === "bleed") {
      const c = requireChar(u);
      if (!c) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      if (!c.critical) {
        u.send(`${ARR}No critical.`);
        return;
      }
      const ticked = tickCritical(c);
      await saveChar(u, ticked.next);
      const lines = [header("CRIT TICK")];
      if (ticked.lines.length) {
        for (const L of ticked.lines) lines.push(`  ${L}`);
      } else {
        lines.push(`  ${dim("no bleed / clock")}`);
      }
      if (ticked.dead) lines.push(`  ${bad("DEAD")}`);
      else if (ticked.next.critical) {
        lines.push(
          ...formatCriticalStatus(ticked.next.critical),
        );
      }
      lines.push(footer());
      u.send(lines.join("\r\n"));
      return;
    }

    if (sw === "slag") {
      const c = requireChar(u);
      if (!c) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      if (!c.critical) {
        u.send(`${ARR}No critical to slag.`);
        return;
      }
      if (c.critical.flags?.includes("dying")) {
        u.send(
          `${ERR}Fatal wounds need a medpro —` +
            ` armour won't stop the clock.`,
        );
        return;
      }
      const { items } = await getInventory(u, u.me);
      const armour = items.find((o) => {
        const d = itemData(o);
        return d?.kind === "armor" && d.slot === "worn";
      });
      if (!armour) {
        u.send(
          `${ERR}Wear armour first ` +
            `(${val("wear <armour>")}).`,
        );
        return;
      }
      const nm = displayName(armour);
      await destroyItem(u, armour.id);
      await saveChar(u, clearCritical(c));
      u.send(
        `${OK}Slagged ${val(nm)} — critical cleared.` +
          ` Armour is scrap.`,
      );
      return;
    }

    if (sw === "clear") {
      if (!isStaff(u)) {
        u.send(`${ERR}Staff only.`);
        return;
      }
      const t = arg
        ? await u.util.target(u.me, arg, true)
        : u.me;
      if (!t) {
        u.send(`${ERR}Not found.`);
        return;
      }
      const c = getChar(t);
      if (!c) {
        u.send(`${ARR}No sheet.`);
        return;
      }
      await saveChar(u, clearCritical(c), t.id);
      u.send(
        `${OK}Critical cleared on ${val(String(t.name))}.`,
      );
      return;
    }

    // /roll /force /shell — inflict critical
    if (
      !["roll", "force", "shell", "flesh"].includes(sw)
    ) {
      u.send(
        `${ERR}Unknown. ` +
          `${val("+critical")} /roll /slag /tick /limb`,
      );
      return;
    }

    let target = u.me;
    if (arg) {
      if (!isStaff(u)) {
        u.send(`${ERR}Staff only for others.`);
        return;
      }
      const t = await u.util.target(u.me, arg, true);
      if (!t) {
        u.send(`${ERR}Not found.`);
        return;
      }
      target = t;
    }
    const c = getChar(target);
    if (!c?.chargenComplete) {
      u.send(`${ARR}No live sheet.`);
      return;
    }
    if (c.resilience > 0 && !isStaff(u)) {
      u.send(
        `${ARR}Res still ${val(c.resilience)}.` +
          ` Critical at 0 (or staff force).`,
      );
      return;
    }
    const injury = sw === "shell" || c.isCybershell
      ? rollCybershellCritical(!!c.critical)
      : rollCritical(!!c.critical);
    const next = applyCritical(c, injury);
    await saveChar(u, next, target.id);
    const saved = next.critical ?? injury;
    u.send(
      [
        header(
          sw === "shell" || c.isCybershell
            ? "CYBERSHELL CRIT"
            : "CRITICAL",
        ),
        ...formatCriticalStatus(saved),
        `  ${dim(
          "+critical/slag · staff +critical/clear · +heal blocked",
        )}`,
        footer("SPRAWL"),
      ].join("\r\n"),
    );
  },
});
