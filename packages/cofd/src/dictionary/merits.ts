// Merit definitions loaded from resources/merits.json.

export interface MeritDefinition {
  key: string;
  name: string;
  category: string;
  allowedDots: number[];
  prereqs: string[];
  /**
   * If true, this Merit accepts (or requires) a qualifier. Each unique
   * qualifier is its own dot pool. Example: Language (Spanish) and
   * Language (Russian) are two separate purchases.
   */
  instanced?: boolean;
  /** Book + page provenance, e.g. "Hurt Locker p.42". Optional metadata. */
  source?: string;
  /** Sub-category tags for filtering, e.g. ["minor-template:atariya"]. */
  tags?: string[];
}

const meritsUrl = new URL("../../resources/merits.json", import.meta.url);

export const COFD_MERITS: MeritDefinition[] = JSON.parse(Deno.readTextFileSync(meritsUrl));

/**
 * Result of parsing a merit reference like `language(spanish)` or
 * `language:spanish` or plain `giant`.
 */
export interface ParsedMeritRef {
  /** Catalog key (lowercase, no qualifier). */
  merit: string;
  /** Qualifier slug (lowercase, hyphenated). Empty when none present. */
  qualifier: string;
  /** Storage key: "merit" when no qualifier, "merit:qualifier" otherwise. */
  storageKey: string;
}

/**
 * Parses `merit(qualifier)`, `merit:qualifier`, or `merit` into its parts.
 * Qualifier whitespace is collapsed to hyphens so the slug is URL-safe and
 * key-safe ("Black Market" -> "black-market").
 */
export function parseMeritRef(input: string): ParsedMeritRef {
  const trimmed = input.trim().toLowerCase();
  const parenMatch = trimmed.match(/^([^(:]+)\(([^)]+)\)$/);
  const colonMatch = trimmed.match(/^([^(:]+):(.+)$/);

  let merit: string;
  let qualifier: string;

  if (parenMatch) {
    merit = parenMatch[1].trim();
    qualifier = parenMatch[2].trim().replace(/\s+/g, "-");
  } else if (colonMatch) {
    merit = colonMatch[1].trim();
    qualifier = colonMatch[2].trim().replace(/\s+/g, "-");
  } else {
    merit = trimmed;
    qualifier = "";
  }

  const storageKey = qualifier ? `${merit}:${qualifier}` : merit;
  return { merit, qualifier, storageKey };
}

/** Title-case a qualifier slug for display: "black-market" -> "Black Market". */
export function formatQualifier(qualifier: string): string {
  if (!qualifier) return "";
  return qualifier
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

/** "language", "spanish" -> "Language (Spanish)". Falls back to the merit key. */
export function formatMeritLabel(meritKey: string, qualifier: string): string {
  const def = COFD_MERITS.find((m) => m.key === meritKey);
  const base = def ? def.name : meritKey.replace(/\b\w/g, (c) => c.toUpperCase());
  return qualifier ? `${base} (${formatQualifier(qualifier)})` : base;
}

/** Splits a storage key like "language:spanish" or "giant" into its parts. */
export function splitMeritStorageKey(storageKey: string): { merit: string; qualifier: string } {
  const idx = storageKey.indexOf(":");
  return idx >= 0
    ? { merit: storageKey.slice(0, idx), qualifier: storageKey.slice(idx + 1) }
    : { merit: storageKey, qualifier: "" };
}
