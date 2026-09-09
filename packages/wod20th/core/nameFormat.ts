// core/nameFormat.ts -- NAMEFORMAT handler that swaps in a Garou's deed name
// while they are shifted to a non-homid form. Login name is unchanged in
// every other context (page targets, sheet lookup, db keys).
// deno-lint-ignore no-explicit-any
import { findByPlayer } from "../db/charDb.ts";
import { shiftedDisplayName } from "./displayName.ts";

/**
 * Returns the colored deed name when the target is a shifted WtA character,
 * or `null` to fall through to the next layer (built-in default).
 */
export const wodNameFormat = async (
  // deno-lint-ignore no-explicit-any
  _u: any,
  // deno-lint-ignore no-explicit-any
  target: any,
  defaultArg: string,
): Promise<string | null> => {
  if (!target?.id) return null;
  if (!target.flags?.has?.("player")) return null;

  const char = await findByPlayer(target.id);
  if (!char) return null;

  const swapped = shiftedDisplayName(char, defaultArg);
  if (swapped === defaultArg) return null;
  // Preserve a touch of color so the deed name stands out from the login name.
  return `%ch%cy${swapped}%cn`;
};
