import { addCmd } from "../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

addCmd({
  name: "&",
  pattern: /^&(\S+)\s+(\S+)\s*=\s*(.*)?$/is,
  lock: "connected",
  category: "Building",
  help: `&<attribute>[/softcode] <target>=<value>  — Set an attribute on an object.
&<attribute> <target>=                     — Clear an attribute.

The /softcode type hint marks the attribute as evaluable softcode.

Examples:
  &short-desc me=A tall figure in a dark coat.
  &listen #5=*hello*
  &ahear/softcode #5=[say(hello)]
  &short-desc me=`,
  exec: async (u: IUrsamuSDK) => {
    const attrPart  = u.cmd.args[0] || "";
    const targetRef = (u.cmd.args[1] || "").trim();
    const value     = u.cmd.args[2] ?? "";

    // Parse optional /softcode type hint from attribute name
    const slashIdx = attrPart.indexOf("/");
    const attrName = (slashIdx === -1 ? attrPart : attrPart.slice(0, slashIdx)).toUpperCase();
    const typeHint = slashIdx !== -1 && attrPart.slice(slashIdx + 1).toLowerCase() === "softcode"
      ? "softcode"
      : "attribute";

    if (!attrName) { u.send("Usage: &<attribute> <object>=<value>"); return; }

    const target = await u.util.target(u.me, targetRef, true);
    if (!target) { u.send(`I can't find "${targetRef}".`); return; }
    if (!await u.canEdit(u.me, target)) { u.send("You can't edit that."); return; }

    const displayName = target.name || target.id;

    if (!value) {
      const removed = await u.attr.clear(target.id, attrName);
      if (!removed) {
        u.send(`${displayName} doesn't have attribute %ch${attrName}%cn.`);
      } else {
        u.send(`${displayName}'s attribute %ch${attrName}%cn removed.`);
      }
      return;
    }

    await u.attr.set(target.id, attrName, value, typeHint);
    u.send(`${displayName}'s attribute %ch${attrName}%cn set.`);
  },
});
