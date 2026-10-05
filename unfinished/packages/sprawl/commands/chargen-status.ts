/**
 * +chargen status panel — steps, stats primer, next action.
 */
import {
  OK,
  dim,
  divider,
  panelClose,
  panelOpen,
  scan,
  val,
  ylw,
} from "./chrome.ts";
import {
  type ISprawlChar,
  type ISprawlStats,
  STAT_KEYS,
  type StatKey,
  statTotal,
} from "../db/schemas.ts";
import { CHARGEN, STATS } from "../engine/catalog.ts";

const STAT_HINT: Record<StatKey, string> = {
  morphology: "melee, strength, climb",
  equilibrium: "nerve, stress, cool",
  reaction: "aim, shoot, sneak, drive",
  cognition: "hack, perceive, learn",
  affinity: "persuade, con, bluff",
};

const STAT_ABBR: Record<StatKey, string> = {
  morphology: "MOR",
  equilibrium: "EQU",
  reaction: "REA",
  cognition: "COG",
  affinity: "AFF",
};

/** One-line primer for each core stat. */
export function statsPrimer(stats: ISprawlStats): string[] {
  const lines = [
    divider("STATS"),
    `  Spend ${val(CHARGEN.statPoints)} points total` +
    ` (${dim("0–4 each")}). ` +
    `Abbr OK: ${dim("mor equ rea cog aff")}`,
  ];
  for (const key of STAT_KEYS) {
    const meta = STATS.find((r) => r.slug === key);
    const abbr = String(meta?.abbr ?? STAT_ABBR[key]);
    const name = String(meta?.name ?? key);
    const n = stats[key] ?? 0;
    const use = STAT_HINT[key];
    const nCol = val(String(n).padStart(1));
    lines.push(
      `  ${ylw(abbr.padEnd(3))} ${name.padEnd(11)} ` +
        `${nCol}  ${dim(use)}`,
    );
  }
  const spent = statTotal(stats);
  const left = CHARGEN.statPoints - spent;
  lines.push(
    `  Budget ${val(spent)}/${val(CHARGEN.statPoints)}` +
    (left > 0
      ? `  ${dim(left + " left to place")}`
      : spent === CHARGEN.statPoints
      ? `  ${OK}full`
      : `  ${dim("over — lower a stat")}`),
  );
  if (left > 0) {
    lines.push(
      `  ${dim("e.g.")} ${val("+chargen/stat reaction=2")}`,
    );
    lines.push(
      `  ${dim("then")} ${val("+chargen/stat cognition=1")}` +
        `  ${val("+chargen/stat affinity=1")}`,
    );
  }
  return lines;
}

export function nextHint(c: ISprawlChar): string {
  if (c.chargenStatus === "none") {
    return "+chargen/start";
  }
  const spent = statTotal(c.stats);
  const need = CHARGEN.statPoints - spent;
  if (need > 0) {
    return `+chargen/stat reaction=2  (${need} pt left)`;
  }
  if (!c.background) {
    return "+chargen/background roll  (or slug)";
  }
  const bp = c.belongingsPicked ?? 0;
  if (bp < CHARGEN.belongings) {
    return `+chargen/belongings roll  (${bp}/` +
      `${CHARGEN.belongings})`;
  }
  if (c.bityuan <= 0) return "+chargen/cash";
  if (c.chargenStatus === "draft" ||
    c.chargenStatus === "revision") {
    return "+chargen/submit";
  }
  if (c.chargenStatus === "submitted") {
    return "wait for staff (+sheet when approved)";
  }
  return "+sheet";
}

function stepsOverview(c: ISprawlChar): string[] {
  const spent = statTotal(c.stats);
  const mark = (ok: boolean) => ok ? OK : dim("·");
  const bp = c.belongingsPicked ?? 0;
  return [
    divider("STEPS"),
    `  ${mark(c.chargenStatus !== "none")}` +
    ` 1 ${val("+chargen/start")}     open draft`,
    `  ${mark(spent >= CHARGEN.statPoints)}` +
    ` 2 ${val("+chargen/stat")}      place ` +
    `${val(CHARGEN.statPoints)} points`,
    `  ${mark(!!c.background)}` +
    ` 3 ${val("+chargen/background")} pick or roll`,
    `  ${mark(bp >= CHARGEN.belongings)}` +
    ` 4 ${val("+chargen/belongings")} ×` +
    `${val(CHARGEN.belongings)} gear rolls`,
    `  ${mark(c.bityuan > 0)}` +
    ` 5 ${val("+chargen/cash")}      2d6×100 b¥`,
    `  ${mark(
      c.chargenStatus === "submitted" ||
        c.chargenStatus === "approved" ||
        c.chargenComplete,
    )}` +
    ` 6 ${val("+chargen/submit")}    staff review`,
  ];
}

function progressBits(c: ISprawlChar): string[] {
  const pts = CHARGEN.statPoints;
  const spent = statTotal(c.stats);
  return [
    divider("PROGRESS"),
    `  Stats ${val(spent)}/${val(pts)}` +
    (spent === pts ? ` ${OK}ok` : ` ${dim("need " + pts)}`),
    `  Background ${
      c.backgroundName
        ? val(c.backgroundName)
        : dim("unset — +chargen/list backgrounds")
    }`,
    `  Belongings ${val(c.belongingsPicked ?? 0)}` +
    `/${val(CHARGEN.belongings)}`,
    `  Cash ${val(c.bityuan)} b¥`,
  ];
}

/** Full +chargen panel (bare command and after /start). */
export function checklist(c: ISprawlChar): string[] {
  const lines = [
    panelOpen("CHARGEN", c.chargenStatus),
    scan(),
    ...statsPrimer(c.stats),
    ...progressBits(c),
    `  ${ylw("Next:")} ${val(nextHint(c))}`,
    ...stepsOverview(c),
    divider("HELP"),
    `  ${dim("Browse")} ${val("+chargen/list stats")}` +
      `  ${val("+chargen/list backgrounds")}`,
    `  ${dim("More")} ${val("+help chargen")}` +
      `  ${val("+chargen/info <slug>")}`,
    panelClose("SPRAWL"),
  ];
  return lines;
}

/** Compact confirm after +chargen/stat. */
export function statAssignLines(
  c: ISprawlChar,
  key: StatKey,
  n: number,
): string[] {
  const abbr = STAT_ABBR[key];
  const spent = statTotal(c.stats);
  const lines = [
    `${OK}${ylw(abbr)} ${key} = ${val(n)}` +
    `  (${val(spent)}/${val(CHARGEN.statPoints)} points)`,
  ];
  for (const k of STAT_KEYS) {
    const a = STAT_ABBR[k];
    const v = c.stats[k] ?? 0;
    lines.push(
      `  ${dim(a)} ${String(v)}` +
        (k === key ? ` ${ylw("←")}` : ""),
    );
  }
  lines.push(`  ${ylw("Next:")} ${val(nextHint(c))}`);
  return lines;
}

/** Usage help when +chargen/stat parse fails. */
export function statUsageLines(): string[] {
  return [
    panelOpen("CHARGEN STAT"),
    `  Usage ${val("+chargen/stat <stat>=<0-4>")}`,
    `  Spend exactly ${val(CHARGEN.statPoints)}` +
    ` points across five stats.`,
    ...statsPrimer({
      morphology: 0,
      equilibrium: 0,
      reaction: 0,
      cognition: 0,
      affinity: 0,
    }).slice(1),
    panelClose("SPRAWL"),
  ];
}
