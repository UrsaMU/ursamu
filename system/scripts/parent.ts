import { IUrsamuSDK, IDBObj } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: parent.ts
 *
 * Usage:
 *   @parent <target>=<parent>   — set parent object
 *   @parent/clear <target>      — remove parent
 */
export default async (u: IUrsamuSDK) => {
  const actor    = u.me;
  const fullArgs = (u.cmd.args[0] || "").trim();

  // Switch comes from cmdParser — @parent/clear → u.cmd.switches[0] = "clear"
  const swtch = (u.cmd.switches?.[0] || "").toLowerCase();

  if (swtch === "clear") {
    if (!fullArgs) { u.send("Usage: @parent/clear <target>"); return; }
    const results = await u.db.search(fullArgs);
    const target  = results[0];
    if (!target) { u.send(`Could not find target: ${fullArgs}`); return; }
    if (!(await u.canEdit(actor, target))) { u.send("Permission denied."); return; }
    await u.db.modify(target.id, "$unset", { "data.parent": 1 });
    u.send(`Parent cleared for ${u.util.displayName(target, actor)}.`);
    return;
  }

  const match = fullArgs.match(/^(.+?)\s*=\s*(.*)$/);
  if (!match) { u.send("Usage: @parent <target>=<parent>"); return; }

  const targetName = match[1].trim();
  const parentName = match[2].trim();

  const tResults = await u.db.search(targetName);
  const target   = tResults[0];
  if (!target) { u.send(`Could not find target: ${targetName}`); return; }
  if (!(await u.canEdit(actor, target))) { u.send("Permission denied."); return; }

  const pResults  = await u.db.search(parentName);
  const parentObj = pResults[0];
  if (!parentObj) { u.send(`Could not find parent: ${parentName}`); return; }

  // Circular reference check
  const visited = new Set<string>();
  let curr: IDBObj | undefined = parentObj;
  while (curr) {
    if (curr.id === target.id) { u.send("Circular parent reference detected."); return; }
    if (visited.has(curr.id)) break;
    visited.add(curr.id);
    const pId = ((curr.state.parent as string) || "").replace("#", "");
    if (!pId) break;
    const next = await u.db.search(`#${pId}`);
    curr = next[0];
  }

  await u.db.modify(target.id, "$set", { "data.parent": parentObj.id });
  u.send(`Parent of ${u.util.displayName(target, actor)} set to ${u.util.displayName(parentObj, actor)}.`);
};
