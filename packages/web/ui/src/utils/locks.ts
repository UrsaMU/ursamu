/**
 * Standard lock strings for staff console autocomplete.
 * Engine lockfuncs: flag, attr, type, is, holds, perm (+ && || !).
 * BBS also treats "" / "all()" as open and "faction" specially.
 */

export type LockSuggestion = {
  /** Exact lock string written to the field */
  value: string;
  /** Short meaning shown under the value in the dropdown */
  hint: string;
};

/** Common board / object lock presets + lockfunc templates. */
export const STANDARD_LOCK_SUGGESTIONS: LockSuggestion[] = [
  { value: "all()", hint: "Anyone (open board)" },
  {
    value: "faction",
    hint: "Board faction members (BBS)",
  },
  {
    value: "flag(player)",
    hint: "Has player flag",
  },
  {
    value: "flag(admin)",
    hint: "Has admin flag",
  },
  {
    value: "flag(wizard)",
    hint: "Has wizard flag",
  },
  {
    value: "flag(builder)",
    hint: "Has builder flag",
  },
  {
    value: "flag(staff)",
    hint: "Has staff flag",
  },
  {
    value: "perm(builder)",
    hint: "Builder privilege or higher",
  },
  {
    value: "perm(admin)",
    hint: "Admin privilege or higher",
  },
  {
    value: "perm(wizard)",
    hint: "Wizard only",
  },
  {
    value: "type(player)",
    hint: "Enactor is a player object",
  },
  {
    value: "flag(admin) || flag(wizard)",
    hint: "Admin or wizard flag",
  },
  {
    value: "perm(admin) || flag(wizard)",
    hint: "Admin privilege or wizard flag",
  },
  {
    value: "attr(approved)",
    hint: "Has approved attribute set",
  },
  {
    value: "attr(approved,1)",
    hint: "approved attribute equals 1",
  },
  {
    value: "is(#1)",
    hint: "Specific object id (edit #)",
  },
  {
    value: "!flag(guest)",
    hint: "Not a guest",
  },
  {
    value: "holds(#1)",
    hint: "Carrying object #1 (edit #)",
  },
];

/** Merge presets with locks already used in the game (dedupe by value). */
export function mergeLockSuggestions(
  used: Iterable<string>,
  presets: readonly LockSuggestion[] =
    STANDARD_LOCK_SUGGESTIONS,
): Array<{ value: string; label: string }> {
  const byVal = new Map<string, { value: string; label: string }>();
  for (const p of presets) {
    const v = p.value.trim();
    if (!v) continue;
    byVal.set(v, { value: v, label: p.hint });
  }
  for (const raw of used) {
    const v = String(raw ?? "").trim();
    if (!v || byVal.has(v)) continue;
    byVal.set(v, { value: v, label: "Already used on a board" });
  }
  return [...byVal.values()].sort((a, b) =>
    a.value.localeCompare(b.value)
  );
}
