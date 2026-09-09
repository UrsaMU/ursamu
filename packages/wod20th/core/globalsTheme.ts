// core/globalsTheme.ts -- wod20th overlay for @ursamu/globals (sgp).
// Tunes sgp's look/who/format chrome to the wod20th red-and-gold aesthetic.
// Typed loosely so JSR publish does not require the optional sgp package.

/** Minimal shape accepted by sgp setTheme (optional dependency). */
export type WodGlobalsOverlay = {
  headerfmt?: string;
  dividerfmt?: string;
  footerfmt?: string;
  tokens?: Record<string, string>;
  colors?: Record<string, string>;
  look?: Record<string, unknown>;
};

export const wod20thGlobalsOverlay: WodGlobalsOverlay = {
  headerfmt:
    "%qsep[repeat(%qsmaj,5)]%cn %qtitle%0%cn " +
    "%qsep[ansipad(%qtitle%0%cn ,sub(%2,6),%qsmaj)]%cn",
  dividerfmt:
    "%qsep[repeat(%qsmin,5)]%cn %qsection%0%cn " +
    "%qsep[ansipad(%qsection%0%cn ,sub(%2,6),%qsmin)]%cn",
  footerfmt: "%qsep[repeat(%qsmaj,%2)]%cn",
  tokens: {
    sep: "%cr",
    title: "%ch%cy",
    section: "%ch%cy",
  },
  colors: {
    border: "%cr",
    header: "%ch%cy",
    label: "%ch%cy",
    accent: "%cc",
  },
  look: {
    showShortDesc: true,
    showIdle: true,
    categorizeExits: true,
    showExitAliases: true,
    aliasCase: "upper",
    exitColumns: 3,
    roleTags: [
      { flag: "wizard", display: "%cr(Wizard)%cn" },
      { flag: "superuser", display: "%cm(Root)%cn" },
      { flag: "admin", display: "%cy(Admin)%cn" },
      { flag: "staff", display: "%cc(Staff)%cn" },
    ],
  },
};
