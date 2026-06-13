import type { PartialTheme } from "@ursamu/globals";

export const cofdGlobalsOverlay: PartialTheme = {
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
};
