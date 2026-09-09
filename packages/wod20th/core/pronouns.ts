// core/pronouns.ts -- RhostMUSH-style pronoun substitution.
//
// Tokens (case-sensitive) -- swap from a character's IPronounSet:
//   %s / %S   subject     -- he   | she  | they  | it
//   %o / %O   object      -- him  | her  | them  | it
//   %p / %P   possessive  -- his  | her  | their | its   ("%p talons")
//   %a / %A   absolute    -- his  | hers | theirs| its   ("the talons are %a")
//
// Upper-case variants capitalize the first letter. To emit a literal %s
// (etc.), use %%s -- the helper unescapes %% to a single % AFTER all
// token expansion, so quoted shell-like sigils survive intact.

import type { IPronounSet, IWoDChar } from "./types.ts";

export const DEFAULT_PRONOUNS: IPronounSet = {
  subject: "they", object: "them", possessive: "their", absolute: "theirs",
};

export const PRONOUN_PRESETS: Record<string, IPronounSet> = {
  he:   { subject: "he",   object: "him",  possessive: "his",   absolute: "his"    },
  she:  { subject: "she",  object: "her",  possessive: "her",   absolute: "hers"   },
  they: { subject: "they", object: "them", possessive: "their", absolute: "theirs" },
  it:   { subject: "it",   object: "it",   possessive: "its",   absolute: "its"    },
};

export function pronounsFor(char: IWoDChar | null | undefined): IPronounSet {
  return char?.pronouns ?? DEFAULT_PRONOUNS;
}

function cap(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * Substitute %s/%o/%p/%a (and uppercase variants) in `msg` using `pron`.
 * Literal "%%" decodes to "%" after substitution so authors can quote
 * the sigils when needed. Color/other codes (%c*, %r, %n, %t, %b) are
 * left untouched.
 */
export function substitute(msg: string, pron: IPronounSet): string {
  // Use a sentinel for "%%" so we don't accidentally re-expand it.
  const SENTINEL = "\x00ESCPCT\x00";
  let out = msg.replace(/%%/g, SENTINEL);
  out = out
    .replace(/%s/g, pron.subject)
    .replace(/%S/g, cap(pron.subject))
    .replace(/%o/g, pron.object)
    .replace(/%O/g, cap(pron.object))
    .replace(/%p/g, pron.possessive)
    .replace(/%P/g, cap(pron.possessive))
    .replace(/%a/g, pron.absolute)
    .replace(/%A/g, cap(pron.absolute));
  return out.replace(new RegExp(SENTINEL, "g"), "%");
}

/** Convenience: substitute using the given char's pronouns (or default). */
export function subs(msg: string, char: IWoDChar | null | undefined): string {
  return substitute(msg, pronounsFor(char));
}
