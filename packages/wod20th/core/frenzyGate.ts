// core/frenzyGate.ts -- shared composure check.
// Berserk and Fox frenzy block any action requiring composure: gift activations
// (gnosis spend), rite casting, and stepping sideways. Rage spending is NOT
// gated -- it's the only fuel a frenzied Garou can burn.
import type { IWoDChar } from "./types.ts";
import { isFrenzied } from "./frenzy.ts";

/**
 * If `char` is frenzied, returns a reject message describing why composure
 * is required. Returns `null` when the action may proceed.
 */
export function frenzyBlockMessage(char: IWoDChar, actionLabel: string): string | null {
  if (!isFrenzied(char)) return null;
  const stateWord = char.frenzyState === "fox" ? "fox frenzy" : "berserk frenzy";
  return `%crYou cannot ${actionLabel} while in ${stateWord}.%cn`;
}
