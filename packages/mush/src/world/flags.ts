import { Tags } from "@digibear/tags";

/**
 * Flag registry — every `code` is a single letter.
 * Upper/lower are distinct flags (e.g. wizard=`W`, staff=`w`).
 * Digibear matches codes case-sensitively; names stay case-insensitive.
 *
 * Unknown names are ignored by Tags.set — always register before @set.
 *
 *   Privilege     Type/status      Supernatural
 *   U superuser   p player         m mortal
 *   a admin       r room           G ghoul
 *   W wizard      e exit           v vampire
 *   w staff       c connected      f werewolf
 *   T storyteller d dark           k kinfolk
 *   b builder     s safe           F fae (CtL sight)
 *   A approved    g guest          N forsaken (WtF sight)
 *   I ic (room)   z void
 *                 l link_ok
 *                 E enter_ok
 *                 V visual
 *                 O opaque
 */
export const flags: Tags = new Tags(
  { name: "superuser",   code: "U", lvl: 10, lock: "superuser" },
  { name: "admin",       code: "a", lvl: 9,  lock: "superuser" },
  { name: "wizard",      code: "W", lvl: 9,  lock: "superuser" },
  { name: "staff",       code: "w", lvl: 8,  lock: "admin" },
  { name: "storyteller", code: "T", lvl: 8,  lock: "admin" },
  { name: "builder",     code: "b", lvl: 7,  lock: "admin" },
  // Chargen complete — builder+ only (players cannot self-grant).
  // +approve sets it; blocks +cg for approved non-staff.
  { name: "approved",    code: "A", lock: "builder+" },
  { name: "player",      code: "p", lvl: 1,  lock: "superuser" },
  { name: "safe",        code: "s" },
  { name: "void",        code: "z", lock: "superuser" },
  { name: "dark",        code: "d" },
  { name: "guest",       code: "g", lock: "superuser" },
  { name: "room",        code: "r", lvl: 1,  lock: "superuser" },
  // In-character play space — +ooc bookmarks only rooms with this flag.
  { name: "ic",          code: "I", lock: "builder+" },
  { name: "exit",        code: "e", lvl: 1,  lock: "superuser" },
  { name: "connected",   code: "c", lock: "superuser" },
  { name: "mortal",      code: "m", lock: "builder+" },
  { name: "ghoul",       code: "G", lock: "builder+" },
  { name: "vampire",     code: "v", lock: "builder+" },
  { name: "werewolf",    code: "f", lock: "builder+" },
  { name: "kinfolk",     code: "k", lock: "builder+" },
  // Dual-look sight gates (CofD). Staff-set; chargen may sync via
  // syncSightFlags. Digibear Tags.set drops unknown names silently.
  { name: "fae",         code: "F", lock: "builder+" },
  { name: "forsaken",    code: "N", lock: "builder+" },
  { name: "link_ok",     code: "l" },
  { name: "enter_ok",    code: "E" },
  { name: "visual",      code: "V" },
  { name: "opaque",      code: "O" },
);

/**
 * Parse a @set / @flags expression into add/remove tokens.
 * `!name` removes; bare `name` adds. Empty tokens ignored.
 */
export function parseFlagExpr(expr: string): {
  add: string[];
  remove: string[];
} {
  const add: string[] = [];
  const remove: string[] = [];
  for (const tok of expr.trim().split(/\s+/).filter(Boolean)) {
    if (tok.startsWith("!")) {
      const n = tok.slice(1);
      if (n) remove.push(n);
    } else {
      add.push(tok);
    }
  }
  return { add, remove };
}

/**
 * Names in an add-list that are not in the flag registry.
 * Removals (`!x`) do not need to be registered.
 */
export function unknownFlagNames(expr: string): string[] {
  const { add } = parseFlagExpr(expr);
  return add.filter((n) => !flags.exists(n));
}

/**
 * Short flag codes for a flag set/string (e.g. "exit dark" → "ed").
 * Unknown flags are skipped. Codes keep defined case (wizard → W,
 * staff → w) so upper/lower remain distinct in dbref displays.
 */
export function flagCodes(
  flagSrc: Set<string> | string[] | string | undefined,
): string {
  if (!flagSrc) return "";
  const names = typeof flagSrc === "string"
    ? flagSrc.split(/\s+/).filter(Boolean)
    : [...flagSrc].filter(Boolean);
  const parts: string[] = [];
  for (const name of names) {
    const tag = flags.exists(name);
    if (tag?.code) parts.push(tag.code);
  }
  return parts.join("");
}

/**
 * Staff/editor dbref suffix: `#12ed` (id + flag codes).
 * Used as `(#12ed)` after names on look when the viewer can edit.
 */
export function dbrefWithFlags(
  id: string,
  flagSrc?: Set<string> | string[] | string,
): string {
  return `#${id}${flagCodes(flagSrc)}`;
}
