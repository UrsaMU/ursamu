import "./@js.ts";
import "./alias.ts";
import "./attrCommands.ts";
import "./building.ts";
import "./channels.ts";
import "./connect.ts";
import "./clone.ts";
import "./create.ts";
import "./desc.ts";
import "./examine.ts";
import "./flags.ts";
import "./format.ts";
import "./help.ts";
import "./lock.ts";
import "./look.ts";
import "./mail.ts";
import "./moniker.ts";
import "./name.ts";
import "./page.ts";
import "./pose.ts";
import "./quit.ts";
import "./restart.ts";
import "./say.ts";
import "./set.ts";
import "./think.ts";
import "./who.ts";
import "./inventory.ts";
import "./score.ts";
import "./home.ts";
import "./manipulation.ts";
import "./softcode.ts";
import "./edit.ts";
import "./building.ts"; // Was this missing? Adding it just in case, though it looked like standard building cmds were in `building.ts`.
// Check if building was already imported. It was likely loaded by plugins() in main.ts if it's in the commands folder, 
// BUT we are using manual imports in index.ts for JSR compatibility? 
// Wait, main.ts says: "On JSR, we import the build-time generated index". `index.ts` IS that index.
// So yes, we MUST import them here.

import "./building.ts";
import "./admin.ts";
import "./search.ts";

