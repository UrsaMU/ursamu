import { addCmd } from "../../services/commands/index.ts";
import { softcodeService } from "../../services/Softcode/index.ts";
import { splitSoftcodeList, splitActionCommands, switchWildcard } from "./shared.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";

addCmd({
  name: "@switch",
  pattern: /^@switch(?:\/([\w]+))?\s+(.*?)=(.*)/si,
  lock: "connected",
  category: "Softcode",
  help: `@switch[/all] <value>=<case1>,<action1>[,<case2>,<action2>,...][,<default>]

Evaluate <value> as softcode, then compare against each <case> in order.
On the first match, evaluate <action> as softcode and execute the result
as a command. An odd trailing element is used as a default if no case matches.

With /all, every matching case is executed (not just the first).

Examples:
  @switch [name(me)]=Alice,say Hi Alice!,say Who are you?
  @switch [add(%0,0)]=%0,say Zero,1,say Positive,say Negative
  @switch/all [flags(me)]=WIZARD,say I am a wizard,ADMIN,say I am an admin`,
  exec: async (u: IUrsamuSDK) => {
    const sw      = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const valExpr = (u.cmd.args[1] ?? "").trim();
    const rest    = (u.cmd.args[2] ?? "").trim();
    if (!valExpr || !rest) return u.send("Usage: @switch <value>=<case>,<action>[,...]");

    const all   = sw === "all";
    const ctx   = { actorId: u.me.id, socketId: u.socketId };
    const value = await softcodeService.runSoftcode(valExpr, ctx);
    const parts = splitSoftcodeList(rest);
    const exec  = u.execute as unknown as (cmd: string) => Promise<void>;

    // Execute action string, splitting on semicolons for multi-command support.
    const execAction = async (rawAction: string) => {
      const action = await softcodeService.runSoftcode(rawAction.trim(), ctx);
      for (const cmd of splitActionCommands(action)) {
        await exec(cmd);
      }
    };

    let matched = false;
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const caseVal = await softcodeService.runSoftcode(parts[i].trim(), ctx);
      if (switchWildcard(value, caseVal)) {
        await execAction(parts[i + 1]);
        matched = true;
        if (!all) return;
      }
    }

    if (!matched && parts.length % 2 === 1) {
      await execAction(parts[parts.length - 1]);
    }
  },
});
