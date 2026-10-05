// Dream form traits (CtL p.215–216).

import type { CofdSheet } from "../stats/sheet.ts";
import type { DreamState } from "./types.ts";

/** Attribute maximum by Wyrd (CtL table simplified). */
export function attributeMaxForWyrd(wyrd: number): number {
  const w = Math.max(0, Math.floor(wyrd));
  if (w <= 4) return 5;
  if (w <= 6) return 6;
  if (w <= 8) return 7;
  if (w === 9) return 8;
  return 10;
}

/**
 * Build dream form for a changeling via Gate of Ivory:
 * Power=Presence, Finesse=Manipulation, Resistance=Composure.
 * Dream Health = Clarity + Wyrd attribute max.
 */
export function buildChangelingDreamForm(
  sheet: CofdSheet,
  opts: {
    gate: "ivory" | "horn";
    bastionOf: string;
    bastionName?: string;
    fortification?: number;
    now?: number;
  },
): DreamState {
  const a = sheet.attributes ?? {};
  const power = Math.max(1, a.presence ?? 1);
  const finesse = Math.max(1, a.manipulation ?? 1);
  const resistance = Math.max(1, a.composure ?? 1);
  const clarity = Math.max(0, sheet.moralityValue ?? 7);
  const attrMax = attributeMaxForWyrd(sheet.powerStatValue || 1);
  const dhMax = Math.max(1, clarity + attrMax);
  const own = opts.bastionOf === "self" ||
    opts.bastionOf === sheet.template; // never
  const bastionOf = opts.bastionOf;
  return {
    active: true,
    gate: opts.gate,
    bastionOf,
    bastionName: opts.bastionName,
    fortification: Math.max(0, Math.min(10, opts.fortification ?? 0)),
    power,
    finesse,
    resistance,
    dreamHealth: dhMax,
    dreamHealthMax: dhMax,
    weavesLeft: 3 + Math.min(3, sheet.powerStatValue || 0),
    enteredAt: opts.now ?? Date.now(),
    leftOwnBastion: bastionOf !== "self",
  };
}

export function dreamFormLines(d: DreamState): string[] {
  return [
    `  Gate: ${d.gate}  Bastion: ` +
      `${d.bastionName ?? d.bastionOf}` +
      (d.fortification ? ` (Fort ${d.fortification})` : ""),
    `  Power ${d.power}  Finesse ${d.finesse}  ` +
      `Resistance ${d.resistance}`,
    `  Dream Health ${d.dreamHealth}/${d.dreamHealthMax}  ` +
      `Weaves left ${d.weavesLeft}`,
    d.role ? `  Role: ${d.role}` : "  Role: (none — +dream/role)",
    d.roadRoomId
      ? `  Roads node: ${d.roadRoomId.slice(-8)}` +
        (d.roadPath?.length
          ? `  path: ${d.roadPath.slice(-4).join("→")}`
          : "")
      : "",
    d.leftOwnBastion
      ? "  Away from own Bastion: no WP from this rest."
      : "",
  ].filter(Boolean);
}

export function readDreamState(
  sheet: CofdSheet,
): DreamState | null {
  const d = sheet.dreamState;
  if (!d || typeof d !== "object") return null;
  if (d.active !== true) return null;
  return d as DreamState;
}

export function writeDreamState(
  sheet: CofdSheet,
  dream: DreamState | null,
): CofdSheet {
  if (!dream) {
    const { dreamState: _drop, ...rest } = sheet;
    return { ...rest, dreamState: undefined };
  }
  return { ...sheet, dreamState: dream };
}
