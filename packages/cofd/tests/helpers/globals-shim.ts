/**
 * globals-shim.ts — in-memory test shim for @ursamu/globals.
 *
 * The live ursamu-sgp-plugin@master has top-level code that calls
 * fromFileUrl(import.meta.url), which throws when the module is loaded
 * via a raw GitHub URL (not a file:// path).  This shim replaces the
 * remote module for cofd tests: it exports the same runtime surface
 * (currentTheme / setTheme / resetTheme) plus all types, all backed by
 * a simple in-memory store.
 */

// ─── Types (mirrors ursamu-sgp-plugin/src/theme.ts) ──────────────────────────

export interface GlobalsThemeTokens {
  sep:     string;
  title:   string;
  section: string;
  hint:    string;
  smaj:    string;
  smin:    string;
}

export interface GlobalsTheme {
  width:       number;
  borderChar:  string;
  dividerChar: string;
  barFill:     string;
  barEmpty:    string;
  headerfmt:   string;
  dividerfmt:  string;
  footerfmt:   string;
  tokens:  GlobalsThemeTokens;
  colors: {
    border:    string;
    header:    string;
    label:     string;
    accent:    string;
    idleFresh: string;
    idleAway:  string;
    idleAFK:   string;
    barFilled: string;
    barEmpty:  string;
    reset:     string;
  };
  messages: {
    prefix:    string;
    info:      string;
    success:   string;
    warning:   string;
    error:     string;
    highlight: string;
  };
  ooc: {
    tag:        string;
    sayFormat:  string;
    poseFormat: string;
  };
  look: {
    showShortDesc:   boolean;
    showIdle:        boolean;
    categorizeExits: boolean;
    showExitAliases: boolean;
    aliasCase:       "upper" | "lower" | "preserve";
    exitColumns:     1 | 2 | 3;
    descIndent:      number;
    roleTags:        Array<{ flag: string; display: string }>;
  };
  who: {
    nameWidth:  number;
    onForWidth: number;
    idleWidth:  number;
  };
}

export type PartialTheme =
  & Partial<Omit<GlobalsTheme, "tokens" | "colors" | "messages" | "ooc" | "look" | "who">>
  & {
    tokens?:   Partial<GlobalsThemeTokens>;
    colors?:   Partial<GlobalsTheme["colors"]>;
    messages?: Partial<GlobalsTheme["messages"]>;
    ooc?:      Partial<GlobalsTheme["ooc"]>;
    look?:     Partial<GlobalsTheme["look"]>;
    who?:      Partial<GlobalsTheme["who"]>;
  };

// ─── Default theme ────────────────────────────────────────────────────────────

const DEFAULT_THEME: GlobalsTheme = {
  width:       78,
  borderChar:  "=",
  dividerChar: "-",
  barFill:     "#",
  barEmpty:    ".",
  headerfmt:   "%ch%cw[repeat(=,%2)]%cn",
  dividerfmt:  "%ch%cw[repeat(-,%2)]%cn",
  footerfmt:   "%ch%cw[repeat(=,%2)]%cn",
  tokens: {
    sep:     "%cw",
    title:   "%ch%cw",
    section: "%ch%cw",
    hint:    "%cx",
    smaj:    "=",
    smin:    "-",
  },
  colors: {
    border:    "%cw",
    header:    "%ch%cw",
    label:     "%ch%cw",
    accent:    "%cc",
    idleFresh: "%cg",
    idleAway:  "%cy",
    idleAFK:   "%cr",
    barFilled: "%cg",
    barEmpty:  "%cx",
    reset:     "%cn",
  },
  messages: {
    prefix:    "%ch%cc>%cn",
    info:      "%cw",
    success:   "%cg",
    warning:   "%cy",
    error:     "%cr",
    highlight: "%ch%cy",
  },
  ooc: {
    tag:        "%ch<OOC>%cn",
    sayFormat:  "%0 says OOC: %1",
    poseFormat: "%0 [OOC]: %1",
  },
  look: {
    showShortDesc:   true,
    showIdle:        true,
    categorizeExits: true,
    showExitAliases: true,
    aliasCase:       "preserve",
    exitColumns:     2,
    descIndent:      2,
    roleTags:        [],
  },
  who: {
    nameWidth:  20,
    onForWidth: 10,
    idleWidth:  8,
  },
};

// ─── In-memory theme store ────────────────────────────────────────────────────

function deepMerge<T extends Record<string, unknown>>(target: T, partial: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(partial) as (keyof T)[]) {
    const tv = target[key];
    const pv = partial[key];
    if (
      pv !== undefined &&
      tv !== null && typeof tv === "object" && !Array.isArray(tv) &&
      pv !== null && typeof pv === "object" && !Array.isArray(pv)
    ) {
      result[key] = deepMerge(tv as Record<string, unknown>, pv as Record<string, unknown>) as T[keyof T];
    } else if (pv !== undefined) {
      result[key] = pv as T[keyof T];
    }
  }
  return result;
}

let _theme: GlobalsTheme = deepMerge({ ...DEFAULT_THEME }, {} as Partial<GlobalsTheme>);

/** Returns the current active theme (deep copy). */
export function currentTheme(): GlobalsTheme {
  return { ..._theme } as GlobalsTheme;
}

/** Merges a partial theme overlay into the active theme. */
export async function setTheme(overlay: PartialTheme): Promise<void> {
  _theme = deepMerge(_theme as unknown as Record<string, unknown>, overlay as Record<string, unknown>) as unknown as GlobalsTheme;
  await Promise.resolve();
}

/** Resets the active theme back to the built-in defaults. */
export async function resetTheme(): Promise<void> {
  _theme = deepMerge({ ...DEFAULT_THEME }, {} as Partial<GlobalsTheme>);
  await Promise.resolve();
}
