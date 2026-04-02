import { addCmd } from "../../services/commands/index.ts";
import { softcodeService } from "../../services/Softcode/index.ts";
import { BreakSignal } from "./shared.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";

addCmd({
  name: "@dolist",
  pattern: /^@dolist(?:\/(\S+))?\s+(.*?)=(.*)/si,
  lock: "connected",
  category: "Softcode",
  help: `@dolist[/delim <char>] <list>=<action>

Evaluate <list> as softcode, then execute <action> once per item.
Within <action>, ## is replaced by the current item and #@ by its
1-based position. The default delimiter is a space; use /delim to change it.
Use @break inside the action to stop iteration early.

Examples:
  @dolist Alice Bob Carol=say Hello, ##!
  @dolist [lcon(here)]=@pemit ##=You are number #@.
  @dolist/delim | red|green|blue=say Color: ##`,
  exec: async (u: IUrsamuSDK) => {
    const sw       = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const listExpr = (u.cmd.args[1] ?? "").trim();
    const action   = (u.cmd.args[2] ?? "").trim();
    if (!listExpr || !action) return u.send("Usage: @dolist[/delim X] <list>=<action>");

    let delim = " ";
    if (sw.startsWith("delim")) {
      const d = sw.slice(5).trim();
      if (d.length === 1) delim = d;
      else return u.send("@dolist: /delim requires exactly one character.");
    }

    const ctx     = { actorId: u.me.id, socketId: u.socketId };
    const listVal = await softcodeService.runSoftcode(listExpr, ctx);
    const items   = delim === " "
      ? listVal.trim().split(/\s+/).filter(Boolean)
      : listVal.split(delim);

    if (items.length === 0) return;

    const exec = u.execute as unknown as (cmd: string) => Promise<void>;
    try {
      for (let i = 0; i < items.length; i++) {
        const substituted = action
          .replaceAll("##", items[i])
          .replaceAll("#@", String(i + 1));
        const cmd = await softcodeService.runSoftcode(substituted, ctx);
        await exec(cmd);
      }
    } catch (e) {
      if (!(e instanceof BreakSignal)) throw e;
    }
  },
});
