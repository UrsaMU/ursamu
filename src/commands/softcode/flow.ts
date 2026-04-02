import { addCmd } from "../../services/commands/index.ts";
import { softcodeService } from "../../services/Softcode/index.ts";
import { BreakSignal } from "./shared.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";

addCmd({
  name: "@break",
  pattern: /^@break$/i,
  lock: "connected",
  category: "Softcode",
  help: `@break

Immediately exit the enclosing @while or @dolist loop.
Has no effect outside a loop.`,
  exec: () => { throw new BreakSignal(); },
});

addCmd({
  name: "@if",
  pattern: /^@if\s+(.*?)=(.*)/si,
  lock: "connected",
  category: "Softcode",
  help: `@if <condition>=<true action>[/<false action>]

Evaluate <condition> as softcode. If the result is truthy (non-empty and
not "0"), execute the <true action> as a command. If a <false action> is
provided (separated by /), execute it when the condition is falsy.

Examples:
  @if [isnum(%0)]=say It's a number./say Not a number.
  @if [eq([money(me)],0)]=say You're broke.`,
  exec: async (u: IUrsamuSDK) => {
    const condExpr = (u.cmd.args[0] ?? "").trim();
    const rest     = (u.cmd.args[1] ?? "").trim();
    if (!condExpr || !rest) return u.send("Usage: @if <condition>=<action>[/<else>]");

    const ctx     = { actorId: u.me.id, socketId: u.socketId };
    const condVal = await softcodeService.runSoftcode(condExpr, ctx);
    const truthy  = condVal !== "" && condVal !== "0" && condVal !== "#-1";

    const slashIdx    = rest.indexOf("/");
    const trueBranch  = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
    const falseBranch = slashIdx === -1 ? ""   : rest.slice(slashIdx + 1);

    const exec = u.execute as unknown as (cmd: string) => Promise<void>;
    if (truthy) {
      const cmd = await softcodeService.runSoftcode(trueBranch.trim(), ctx);
      if (cmd.trim()) await exec(cmd);
    } else if (falseBranch.trim()) {
      const cmd = await softcodeService.runSoftcode(falseBranch.trim(), ctx);
      if (cmd.trim()) await exec(cmd);
    }
  },
});

addCmd({
  name: "@while",
  pattern: /^@while(?:\/([\w]+))?\s+(.*?)=(.*)/si,
  lock: "connected",
  category: "Softcode",
  help: `@while[/safety N] <condition>=<action>

Repeatedly evaluate <condition> as softcode and execute <action> as a
command for as long as the condition is truthy (non-empty and not "0").
Use @break inside <action> to exit early.

A safety cap of 1000 iterations is applied by default. Raise up to
10000 with /safety N (e.g. @while/safety 5000).`,
  exec: async (u: IUrsamuSDK) => {
    const sw       = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const condExpr = (u.cmd.args[1] ?? "").trim();
    const action   = (u.cmd.args[2] ?? "").trim();
    if (!condExpr || !action) return u.send("Usage: @while <condition>=<action>");

    const DEFAULT_CAP = 1_000;
    const MAX_CAP     = 10_000;
    let cap = DEFAULT_CAP;
    if (sw.startsWith("safety")) {
      const n = parseInt(sw.slice(6).trim(), 10);
      if (!isNaN(n) && n > 0) cap = Math.min(n, MAX_CAP);
    }

    const ctx  = { actorId: u.me.id, socketId: u.socketId };
    const exec = u.execute as unknown as (cmd: string) => Promise<void>;
    let iters  = 0;

    try {
      while (iters < cap) {
        const condVal = await softcodeService.runSoftcode(condExpr, ctx);
        if (condVal === "" || condVal === "0" || condVal === "#-1") break;
        const cmd = await softcodeService.runSoftcode(action, ctx);
        if (cmd.trim()) await exec(cmd);
        iters++;
      }
      if (iters >= cap) u.send(`@while: safety limit (${cap} iterations) reached.`);
    } catch (e) {
      if (!(e instanceof BreakSignal)) throw e;
    }
  },
});
