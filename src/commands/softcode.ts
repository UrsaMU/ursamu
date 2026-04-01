import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { softcodeService } from "../services/Softcode/index.ts";
import { hooks } from "../services/Hooks/index.ts";
import { splitArgs } from "../utils/splitArgs.ts";
import { send } from "../services/broadcast/index.ts";
import { target } from "../utils/target.ts";
import { queue } from "../services/Queue/index.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

/**
 * Split a MUX softcode argument list by a delimiter, respecting
 * bracket/brace nesting so commas inside [func()] or {braced} are not splits.
 */
function splitSoftcodeList(s: string, delim = ","): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "[" || ch === "{") { depth++; cur += ch; }
    else if (ch === "]" || ch === "}") { depth--; cur += ch; }
    else if (ch === delim && depth === 0) { parts.push(cur); cur = ""; }
    else { cur += ch; }
  }
  parts.push(cur);
  return parts;
}

/**
 * Sentinel thrown by `@break` to exit the enclosing @while or @dolist loop.
 * Caught by the loop command; propagates naturally through await chains.
 */
class BreakSignal extends Error {
  constructor() { super("@break"); this.name = "BreakSignal"; }
}

export default () => {
  addCmd({
    name: "@trigger",
    pattern: /^@tr(?:igger)?\s+([^/]+)\/([^=]+)(?:=(.*))?$/i,
    lock: "connected",
    help: `@trigger <object>/<attribute>[=<arg0>[,<arg1>...]]

Fire a stored attribute as a script. The attribute value is executed with
the triggering player as the enactor (%#) and the target object as the
executor (%!). Comma-separated arguments after = become %0, %1, etc.

Examples:
  @trigger me/GREET              Fire &GREET on yourself
  @trigger box/OPEN=force        Fire &OPEN with %0="force"`,
    exec: async (u: IUrsamuSDK) => {
      const en = await dbojs.queryOne({ id: u.me.id });
      if (!en) return;

      const tarName = u.cmd.args[0]?.trim();
      const attrName = u.cmd.args[1]?.trim().toUpperCase();
      if (!tarName || !attrName) return u.send("Usage: @trigger <object>/<attribute>[=<args>]");

      const tar = await target(en as unknown as IDBOBJ, tarName);
      if (!tar) return send([u.socketId || ""], "I can't find that.");

      const evalArgs = splitArgs(u.cmd.args[2] || "").map((a) => a.trim());

      // Check use lock on target before executing the attribute
      const useLock = (tar.data?.locks as Record<string, string>)?.use;
      if (useLock) {
        const { evaluateLock, hydrate } = await import("../utils/evaluateLock.ts");
        const allowed = await evaluateLock(
          useLock,
          hydrate(en as unknown as IDBOBJ),
          hydrate(tar as unknown as IDBOBJ),
        );
        if (!allowed) {
          send([u.socketId || ""], "Permission denied.");
          return;
        }
      }

      try {
        await hooks.executeAttribute(
          tar as unknown as IDBOBJ,
          attrName,
          evalArgs,
          en as unknown as IDBOBJ,
          u.socketId,
        );
      } catch (err) {
        send([u.socketId || ""], `%chGame>%cn @trigger error on ${tarName}/${attrName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  addCmd({
    name: "@wait",
    pattern: /^@wait\s+(\S+)\s*=\s*(.*)/i,
    lock: "connected",
    category: "Softcode",
    help: `@wait <seconds>=<command>
@wait <object>=<command>

Delay <command> by <seconds>, or block it until <object> is @notify'd.

Time form:    @wait 30=say Hello  (executes after 30 seconds, max 3600)
Semaphore:    @wait #5=say Done   (executes when #5 receives @notify)

Use @ps to inspect queued commands. Use @halt to cancel time-queued commands.
Use @drain to discard semaphore-blocked commands.

Examples:
  @wait 5=say Five seconds have passed.
  @wait here=say The room was notified.`,
    exec: async (u: IUrsamuSDK) => {
      const MAX_WAIT = 3600;
      const token = (u.cmd.args[0] ?? "").trim();
      const cmd   = (u.cmd.args[1] ?? "").trim();
      if (!cmd) return u.send("Usage: @wait <seconds|object>=<command>");

      const seconds = parseInt(token, 10);
      if (!isNaN(seconds) && /^\d+$/.test(token)) {
        // Time-based form
        if (seconds < 0) return u.send("Wait time cannot be negative.");
        if (seconds > MAX_WAIT) return u.send(`Wait time cannot exceed ${MAX_WAIT} seconds.`);
        const pid = await queue.enqueue(
          { command: cmd, executor: u.me.id, enactor: u.me.id },
          seconds * 1000,
        );
        u.send(`Wait ${seconds}s: ${cmd} (PID: ${pid})`);
        return;
      }

      // Semaphore form — resolve object reference
      const en = await dbojs.queryOne({ id: u.me.id });
      if (!en) return;
      const sem = await target(en as unknown as IDBOBJ, token);
      if (!sem) return u.send(`I can't find semaphore object '${token}'.`);

      // Ownership check: only allow if the player owns or controls the semaphore
      // object, or is staff. Prevents flooding another player's semaphore queue.
      const isStaff = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
      const semOwner = (sem.data?.owner as string | undefined);
      const semOwnedByMe = semOwner === u.me.id || sem.id === u.me.id;
      if (!semOwnedByMe && !isStaff) {
        return u.send("Permission denied. You can only @wait on objects you control.");
      }

      const pid = await queue.enqueueSemaphore(
        { command: cmd, executor: u.me.id, enactor: u.me.id },
        sem.id,
      );
      u.send(`Waiting on #${sem.id}: ${cmd} (PID: ${pid})`);
    },
  });

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

      const all = sw === "all";
      const ctx = { actorId: u.me.id, socketId: u.socketId };
      const value = await softcodeService.runSoftcode(valExpr, ctx);
      const parts = splitSoftcodeList(rest);
      const exec = u.execute as unknown as (cmd: string) => Promise<void>;

      let matched = false;
      for (let i = 0; i + 1 < parts.length; i += 2) {
        const caseVal = await softcodeService.runSoftcode(parts[i].trim(), ctx);
        if (caseVal === value) {
          const action = await softcodeService.runSoftcode(parts[i + 1].trim(), ctx);
          await exec(action);
          matched = true;
          if (!all) return;
        }
      }

      // Odd trailing element = default, used when nothing matched
      if (!matched && parts.length % 2 === 1) {
        const def = await softcodeService.runSoftcode(parts[parts.length - 1].trim(), ctx);
        await exec(def);
      }
    },
  });

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

      // Parse optional /delim X switch (e.g. "delim |")
      let delim = " ";
      if (sw.startsWith("delim")) {
        const d = sw.slice(5).trim();
        if (d.length === 1) delim = d;
        else return u.send("@dolist: /delim requires exactly one character.");
      }

      const ctx = { actorId: u.me.id, socketId: u.socketId };
      const listVal = await softcodeService.runSoftcode(listExpr, ctx);
      const items = delim === " "
        ? listVal.trim().split(/\s+/).filter(Boolean)
        : listVal.split(delim);

      if (items.length === 0) return;

      const exec = u.execute as unknown as (cmd: string) => Promise<void>;
      try {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const pos  = String(i + 1);
          // Pre-substitute ## and #@ in the action template (MUX @dolist semantics)
          const substituted = action
            .replaceAll("##", item)
            .replaceAll("#@", pos);
          const cmd = await softcodeService.runSoftcode(substituted, ctx);
          await exec(cmd);
        }
      } catch (e) {
        if (!(e instanceof BreakSignal)) throw e;
      }
    },
  });

  addCmd({
    name: "@break",
    pattern: /^@break$/i,
    lock: "connected",
    category: "Softcode",
    help: `@break

Immediately exit the enclosing @while or @dolist loop.
Has no effect outside a loop.

Examples:
  @dolist 1 2 3=@if [eq(##,2)]=@break
  @while [gt(%0,0)]=@if [eq(%0,99)]=@break`,
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

      const ctx = { actorId: u.me.id, socketId: u.socketId };
      const condVal = await softcodeService.runSoftcode(condExpr, ctx);
      const truthy  = condVal !== "" && condVal !== "0" && condVal !== "#-1";

      // Split true/false branches on the first unescaped /
      const slashIdx = rest.indexOf("/");
      const trueBranch  = slashIdx === -1 ? rest        : rest.slice(0, slashIdx);
      const falseBranch = slashIdx === -1 ? ""          : rest.slice(slashIdx + 1);

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

A safety cap of 1000 iterations is applied by default. Raise it up to
10000 with /safety N (e.g. @while/safety 5000).

Examples:
  @while [gt(%0,0)]=... (loop while %0 > 0)
  @while [gt([money(me)],0)]=@switch ... (drain coins one at a time)`,
    exec: async (u: IUrsamuSDK) => {
      const sw       = (u.cmd.args[0] ?? "").toLowerCase().trim();
      const condExpr = (u.cmd.args[1] ?? "").trim();
      const action   = (u.cmd.args[2] ?? "").trim();
      if (!condExpr || !action) return u.send("Usage: @while <condition>=<action>");

      // /safety N — raise the default 1000-iteration cap (max 10000)
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
        if (iters >= cap) {
          u.send(`@while: safety limit (${cap} iterations) reached.`);
        }
      } catch (e) {
        if (!(e instanceof BreakSignal)) throw e;
      }
    },
  });
};
