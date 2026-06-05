import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";

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
  category: "Softcode",
  help: `@trigger <object>/<attribute>[=<arg0>[,<arg1>...]]

Fire a stored attribute as a script. The attribute value is executed with
the triggering player as the enactor (%#) and the target object as the
executor (%!). Comma-separated arguments after = become %0, %1, etc.

Examples:
  @trigger me/GREET              Fire &GREET on yourself
  @trigger box/OPEN=force        Fire &OPEN with %0="force"`,
  exec: execTrigger,
});
