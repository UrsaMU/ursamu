// Frailty parsing and cold-iron notes (CtL 2e p.102).

import type { CofdSheet } from "../stats/sheet.ts";

export type FrailtyKind = "taboo" | "bane" | "other";

export interface ParsedFrailty {
  raw: string;
  kind: FrailtyKind;
  text: string;
  major: boolean;
}

/**
 * Parse a frailty line. Prefixes:
 *   taboo: / ban: / bane: / major bane: / major taboo:
 */
export function parseFrailty(raw: string): ParsedFrailty {
  const s = raw.trim();
  const low = s.toLowerCase();
  let major = false;
  let kind: FrailtyKind = "other";
  let text = s;

  if (low.startsWith("major ")) {
    major = true;
  }
  const body = major ? s.slice(6).trim() : s;
  const bl = body.toLowerCase();

  if (bl.startsWith("taboo:") || bl.startsWith("ban:")) {
    kind = "taboo";
    text = body.slice(body.indexOf(":") + 1).trim();
  } else if (bl.startsWith("bane:")) {
    kind = "bane";
    text = body.slice(body.indexOf(":") + 1).trim();
  } else if (bl.includes("iron") || bl.includes("bane")) {
    kind = "bane";
    text = body;
  } else if (
    bl.startsWith("must ") ||
    bl.startsWith("never ") ||
    bl.startsWith("cannot ")
  ) {
    kind = "taboo";
    text = body;
  } else {
    text = body;
  }

  return { raw: s, kind, text, major };
}

export function listFrailties(
  sheet: CofdSheet,
): ParsedFrailty[] {
  return (sheet.frailties ?? []).map(parseFrailty);
}

/** Penalty when acting against a frailty source (book). */
export function frailtyActPenalty(
  f: ParsedFrailty,
): number {
  return f.major ? 5 : 3;
}

export function frailtySummaryLines(
  sheet: CofdSheet,
): string[] {
  const list = listFrailties(sheet);
  if (!list.length) return ["  (none)"];
  return list.map((f) => {
    const tag = f.kind === "other"
      ? "frailty"
      : f.kind;
    const maj = f.major ? "major " : "";
    return `  ${maj}${tag}: ${f.text.slice(0, 60)}`;
  });
}

/**
 * Cold iron note for changeling targets (damage handled in attack).
 * Acting against cold iron costs WP and suffers −3/−5 if it is a bane.
 */
export function coldIronNote(): string {
  return (
    "Cold iron ignores fae armor/Defense magic and deals " +
    "aggravated to changelings. Escape iron bonds needs ST."
  );
}
