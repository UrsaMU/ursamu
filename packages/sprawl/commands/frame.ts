/**
 * Structured command frames for the Sprawl Goons client.
 *
 * Rule: add the JSON payload here first. The Flutter / cyber-d6
 * interface is updated only after this contract exists.
 *
 * Telnet still gets chrome text. Web/Flutter sessions get
 * `{ type: "layout", meta: { type: "sprawl", kind, data } }`.
 */
import type { IUrsamuSDK, IDBObj } from "@ursamu/ursamu";
import type { ISprawlChar } from "../db/schemas.ts";
import type { IActionResult } from "../engine/action.ts";
import { displayName, itemData } from "../engine/items.ts";
import { plain } from "./chrome.ts";
import { shortStat } from "./attack-shared.ts";

export const SPRAWL_UI = "sprawl";

export type SprawlKind = "sheet" | "roll" | "fight" | "notice";

export type SheetGearRow = {
  name: string;
  load: number;
  slot: string;
};

export type SheetAugRow = {
  slug: string;
  name: string;
};

export type SheetPayload = {
  name: string;
  role: string;
  status: "LIVE" | "DRAFT";
  stats: {
    morphology: number;
    equilibrium: number;
    reaction: number;
    cognition: number;
    affinity: number;
  };
  resilience: number;
  resilienceMax: number;
  load: number;
  loadMax: number;
  cash: number;
  ap: number;
  apTotal: number;
  level: number;
  edge: string;
  background: string;
  quirks: string[];
  affectations: string[];
  augs: SheetAugRow[];
  gear: SheetGearRow[];
  critical: {
    location: string;
    severity: number;
    effect: string;
  } | null;
};

export function prefersSprawlJson(u: IUrsamuSDK): boolean {
  return u.clientType === "web" &&
    typeof u.ui?.layout === "function";
}

export type RollPayload = {
  verb: "roll" | "attack";
  title: string;
  stat: string;
  statShort: string;
  statValue: number;
  bonuses: number;
  total: number;
  ds: number;
  success: boolean;
  margin: number;
  damageToTarget: number;
  damageToSelf: number;
  needNerveCheck: boolean;
  mode: string;
  dice: number[];
  kept: number[];
  explodeBonus: number;
  doubleSix: boolean;
  doubleOne: boolean;
  parts: string[];
  flavor: string;
  target: string;
};

export type FightPayload = {
  verb: string;
  ok: boolean;
  who: string;
  resilience: number;
  resilienceMax: number;
  amount: number;
  note: string;
  critical: {
    location: string;
    severity: number;
    effect: string;
  } | null;
};

export function emitSprawl(
  u: IUrsamuSDK,
  kind: SprawlKind,
  data: object,
  text: string,
): void {
  if (prefersSprawlJson(u)) {
    u.ui.layout({
      components: [
        { type: "header", title: kind.toUpperCase() },
        { type: "text", content: plain(text) },
      ],
      meta: { type: SPRAWL_UI, kind, data },
    });
    return;
  }
  u.send(text);
}

export function sheetGear(items: IDBObj[]): SheetGearRow[] {
  return items.map((obj) => {
    const d = itemData(obj);
    return {
      name: displayName(obj),
      load: d?.load ?? 0,
      slot: String(d?.slot ?? "carried"),
    };
  });
}

export function buildSheetPayload(
  c: ISprawlChar,
  opts: {
    name: string;
    load: number;
    loadMax: number;
    gear: SheetGearRow[];
  },
): SheetPayload {
  const crit = c.critical;
  return {
    name: opts.name,
    role: (c.backgroundName || "GOON").toUpperCase(),
    status: c.chargenComplete ? "LIVE" : "DRAFT",
    stats: {
      morphology: c.stats.morphology,
      equilibrium: c.stats.equilibrium,
      reaction: c.stats.reaction,
      cognition: c.stats.cognition,
      affinity: c.stats.affinity,
    },
    resilience: c.resilience,
    resilienceMax: c.resilienceMax,
    load: opts.load,
    loadMax: opts.loadMax,
    cash: c.bityuan,
    ap: c.ap,
    apTotal: c.apTotal ?? 0,
    level: c.level,
    edge: c.edgeName || "",
    background: c.backgroundName || "",
    quirks: [...c.quirks],
    affectations: [...c.affectations],
    augs: c.augs.map((a) => ({ slug: a.slug, name: a.name })),
    gear: opts.gear,
    critical: crit
      ? {
        location: crit.location,
        severity: crit.severity,
        effect: crit.effect,
      }
      : null,
  };
}

export function buildRollPayload(
  r: IActionResult,
  opts: {
    verb?: "roll" | "attack";
    title?: string;
    parts?: string[];
    flavor?: string;
    target?: string;
  } = {},
): RollPayload {
  return {
    verb: opts.verb ?? "roll",
    title: opts.title ?? "ACTION ROLL",
    stat: r.stat,
    statShort: shortStat(r.stat),
    statValue: r.statValue,
    bonuses: r.bonuses,
    total: r.total,
    ds: r.ds,
    success: r.success,
    margin: r.margin,
    damageToTarget: r.damageToTarget,
    damageToSelf: r.damageToSelf,
    needNerveCheck: r.needNerveCheck,
    mode: r.mode,
    dice: [...r.dice.dice],
    kept: [...r.dice.kept],
    explodeBonus: r.dice.explodeBonus,
    doubleSix: r.dice.doubleSix,
    doubleOne: r.dice.doubleOne,
    parts: [...(opts.parts ?? r.tags)],
    flavor: opts.flavor ?? "",
    target: opts.target ?? "",
  };
}

export function buildFightPayload(opts: {
  verb: string;
  ok?: boolean;
  who: string;
  resilience: number;
  resilienceMax: number;
  amount?: number;
  note?: string;
  critical?: ISprawlChar["critical"];
}): FightPayload {
  const crit = opts.critical;
  return {
    verb: opts.verb,
    ok: opts.ok !== false,
    who: opts.who,
    resilience: opts.resilience,
    resilienceMax: opts.resilienceMax,
    amount: opts.amount ?? 0,
    note: opts.note ?? "",
    critical: crit
      ? {
        location: crit.location,
        severity: crit.severity,
        effect: crit.effect,
      }
      : null,
  };
}
