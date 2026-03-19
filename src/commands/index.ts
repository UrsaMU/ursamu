import "./@js.ts";
import "./alias.ts";
import "./attrCommands.ts";
import "./avatar.ts";
import "./create.ts";
import "./format.ts";
import "./lock.ts";
import "./moniker.ts";
import "./name.ts";
import "./restart.ts";
import "./manipulation.ts";
import "./softcode.ts";
import "./edit.ts";
import "./admin.ts";
import "./search.ts";
import "./messages.ts";
import "./reload.ts";
import "./test.ts";
import "./nuke.ts";
import "./version.ts";

// Price of Power game systems
import popStat from "./pop/stat.ts";
popStat();
import { registerChargenCommands } from "./pop/chargen.ts";
registerChargenCommands();
import registerTimeCommands from "./pop/time.ts";
registerTimeCommands();
import { registerNotesCommands } from "./pop/notes.ts";
registerNotesCommands();
import registerSheet from "./pop/sheet.ts";
registerSheet();
import registerBBSInit from "./pop/bbs-init.ts";
registerBBSInit();

