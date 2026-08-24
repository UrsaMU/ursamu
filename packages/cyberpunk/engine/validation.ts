/**
 * Shared validation helpers for CPR commands.
 */

/**
 * Maximum length (characters) of a plain-text GM summary string.
 *
 * The summary field of ICPRGMPayload is injected verbatim into the LLM round
 * context. An unbounded summary lets a player with a crafted name or a long
 * +humanity note inflate every LLM request with arbitrary text.
 * 300 characters is generous for any single mechanical event description.
 */
export const MAX_GM_SUMMARY_LENGTH = 300;

/**
 * Strip all MUSH/ANSI escape codes from a string so it is safe to embed
 * in the GM LLM context (ICPRGMPayload.summary).
 *
 * MUSH codes such as %ch, %cr, %cn corrupt the system prompt and could be
 * used to inject formatting sequences into the LLM context. Must be called
 * on every value derived from u.util.displayName() or user-supplied text
 * before it is placed in a GM summary string.
 */
export function stripMush(s: string): string {
  return s
    .replace(/%c[a-z]/gi, "")   // colour codes: %ch %cr %cg %cb %cy %cw %cc %cn
    .replace(/%[rntb]/gi, " "); // structural: %r (newline) %n (name) %t (tab) %b (space)
}

/**
 * Return a plain-text GM summary string that is safe for LLM injection:
 * MUSH codes stripped, length capped at MAX_GM_SUMMARY_LENGTH.
 *
 * Use this for every string passed to emitGM* functions.
 */
export function sanitizeGMSummary(s: string): string {
  return stripMush(s).slice(0, MAX_GM_SUMMARY_LENGTH);
}

/**
 * Maximum number of location effects (grabbed, pinned, arm_disabled, etc.)
 * a character may have active simultaneously.
 *
 * Without this cap, repeated +brawl/grab or +attack/called commands could
 * grow state.cpr.locationEffects without bound, bloating the DB document.
 * 10 concurrent effects is well beyond any realistic combat scenario.
 */
export const MAX_LOCATION_EFFECTS = 10;

/**
 * Maximum number of critical injuries a character may accumulate.
 * CPR core rules: death-save penalties stack; 20 injuries is already
 * far beyond survivable. Capping prevents unbounded document growth.
 */
export const MAX_CRIT_INJURIES = 20;

/**
 * Returns true only when the healer and patient are different characters.
 *
 * CPR core rules (p. 227): a character cannot administer First Aid or
 * Paramedic to themselves while mortally wounded. Passing equal IDs
 * (e.g. caller targets themselves) must be rejected.
 */
export function canSelfStabilize(callerId: string, targetId: string): boolean {
  if (!callerId || !targetId) return false;
  return callerId !== targetId;
}

/**
 * Returns true when the character is alive and can receive healing.
 *
 * Dead characters (woundState: "dead") must not receive mechanical HP
 * restoration -- resurrection requires explicit staff or in-fiction mechanics,
 * not a standard healing command. This guard must be checked at the command
 * layer before calling applyHealingToChar().
 */
export function canReceiveHealing(cpr: { woundState: string }): boolean {
  return cpr.woundState !== "dead";
}

/**
 * Parses a string as a positive integer (>= 1).
 *
 * Returns the integer value if valid, or null if the string is not a
 * positive integer (including zero, negative numbers, or non-numeric input).
 *
 * Used by economy and job commands to prevent negative-EB exploits where
 * a negative amount passed to $inc would drain another player's Eurodollars.
 */
export function parsePositiveInt(str: string): number | null {
  const n = parseInt(str, 10);
  if (isNaN(n) || n < 1) return null;
  return n;
}
