// +mantle — show seasonal Mantle bonuses; claim court Glamour beat.

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  mantleBonusHelp,
  mantleConvertClarity,
  mantleWipeDebt,
  ownMantle,
} from "../form/index.ts";
import { isChangelingSheet } from "../form/mask.ts";
import { COFD_TEMPLATES } from "../gamelines/templates.ts";
import {
  getSheet,
  persistSheet,
} from "./hedge_helpers.ts";

export async function mantleCommand(
  u: IUrsamuSDK,
): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  if (sw === "glamour" || sw === "gain") {
    return await mantleGlamour(u, rest);
  }
  if (sw === "debt" || sw === "wipe") {
    return await mantleDebt(u);
  }
  if (sw === "clarity" || sw === "convert") {
    return await mantleClarity(u);
  }
  return await mantleStatus(u);
}

async function mantleDebt(u: IUrsamuSDK): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet || !isChangelingSheet(sheet)) {
    u.send("Only changelings.");
    return;
  }
  const r = mantleWipeDebt(sheet);
  if (!r.ok || !r.sheet) {
    u.send(r.reason ?? "Cannot wipe debt.");
    return;
  }
  await persistSheet(u, u.me.id, r.sheet);
  u.send(r.lines.join("\n"));
}

async function mantleClarity(u: IUrsamuSDK): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet || !isChangelingSheet(sheet)) {
    u.send("Only changelings.");
    return;
  }
  const r = mantleConvertClarity(sheet);
  if (!r.ok || !r.sheet) {
    u.send(r.reason ?? "Cannot convert.");
    return;
  }
  await persistSheet(u, u.me.id, r.sheet);
  u.send(r.lines.join("\n"));
}

async function mantleStatus(u: IUrsamuSDK): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet || !isChangelingSheet(sheet)) {
    u.send("Only changelings have Court Mantle.");
    return;
  }
  const court = (sheet.customFields?.court ?? "—").toString();
  const dots = ownMantle(sheet);
  const lines = [
    await divider("M A N T L E"),
    `  Court: %cy${court}%cn  Dots: ${dots}`,
    ...mantleBonusHelp(sheet),
    "  Set dots: +sheet/set mantle:spring=2",
    "  Rolls auto-apply when pools match (e.g. Presence+Persuasion).",
    "  Force context: +roll/seduce Presence+Persuasion",
    "  Claim court Glamour moment: +mantle/glamour <note>",
    "  High-dot: +mantle/debt (Autumn••••)  " +
      "+mantle/clarity (Spring•••••)",
    "  Summer••••• +roll/defend aggravated; " +
      "Summer••• +roll/protect armor",
  ];
  u.send(lines.join("\n"));
}

/**
 * Claim the once-per-scene Mantle Glamour regain
 * (court emotion roleplay — ST honor system).
 */
async function mantleGlamour(
  u: IUrsamuSDK,
  note: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet || !isChangelingSheet(sheet)) {
    u.send("Only changelings.");
    return;
  }
  if (ownMantle(sheet) < 1) {
    u.send("Need at least Mantle • to claim court Glamour.");
    return;
  }
  const flags = sheet.hedgeState?.fruitFlags ?? [];
  const now = Date.now();
  const used = flags.find((f) => f.key === "mantleGlamour");
  if (used && used.until > now) {
    u.send("Already claimed Mantle Glamour this scene (~1h).");
    return;
  }
  const tmpl = COFD_TEMPLATES.changeling;
  const max = tmpl.energyMaxFormula(sheet.powerStatValue || 1);
  const cur = sheet.energyCurrent ?? 0;
  if (cur >= max) {
    u.send("Glamour already full.");
    return;
  }
  const nextFlags = [
    ...flags.filter((f) => f.key !== "mantleGlamour"),
    { key: "mantleGlamour", until: now + 3600_000 },
  ];
  const next = {
    ...sheet,
    energyCurrent: cur + 1,
    hedgeState: {
      ...(sheet.hedgeState ?? {}),
      fruitFlags: nextFlags,
    },
  };
  await persistSheet(u, u.me.id, next);
  const court = sheet.customFields?.court ?? "court";
  u.send(
    `Mantle (${court}): Glamour +1` +
      (note ? ` — ${note.slice(0, 50)}` : "") +
      ` (now ${next.energyCurrent}/${max}).`,
  );
}
