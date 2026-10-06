/** Command registrations for the Cinematic package. */
import { buildChargenCmd } from "./commands/chargen.ts";
import { buildCgCmd } from "./commands/cg.ts";
import { buildManeuversCmd, buildRollCmds } from "./commands/roll.ts";
import { buildBackgroundCmds } from "./commands/background.ts";
import { buildGearCmd } from "./commands/gear.ts";
import { buildCatalogAliases } from "./commands/aliases.ts";
import { buildSenseCmds } from "./commands/sense.ts";
import { buildSheetCmd } from "./commands/sheet.ts";
import { buildStatCmds } from "./commands/stats.ts";

export function registerCommands(): void {
  buildChargenCmd();
  buildCgCmd();
  buildStatCmds();
  buildSheetCmd();
  buildRollCmds();
  buildManeuversCmd();
  buildBackgroundCmds();
  buildGearCmd();
  buildCatalogAliases();
  buildSenseCmds();
}

registerCommands();
