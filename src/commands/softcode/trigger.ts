import { addCmd } from "../../services/commands/index.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";
import { dbojs } from "../../services/Database/index.ts";
import { hooks } from "../../services/Hooks/index.ts";
import { splitArgs } from "../../utils/splitArgs.ts";
import { send } from "../../services/broadcast/index.ts";
import { target } from "../../utils/target.ts";
import type { IDBOBJ } from "../../@types/IDBObj.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";

export async function execTrigger(u: IUrsamuSDK): Promise<void> {
  const arg = (u.cmd.args[0] || "").trim();
  if (!arg) { u.send("Usage: @trigger <object>/<attr> [=args]"); return; }

  const eqIdx = arg.indexOf("=");
  const ref = eqIdx === -1 ? arg : arg.slice(0, eqIdx).trim();
  const triggerArgs = eqIdx === -1 ? [] : arg.slice(eqIdx + 1).trim().split(" ").filter(Boolean);

  const slashIdx = ref.indexOf("/");
  if (slashIdx === -1) { u.send("Usage: @trigger <object>/<attr>  (must include '/')"); return; }

  const objRef = ref.slice(0, slashIdx).trim();
  const attrName = ref.slice(slashIdx + 1).trim().toUpperCase();
  if (!objRef || !attrName) { u.send("Usage: @trigger <object>/<attr>"); return; }

  const results = await u.db.search(objRef);
  const target = results[0];
  if (!target) { u.send(`I can't find '${objRef}'.`); return; }

  if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }

  await u.trigger(target.id, attrName, triggerArgs);
}

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

    const tarName  = u.cmd.args[0]?.trim();
    const attrName = u.cmd.args[1]?.trim().toUpperCase();
    if (!tarName || !attrName) return u.send("Usage: @trigger <object>/<attribute>[=<args>]");

    const tar = await target(en as unknown as IDBOBJ, tarName);
    if (!tar) return send([u.socketId || ""], "I can't find that.");

    const evalArgs = splitArgs(u.cmd.args[2] || "").map((a) => a.trim());

    const useLock = (tar.data?.locks as Record<string, string>)?.use;
    if (useLock) {
      const { evaluateLock, hydrate } = await import("../../utils/evaluateLock.ts");
      const allowed = await evaluateLock(
        useLock,
        hydrate(en as unknown as IDBOBJ),
        hydrate(tar as unknown as IDBOBJ),
      );
      if (!allowed) { send([u.socketId || ""], "Permission denied."); return; }
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
