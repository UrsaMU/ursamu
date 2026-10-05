/**
 * Console hull tag specials (Nodejacker revised decks).
 */
import type { ISprawlChar } from "../db/schemas.ts";
import type { ConsoleSpec } from "./net.ts";
import { netOf, withNet } from "./net-state.ts";

/** Extra software slots from hull (Vision high-storage). */
export function hullSlotBonus(spec: ConsoleSpec): number {
  if (spec.tags.includes("high-storage")) return 2;
  return 0;
}

/** Flat hack bonus from hull quirks (key-cutter, etc.). */
export function hullHackParts(
  spec: ConsoleSpec,
): { bonus: number; parts: string[] } {
  const parts: string[] = [];
  let bonus = 0;
  if (spec.tags.includes("key-cutter")) {
    bonus += 1;
    parts.push("key-cutter +1");
  }
  if (spec.tags.includes("ar-overlay") ||
    spec.tags.includes("ambient-aware")
  ) {
    // minor edge while jacked
    bonus += 0;
  }
  return { bonus, parts };
}

/**
 * Hyperion: extra net action without Glitch penalty.
 * 2nd+ hack this scene: cancel 1 Glitch die.
 */
export function applyHyperionGlitch(
  c: ISprawlChar,
  spec: ConsoleSpec,
  glitch: number,
): { glitch: number; notes: string[]; next: ISprawlChar } {
  const notes: string[] = [];
  let g = glitch;
  let next = c;
  if (!spec.tags.includes("extra-action")) {
    return { glitch: g, notes, next };
  }
  const n = netOf(next);
  const count = (n.hacksThisScene ?? 0) + 1;
  n.hacksThisScene = count;
  next = withNet(next, n);
  if (count >= 2 && g > 0) {
    g -= 1;
    notes.push("Hyperion — multi-action Glitch -1");
  } else if (count === 1) {
    notes.push("Hyperion — 1st action this scene");
  }
  return { glitch: g, notes, next };
}

/** Call on +scene to reset multi-action counter. */
export function resetHullScene(c: ISprawlChar): ISprawlChar {
  const n = netOf(c);
  if (!n.hacksThisScene) return c;
  delete n.hacksThisScene;
  return withNet(c, n);
}

/** Shinobi / durable: DS to physically destroy console. */
export function consoleDestroyDs(spec: ConsoleSpec): number {
  const row = spec.row;
  if (typeof row.destroyDs === "number") return row.destroyDs;
  if (spec.tags.includes("durable") ||
    spec.tags.includes("mil-spec")
  ) {
    return 18;
  }
  return 12;
}

/** Nimbus / immune-ap: ignore anti-personnel soft vs you. */
export function immuneAntiPersonnel(spec: ConsoleSpec): boolean {
  return spec.tags.includes("immune-ap");
}

/**
 * Back-hack destroy attempt vs console.
 * Returns burned if attacker beats destroy DS.
 */
export function rollConsoleDestroy(
  spec: ConsoleSpec,
  attackerTotal: number,
): { destroyed: boolean; ds: number } {
  const ds = consoleDestroyDs(spec);
  return { destroyed: attackerTotal > ds, ds };
}
