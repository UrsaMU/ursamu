// Seasonal Mantle passive dice bonuses (CtL p.117–118).
// Applied to mundane roll expressions when Mantle dots qualify.

import type { CofdSheet } from "../stats/sheet.ts";
import { ownMantle } from "./mantle.ts";

export type CourtKey = "spring" | "summer" | "autumn" | "winter";

export interface MantleBonusResult {
  bonus: number;
  label: string;
  court: CourtKey | "";
  dots: number;
}

function courtOf(sheet: CofdSheet): CourtKey | "" {
  const c = (sheet.customFields?.court ?? "").toLowerCase().trim();
  if (
    c === "spring" || c === "summer" ||
    c === "autumn" || c === "winter"
  ) {
    return c;
  }
  return "";
}

/** Normalize roll expr for matching (lowercase, no spaces). */
function norm(expr: string): string {
  return expr.toLowerCase().replace(/\s+/g, "");
}

/**
 * Return Mantle bonus dice for a mundane roll expression.
 * Only applies to changelings with Mantle dots; Contracts/Wyrd-heavy
 * pools are skipped when the expr already includes mantle/wyrd as
 * power traits for court contracts (still OK if only skills).
 */
export function mantleRollBonus(
  sheet: CofdSheet,
  expr: string,
  opts: {
    /** Explicit context from +roll/mantle=seduce etc. */
    context?: string;
    /** Freehold defense / protector scene flags. */
    defendFae?: boolean;
    protector?: boolean;
    spying?: boolean;
  } = {},
): MantleBonusResult {
  const empty: MantleBonusResult = {
    bonus: 0,
    label: "",
    court: "",
    dots: 0,
  };
  if ((sheet.template ?? "").toLowerCase() !== "changeling") {
    return empty;
  }
  const court = courtOf(sheet);
  if (!court) return empty;
  const dots = ownMantle(sheet);
  if (dots < 1) return empty;

  const e = norm(expr);
  const ctx = (opts.context ?? "").toLowerCase().trim();
  // Skip pure power-stat / contract-style if only Wyrd
  if (e === "wyrd" || e === "mantle") return empty;

  let bonus = 0;
  let label = "";

  if (court === "spring") {
    // • seduce/attract
    if (
      dots >= 1 &&
      (ctx === "seduce" || ctx === "attract" ||
        /presence\+(persuasion|socialize)/.test(e) ||
        /manipulation\+persuasion/.test(e) ||
        /persuasion\+presence/.test(e))
    ) {
      bonus = dots;
      label = `Mantle Spring• seduce/attract(+${dots})`;
    }
    // •• over-indulgence
    if (
      dots >= 2 &&
      (ctx === "indulge" || ctx === "indulgence" ||
        e.includes("socialize") ||
        (e.includes("streetwise") && e.includes("manipulation")))
    ) {
      if (bonus < dots) {
        bonus = dots;
        label = `Mantle Spring•• indulge(+${dots})`;
      }
    }
    // ••• teamwork help ally
    if (dots >= 3 && (ctx === "teamwork" || ctx === "aid")) {
      bonus = dots;
      label = `Mantle Spring••• teamwork(+${dots})`;
    }
  } else if (court === "summer") {
    // • intimidate
    if (
      dots >= 1 &&
      (ctx === "intimidate" || ctx === "cow" ||
        e.includes("intimidation"))
    ) {
      bonus = dots;
      label = `Mantle Summer• intimidate(+${dots})`;
    }
    // •• attack defending freehold vs fae
    if (
      dots >= 2 &&
      opts.defendFae &&
      (e.includes("brawl") || e.includes("weaponry") ||
        e.includes("firearms") || ctx === "attack")
    ) {
      bonus = dots;
      label = `Mantle Summer•• defend(+${dots})`;
    }
  } else if (court === "autumn") {
    // • investigate True Fae / Faerie
    if (
      dots >= 1 &&
      (ctx === "fae" || ctx === "investigate-fae" ||
        e.includes("occult") ||
        (e.includes("investigation") && e.includes("occult")))
    ) {
      // Occult alone is common for fae lore
      if (
        ctx === "fae" || ctx === "investigate-fae" ||
        e.includes("occult")
      ) {
        bonus = dots;
        label = `Mantle Autumn• fae lore(+${dots})`;
      }
    }
    // •• intimidate / instill fear
    if (
      dots >= 2 &&
      (ctx === "fear" || ctx === "intimidate" ||
        e.includes("intimidation"))
    ) {
      bonus = dots;
      label = `Mantle Autumn•• fear(+${dots})`;
    }
  } else if (court === "winter") {
    // • spy unnoticed — enemies penalized; we bonus stealth/investigation spy
    if (
      dots >= 1 &&
      (opts.spying || ctx === "spy" || ctx === "spying" ||
        e.includes("stealth"))
    ) {
      bonus = dots;
      label = `Mantle Winter• spy(+${dots})`;
    }
    // •• obscure the truth
    if (
      dots >= 2 &&
      (ctx === "lie" || ctx === "subterfuge" ||
        e.includes("subterfuge"))
    ) {
      bonus = dots;
      label = `Mantle Winter•• lie(+${dots})`;
    }
  }

  if (bonus <= 0) return empty;
  return { bonus, label, court, dots };
}

/** One-line help for own court Mantle dots. */
export function mantleBonusHelp(sheet: CofdSheet): string[] {
  const court = courtOf(sheet);
  const dots = ownMantle(sheet);
  if (!court || dots < 1) {
    return ["  No Mantle dots on sheet (mantle:<court>)."];
  }
  const lines = [
    `  Mantle (${court}) ${"•".repeat(Math.min(5, dots))} (${dots})`,
  ];
  if (court === "spring") {
    lines.push("  • seduce/attract  •• indulge  ••• teamwork");
    lines.push("  Glamour: overstep bounds for desire.");
  } else if (court === "summer") {
    lines.push("  • intimidate  •• attack defending freehold");
    lines.push("  Glamour: wrath that furthers a goal.");
  } else if (court === "autumn") {
    lines.push("  • Occult/fae lore  •• intimidate/fear");
    lines.push("  Glamour: overcome fear to investigate.");
  } else {
    lines.push("  • Stealth/spy  •• Subterfuge/lie");
    lines.push("  Glamour: help someone with grief.");
  }
  lines.push("  +roll may auto-apply; or +roll with context");
  lines.push("  via tags in the expression (see help mantle).");
  return lines;
}
