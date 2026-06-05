import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";

const MESSAGE_ATTRS = [
  { name: "@succ",  attr: "success",  help: "Set the success message for an object." },
  { name: "@osucc", attr: "osuccess", help: "Set the outer success message for an object." },
  { name: "@fail",  attr: "fail",     help: "Set the failure message for an object." },
  { name: "@ofail", attr: "ofail",    help: "Set the outer failure message for an object." },
  { name: "@drop",  attr: "drop",     help: "Set the drop message for an object." },
  { name: "@odrop", attr: "odrop",    help: "Set the outer drop message for an object." },
] as const;

function makeExec(cmdName: string, attrName: string) {
  return async (u: IUrsamuSDK): Promise<void> => {
    const [objRef, message] = u.cmd.args;
    const cleanRef = u.util.stripSubs(objRef ?? "").trim();
    if (!cleanRef) { u.send(`Usage: ${cmdName} <object>=<message>`); return; }

    const target = await u.util.target(u.me, cleanRef, true);
    if (!target) { u.send("I don't see that here."); return; }

    if (!(await u.canEdit(u.me, target))) {
      u.send("Permission denied.");
      return;
    }

    if (!message) {
      await u.db.modify(target.id, "$unset", { [`data.${attrName}`]: "" });
      u.send(`${cmdName} cleared on ${u.util.displayName(target, u.me)}.`);
      return;
    }

    await u.db.modify(target.id, "$set", { [`data.${attrName}`]: message });
    u.send(`${cmdName} set on ${u.util.displayName(target, u.me)}.`);
  };
}

for (const msg of MESSAGE_ATTRS) {
  addCmd({
    name: msg.name,
    pattern: new RegExp(`^${msg.name.replace("@", "@?")}\\s+(.+?)\\s*=\\s*(.*)?$`, "i"),
    lock: "connected builder+",
    category: "Building",
    help: `${msg.name} <object>=<message>  — ${msg.help}

Leave <message> blank to clear the attribute.

Examples:
  ${msg.name} chest=The chest opens with a click.
  ${msg.name} chest=`,
    exec: makeExec(msg.name, msg.attr),
  });
}
