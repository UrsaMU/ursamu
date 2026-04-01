import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { getAttribute } from "../utils/getAttribute.ts";
import { sandboxService } from "../services/Sandbox/SandboxService.ts";
import { softcodeService } from "../services/Softcode/index.ts";
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

export default () => {
  addCmd({
    name: "@trigger",
    pattern: /^@tr(?:igger)?\s+([^/]+)\/([^=]+)(?:=(.*))?$/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      const en = await dbojs.queryOne({ id: u.me.id });
      if (!en) return;

      const tarName = u.cmd.args[0];
      if (!u.cmd.args[1]) {
        u.send("Usage: @trigger <object>/<attribute>");
        return;
      }
      const attrName = u.cmd.args[1].toUpperCase();
      const triggerArgsRaw = u.cmd.args[2] || "";

      const tar = await target(en as unknown as IDBOBJ, tarName);
      if (!tar) return send([u.socketId || ""], "I can't find that here!");

      const attr = await getAttribute(tar, attrName);
      if (!attr) return send([u.socketId || ""], `Attribute ${attrName} not found on ${tarName}.`);

      const evalArgs = splitArgs(triggerArgsRaw).map((a) => a.trim());

      try {
        await sandboxService.runScript(attr.value, {
          id: tar.id,
          location: tar.location || "limbo",
          // deno-lint-ignore no-explicit-any
          state: (tar as any).data?.state || {},
          target: evalArgs[0] ? { id: evalArgs[0] } : undefined,
        });
      } catch (err) {
        send([u.socketId || ""], `%chGame>%cn Script error on ${tarName}/${attrName}: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      send([u.socketId || ""], `Triggered script on ${tarName}/${attrName}.`);
    },
  });

  addCmd({
    name: "@wait",
    pattern: /^@wait\s+(\d+)\s*=\s*(.*)/i,
    lock: "connected",
    exec: (u: IUrsamuSDK) => {
      const MAX_WAIT = 3600; // 1 hour cap
      const seconds = parseInt(u.cmd.args[0]);
      const cmd = u.cmd.args[1];
      if (isNaN(seconds) || seconds < 0)
        return send([u.socketId || ""], "Invalid time.");
      if (seconds > MAX_WAIT)
        return send([u.socketId || ""], `Wait time cannot exceed ${MAX_WAIT} seconds.`);

      queue
        .enqueue(
          {
            command: cmd,
            executor: u.me.id,
            enactor: u.me.id,
            data: {},
          },
          seconds * 1000
        )
        .then((pid) => {
          send([u.socketId || ""], `Wait ${seconds}s: ${cmd} (PID: ${pid})`);
        });
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
    },
  });
};
