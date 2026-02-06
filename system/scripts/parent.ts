import { IUrsamuSDK, IDBObj } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: parent.ts
 * Migrated from legacy @parent and @parent/clear commands.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const fullArgs = u.cmd.args.join(" ").trim();
  const swtch = (u.cmd.name.split("/")[1] || "").toLowerCase();

  // Handle @parent/clear
  if (swtch === "clear") {
    const targetName = fullArgs;
    if (!targetName) {
      u.send("Usage: @parent/clear <target>");
      return;
    }

    const searchTarget = await u.db.search(targetName);
    const target = searchTarget[0];

    if (!target) {
      u.send(`Could not find target: ${targetName}`);
      return;
    }

    if (!u.canEdit(actor, target)) {
      u.send("Permission denied.");
      return;
    }

    await u.db.modify(target.id, "$unset", { "data.parent": "" });
    u.send(`Parent cleared for ${u.util.displayName(target, actor)}.`);
    return;
  }

  // Handle @parent <target>=<parent>
  const match = fullArgs.match(/^(.+?)\s*=\s*(.*)$/);
  if (!match) {
    u.send("Usage: @parent <target>=<parent>");
    return;
  }

  const targetName = match[1].trim();
  const parentName = match[2].trim();

  const searchTarget = await u.db.search(targetName);
  const target = searchTarget[0];

  if (!target) {
    u.send(`Could not find target: ${targetName}`);
    return;
  }

  if (!u.canEdit(actor, target)) {
    u.send("Permission denied.");
    return;
  }

  const searchParent = await u.db.search(parentName);
  const parentObj = searchParent[0];

  if (!parentObj) {
    u.send(`Could not find parent: ${parentName}`);
    return;
  }

  // Circular reference check
  let curr: IDBObj | undefined = parentObj;
  let count = 0;
  while (curr && count < 20) {
    if (curr.id === target.id) {
      u.send("Circular parent reference detected.");
      return;
    }
    const pId = (curr.state.parent as string || "").replace("#", "");
    if (!pId) break;
    const parentSearch = await u.db.search(`#${pId}`);
    curr = parentSearch[0];
    count++;
  }

  await u.db.modify(target.id, "$set", { "data.parent": "#" + parentObj.id });
  u.send(`Parent of ${u.util.displayName(target, actor)} set to ${u.util.displayName(parentObj, actor)}.`);
};
