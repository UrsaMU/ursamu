// Activate a Fetch Echo (pure).

import type { CofdSheet } from "../stats/sheet.ts";
import { findEcho } from "./echoes.ts";
import { isFetchSheet, readFetchState, writeFetchState } from "./store.ts";

export interface EchoResult {
  ok: boolean;
  reason?: string;
  sheet?: CofdSheet;
  lines: string[];
}

export function activateEcho(
  sheet: CofdSheet,
  echoKey: string,
  note?: string,
): EchoResult {
  if (!isFetchSheet(sheet)) {
    return {
      ok: false,
      reason: "Only fetch sheets use Echoes.",
      lines: [],
    };
  }
  const st = readFetchState(sheet);
  if (!st) {
    return {
      ok: false,
      reason: "No fetch state on sheet.",
      lines: [],
    };
  }
  const echo = findEcho(echoKey);
  if (!echo) {
    return {
      ok: false,
      reason: `Unknown Echo '${echoKey}'. +fetch/echoes`,
      lines: [],
    };
  }
  const owned = new Set(st.echoes.map((e) => e.toLowerCase()));
  if (!echo.automatic && !owned.has(echo.slug)) {
    return {
      ok: false,
      reason: `You do not have Echo: ${echo.name}.`,
      lines: [],
    };
  }
  const wyrd = sheet.powerStatValue || 0;
  if (wyrd < echo.minWyrd) {
    return {
      ok: false,
      reason: `Need Wyrd ${echo.minWyrd}+ for ${echo.name}.`,
      lines: [],
    };
  }

  // Normalcy blocks other Echoes while on (except attuned/normalcy).
  if (
    st.normalcyOn &&
    echo.slug !== "normalcy" &&
    echo.slug !== "attuned"
  ) {
    return {
      ok: false,
      reason:
        "Normalcy is on — +fetch/echo normalcy to drop it first.",
      lines: [],
    };
  }

  if (echo.slug === "mimic-contract" && !st.metOriginal) {
    return {
      ok: false,
      reason:
        "Mimic Contract needs a face-to-face meeting " +
        "with the original (+fetch/met).",
      lines: [],
    };
  }

  let cost = echo.glamour;
  if (echo.slug === "call-huntsmen") {
    cost = Math.max(1, sheet.energyCurrent ?? 0);
  }
  if (echo.slug === "death-of-glamour") {
    cost = 10;
  }
  const g = sheet.energyCurrent ?? 0;
  if (cost > 0 && g < cost) {
    return {
      ok: false,
      reason: `Need ${cost} Glamour (have ${g}).`,
      lines: [],
    };
  }

  let next: CofdSheet = {
    ...sheet,
    energyCurrent: Math.max(0, g - cost),
  };
  let link = { ...st };
  const lines: string[] = [
    `Echo: %cy${echo.name}%cn` +
      (cost ? ` (−${cost} Glamour)` : "") + ".",
    `  ${echo.description}`,
  ];

  switch (echo.slug) {
    case "normalcy": {
      link = { ...link, normalcyOn: !link.normalcyOn };
      lines.push(
        link.normalcyOn
          ? "  Normalcy ON — invisible to fae magic."
          : "  Normalcy OFF — other Echoes available.",
      );
      break;
    }
    case "heart-of-wax":
      lines.push(
        "  Wound penalties ignored; one physical Tilt shed (ST).",
      );
      break;
    case "summon-shard":
      lines.push(
        "  Mirror blade in hand (1L/2L) until scene end (ST gear).",
      );
      break;
    case "shadow-boxing":
      next = {
        ...next,
        tempStats: {
          ...(next.tempStats ?? {}),
          _shadowBoxing: 1,
        },
      };
      lines.push(
        "  Original has no Defense vs you this scene.",
      );
      break;
    case "mimic-contract":
      lines.push(
        note
          ? `  Mimicking Contract: ${note.slice(0, 40)}`
          : "  Name the Contract (ST / +contract list on original).",
      );
      break;
    case "call-huntsmen":
      next = { ...next, energyCurrent: 0 };
      lines.push("  Beacon lit — ST: Huntsmen answer.");
      break;
    case "death-of-glamour":
      lines.push(
        "  Roll Resolve+Wyrd (ST). Zone: Contracts fail; " +
          "Glamour −1/turn per success.",
      );
      break;
    case "attuned":
      lines.push("  Always on — you sense the Lost nearby.");
      break;
    default:
      lines.push("  ST resolves the Echo in the scene.");
  }

  next = writeFetchState(next, link);
  if (note && echo.slug !== "mimic-contract") {
    lines.push(`  Note: ${note.slice(0, 60)}`);
  }
  return { ok: true, sheet: next, lines };
}

/** Mark that fetch met its original (enables Mimic). */
export function markMetOriginal(sheet: CofdSheet): CofdSheet {
  const st = readFetchState(sheet);
  if (!st) return sheet;
  return writeFetchState(sheet, { ...st, metOriginal: true });
}
