// CtL 2e Mask / mien shift pure logic.
// Drop Mask: 1 Glamour, instant. Raise Mask: 1 Glamour, instant.
// Scene end: free raise via restoreMaskAtSceneEnd (animal_shift.ts).
// Mask does not change Attributes; formState only.

import type { CofdSheet } from "../stats/sheet.ts";
import type { FormState, MaskForm } from "./types.ts";

export interface MaskShiftResult {
  ok: boolean;
  reason?: string;
  sheet?: CofdSheet;
  from?: MaskForm;
  to?: MaskForm;
  glamourSpent?: number;
  message?: string;
  /** Extra lines (Hedge trail warning, etc.). */
  notes?: string[];
}

function currentMaskForm(sheet: CofdSheet): MaskForm {
  const fs = sheet.formState;
  if (fs?.system === "animal") {
    const p = (fs as FormState & { priorMask?: string }).priorMask;
    return p === "mien" ? "mien" : "mask";
  }
  if (fs?.system === "mask" && fs.current === "mien") return "mien";
  return "mask";
}

/** True when sheet is a changeling (template key). */
export function isChangelingSheet(sheet: CofdSheet): boolean {
  return sheet.template?.toLowerCase().trim() === "changeling";
}

/**
 * Apply Mask / mien shift. Shallow-clones sheet; caller persists.
 * Cannot drop/raise while in animal form — leave animal first.
 */
export function applyMaskShift(
  sheet: CofdSheet,
  target: string,
  now: number = Date.now(),
): MaskShiftResult {
  if (!isChangelingSheet(sheet)) {
    return {
      ok: false,
      reason: "Only changelings wear the Mask.",
    };
  }

  if (sheet.formState?.system === "animal") {
    return {
      ok: false,
      reason: "Leave animal form first (+shift human).",
    };
  }

  const to = target.toLowerCase().trim() as MaskForm;
  if (to !== "mask" && to !== "mien") {
    return {
      ok: false,
      reason: "Use mask or mien.",
    };
  }

  const from = currentMaskForm(sheet);
  if (from === to) {
    return {
      ok: false,
      reason: to === "mien"
        ? "Your Mask is already down."
        : "You already wear the Mask.",
    };
  }

  const cost = 1;
  const glamour = sheet.energyCurrent ?? 0;
  if (glamour < cost) {
    return {
      ok: false,
      reason: `Not enough Glamour (need ${cost}, have ${glamour}).`,
    };
  }

  const next: CofdSheet = {
    ...sheet,
    energyCurrent: glamour - cost,
    formState: {
      system: "mask",
      current: to,
      since: now,
      source: "core-mask",
      tempKeys: [],
    } satisfies FormState,
  };

  const notes: string[] = [];
  let message: string;
  if (to === "mien") {
    message = "You scour away the Mask. For the rest of the scene, " +
      "all observers see your fae mien.";
    notes.push(
      "While the Mask is down, successful Contract rolls count as " +
        "exceptional (use greater of successes, Wyrd, or Mantle).",
    );
    notes.push(
      "You leave a trail for Huntsmen and Gentry; nearby " +
        "Hedge gateways may stir (+hedge).",
    );
  } else {
    message = "You wrap the Mask tight again. Mortal eyes see only " +
      "the human face.";
  }

  return {
    ok: true,
    sheet: next,
    from,
    to,
    glamourSpent: cost,
    message,
    notes,
  };
}

/** Status line for +shift with no args (changeling). */
export function maskStatusLine(sheet: CofdSheet): string {
  const g = sheet.energyCurrent ?? 0;
  const fs = sheet.formState;
  if (fs?.system === "animal") {
    return `Form: %chanimal/${fs.current}%cn  Glamour: ${g}`;
  }
  const form = currentMaskForm(sheet);
  if (form === "mien") {
    return `Form: %chmien%cn (Mask down)  Glamour: ${g}`;
  }
  return `Form: %chmask%cn (human guise)  Glamour: ${g}`;
}

/** Legal form names for +shift/list (mask system only). */
export function maskFormList(): string[] {
  return ["mask", "mien"];
}
