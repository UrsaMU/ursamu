// splats/wta/data/moots.ts -- Moot phase enum + canonical phase metadata.
//
// Canon (WtA 20th Anniversary Ed., Ch 2 "Moot", pp. 78-79). A sept moot is
// a structured gathering with four ritual phases:
//
//   Opening Howl       -- Master of the Howl summons spirits.
//   Inner Sky          -- Theurges' rite; spirit communion.
//   Cracking the Bone  -- main business: Litany charges, Challenges, news.
//   Revel              -- celebration; songs, dancing, hunts.
//
// We model "scheduled" (before opening) and "closed" (after revel) as
// non-canonical bookends so the lifecycle is complete.

export type MoothPhase =
  | "scheduled"
  | "opening-howl"
  | "inner-sky"
  | "cracking-the-bone"
  | "revel"
  | "closed";

export const MOOT_PHASE_ORDER: MoothPhase[] = [
  "scheduled",
  "opening-howl",
  "inner-sky",
  "cracking-the-bone",
  "revel",
  "closed",
];

export interface IMootPhaseInfo {
  name: string;
  description: string;
  durationHint: string;
}

export const MOOT_PHASE_INFO: Record<MoothPhase, IMootPhaseInfo> = Object.freeze({
  "scheduled": {
    name: "Scheduled",
    description: "The moot is on the calendar but has not yet begun.",
    durationHint: "before the moot",
  },
  "opening-howl": {
    name: "Opening Howl",
    description:
      "The Master of the Howl summons the Garou and calls down spirits.",
    durationHint: "~15 minutes",
  },
  "inner-sky": {
    name: "Inner Sky",
    description:
      "Theurges open the Umbral curtain and the sept communes with its totem and the local spirits.",
    durationHint: "~30 minutes",
  },
  "cracking-the-bone": {
    name: "Cracking the Bone",
    description:
      "The business of the sept: Litany charges, formal Challenges, news, judgments.",
    durationHint: "~1 hour",
  },
  "revel": {
    name: "Revel",
    description:
      "Howling, songs, dancing, and -- canonically -- a hunt. Honor is paid for showing up.",
    durationHint: "~1 hour",
  },
  "closed": {
    name: "Closed",
    description: "The moot has ended and Honor has been distributed.",
    durationHint: "after the moot",
  },
});

/**
 * Return the next phase in canonical order, or null when already closed.
 * Unknown / invalid input returns null (fail-closed).
 */
export function nextPhase(current: MoothPhase): MoothPhase | null {
  const idx = MOOT_PHASE_ORDER.indexOf(current);
  if (idx < 0) return null;
  if (idx >= MOOT_PHASE_ORDER.length - 1) return null;
  return MOOT_PHASE_ORDER[idx + 1];
}

/** True for the four canonical "in session" phases. */
export function isMoothActive(p: MoothPhase): boolean {
  return p === "opening-howl" ||
    p === "inner-sky" ||
    p === "cracking-the-bone" ||
    p === "revel";
}
