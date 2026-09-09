// core/globalsTheme.ts -- wod20th overlay for @ursamu/globals (sgp).
// Tunes sgp's look/who/format chrome to the wod20th red-and-gold aesthetic
// and disables the player short-desc / idle columns the user does not want.
import type { PartialTheme } from "@ursamu/globals";

export const wod20thGlobalsOverlay: PartialTheme = {
  headerfmt:  "%qsep[repeat(%qsmaj,5)]%cn %qtitle%0%cn %qsep[ansipad(%qtitle%0%cn ,sub(%2,6),%qsmaj)]%cn",
  dividerfmt: "%qsep[repeat(%qsmin,5)]%cn %qsection%0%cn %qsep[ansipad(%qsection%0%cn ,sub(%2,6),%qsmin)]%cn",
  footerfmt:  "%qsep[repeat(%qsmaj,%2)]%cn",
  tokens: {
    sep:     "%cr",
    title:   "%ch%cy",
    section: "%ch%cy",
  },
  colors: {
    border: "%cr",
    header: "%ch%cy",
    label:  "%ch%cy",
    accent: "%cc",
  },
  look: {
    showShortDesc:   true,
    showIdle:        true,
    categorizeExits: true,
    showExitAliases: true,
    aliasCase:       "upper",
    exitColumns:     3,
    roleTags: [
      { flag: "wizard",    display: "%cr(Wizard)%cn" },
      { flag: "superuser", display: "%cm(Root)%cn"   },
      { flag: "admin",     display: "%cy(Admin)%cn"  },
      { flag: "staff",     display: "%cc(Staff)%cn"  },
    ],
  },
};
