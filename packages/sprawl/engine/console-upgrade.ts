/**
 * Nodejacker console upgrades: RAM, AI, firewall, logic bomb.
 */
import type { ISprawlChar } from "../db/schemas.ts";
import {
  CONSOLE_UPGRADES,
  find,
} from "./catalog.ts";
import { consoleSpec } from "./net.ts";
import { effectiveCognition } from "./net-state.ts";

export type UpgradeResult =
  | { ok: true; next: ISprawlChar; notes: string[] }
  | { ok: false; error: string };

function d6(rng: () => number): number {
  return 1 + Math.floor(rng() * 6);
}

function upgradeRow(slug: string) {
  return find("consoleUpgrade", slug) ??
    CONSOLE_UPGRADES.find((r) =>
      r.slug === slug ||
      String(r.name ?? "").toLowerCase().includes(slug)
    );
}

function needDeck(c: ISprawlChar) {
  const spec = consoleSpec(c);
  if (!spec) return null;
  return spec;
}

export function buyExtraRam(
  c: ISprawlChar,
  points = 1,
): UpgradeResult {
  const spec = needDeck(c);
  if (!spec) return { ok: false, error: "equip a console first" };
  const n = Math.max(1, Math.floor(points));
  const per = Number(upgradeRow("extra-ram")?.costPer ?? 250);
  let cost = per * n;
  const notes: string[] = [];
  if (spec.tags.includes("surgery-ram")) {
    cost += 500 * n;
    notes.push("Gestalt surgery fee +500/pt");
  }
  if (c.bityuan < cost) {
    return {
      ok: false,
      error: `need ${cost} b¥ (have ${c.bityuan})`,
    };
  }
  if (spec.baseRam + spec.ramBonus <= 0) {
    return { ok: false, error: "drive burned — buy new deck" };
  }
  const next: ISprawlChar = {
    ...c,
    bityuan: c.bityuan - cost,
    consoleRamBonus: (c.consoleRamBonus ?? 0) + n,
  };
  notes.push(
    `+${n} RAM → ${consoleSpec(next)!.ram} (−${cost} b¥)`,
  );
  return { ok: true, next, notes };
}

export function buyExpertAi(
  c: ISprawlChar,
  points = 1,
): UpgradeResult {
  const spec = needDeck(c);
  if (!spec) return { ok: false, error: "equip a console first" };
  const n = Math.max(1, Math.floor(points));
  const have = (c.consoleAiCog ?? 0) + spec.hullAi;
  const cap = Math.max(0, spec.ram);
  if (have + n > cap) {
    return {
      ok: false,
      error: `AI cap is RAM (${cap}); have ${have}`,
    };
  }
  const cost = Number(upgradeRow("expert-ai")?.costPer ?? 1000) *
    n;
  if (c.bityuan < cost) {
    return {
      ok: false,
      error: `need ${cost} b¥ (have ${c.bityuan})`,
    };
  }
  const next: ISprawlChar = {
    ...c,
    bityuan: c.bityuan - cost,
    consoleAiCog: (c.consoleAiCog ?? 0) + n,
  };
  const a = consoleSpec(next)!;
  return {
    ok: true,
    next,
    notes: [
      `+${n} AI Cog → ${a.hullAi + a.aiCog}` +
        ` (−${cost} b¥ · hack +${a.bonus})`,
    ],
  };
}

export function tuneFirewall(
  c: ISprawlChar,
  rng: () => number = Math.random,
): UpgradeResult {
  const spec = needDeck(c);
  if (!spec) return { ok: false, error: "equip a console first" };
  const cap = Math.max(0, spec.ram);
  const have = c.consoleFirewallBonus ?? 0;
  if (have >= cap) {
    return {
      ok: false,
      error: `firewall maxed (+${have} / RAM ${cap})`,
    };
  }
  const ds = Number(upgradeRow("firewall-tune")?.tuneDs ?? 12);
  const total = d6(rng) + d6(rng) + effectiveCognition(c);
  if (total < ds) {
    return {
      ok: false,
      error: `tune failed ${total} vs DS${ds}`,
    };
  }
  const next: ISprawlChar = {
    ...c,
    consoleFirewallBonus: have + 1,
  };
  const a = consoleSpec(next)!;
  return {
    ok: true,
    next,
    notes: [
      `tune ${total} vs DS${ds} — FW DS${a.firewall}` +
        ` (+${a.firewallBonus})`,
    ],
  };
}

export function plantLogicBomb(
  c: ISprawlChar,
  arg = "",
  rng: () => number = Math.random,
): UpgradeResult {
  const spec = needDeck(c);
  if (!spec) return { ok: false, error: "equip a console first" };
  const row = upgradeRow("logic-bomb");
  const parts = arg.toLowerCase().split(/\s+/).filter(Boolean);
  const eventTrigger = parts.includes("event") ||
    parts.includes("trigger");
  const note = parts
    .filter((p) => p !== "event" && p !== "trigger")
    .join(" ")
    .slice(0, 40);
  const ds = eventTrigger
    ? Number(row?.triggerDs ?? 16)
    : Number(row?.programDs ?? 14);
  const total = d6(rng) + d6(rng) + effectiveCognition(c);
  if (total < ds) {
    return {
      ok: false,
      error: `plant failed ${total} vs DS${ds}`,
    };
  }
  return {
    ok: true,
    next: {
      ...c,
      logicBomb: {
        hideDs: ds,
        eventTrigger,
        note: note || undefined,
        at: Date.now(),
      },
    },
    notes: [
      `logic bomb set ${total} vs DS${ds}` +
        (eventTrigger ? " (event)" : " (timed)") +
        (note ? ` · ${note}` : ""),
    ],
  };
}

export function formatUpgradeCatalog(): string[] {
  return CONSOLE_UPGRADES.map((r) => {
    const cost = Number(r.costPer ?? 0);
    const costS = cost > 0
      ? `${cost} b¥/${r.unit ?? "pt"}`
      : "skill";
    const blurb = String(r.blurb ?? r.name ?? "");
    return `  ${r.slug} ${costS} — ${blurb.slice(0, 48)}`;
  });
}
