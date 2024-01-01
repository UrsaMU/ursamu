import { attributes } from "./stats/attributes.ts";
import { backgrounds } from "./stats/backgrounds.ts";
import { bio } from "./stats/bio.ts";
import { flaws } from "./stats/flaws.ts";
import { merits } from "./stats/merits.ts";
import { skills } from "./stats/skills.ts";
import { disciplines } from "./stats/disciplines.ts";
import { other } from "./stats/other.ts";

const config = {
  server: {
    plugins: [
      "commands/@js.ts",
      "commands/alias.ts",
      "commands/attrCommands.ts",
      "commands/BBS.ts",
      "commands/building.ts",
      "commands/channels.ts",
      "commands/connect.ts",
      "commands/create.ts",
      "commands/data.ts",
      "commands/desc.ts",
      "commands/examine.ts",
      "commands/finger.ts",
      "commands/flags.ts",
      "commands/help.ts",
      "commands/lock.ts",
      "commands/look.ts",
      "commands/mail.ts",
      "commands/moniker.ts",
      "commands/name.ts",
      "commands/page.ts",
      "commands/pools.ts",
      "commands/pose.ts",
      "commands/quit.ts",
      "commands/restart.ts",
      "commands/roll.ts",
      "commands/say.ts",
      "commands/set.ts",
      "../data/commands/sheet.ts",
      "commands/short.ts",
      "commands/stats.ts",
      "commands/test.ts",
      "commands/think.ts",
      "commands/upgrade.ts",
      "commands/who.ts"
    ],
    allStats: [
      ...bio,
      ...attributes,
      ...skills,
      ...merits,
      ...flaws,
      ...backgrounds,
      ...disciplines,
      ...other,
    ]
  }
};

export default config;
