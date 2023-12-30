import { attributes } from "./stats/attributes.ts";
import { backgrounds } from "./stats/backgrounds.ts";
import { bio } from "./stats/bio.ts";
import { flaws } from "./stats/flaws.ts";
import { merits } from "./stats/merits.ts";
import { skills } from "./stats/skills.ts";
import { disciplines } from "./stats/disciplines.ts";
import { other } from "./stats/other.ts";

export const config = {
  server: {
    plugins: [
      "src/commands/@js.ts",
      "src/commands/alias.ts",
      "src/commands/attrCommands.ts",
      "src/commands/BBS.ts",
      "src/commands/building.ts",
      "src/commands/channels.ts",
      "src/commands/connect.ts",
      "src/commands/create.ts",
      "src/commands/data.ts",
      "src/commands/desc.ts",
      "src/commands/examine.ts",
      "src/commands/finger.ts",
      "src/commands/flags.ts",
      "src/commands/help.ts",
      "src/commands/lock.ts",
      "src/commands/look.ts",
      "src/commands/mail.ts",
      "src/commands/moniker.ts",
      "src/commands/name.ts",
      "src/commands/page.ts",
      "src/commands/pools.ts",
      "src/commands/pose.ts",
      "src/commands/quit.ts",
      "src/commands/restart.ts",
      "src/commands/roll.ts",
      "src/commands/say.ts",
      "src/commands/set.ts",
      "src/commands/sheet.ts",
      "src/commands/short.ts",
      "src/commands/stats.ts",
      "src/commands/test.ts",
      "src/commands/think.ts",
      "src/commands/upgrade.ts",
      "src/commands/who.ts"
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
    ];
  }
}
