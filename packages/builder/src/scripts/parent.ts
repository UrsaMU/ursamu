import type { IUrsamuSDK, IDBObj } from "jsr:@ursamu/ursamu";

/**
 * @parent <target>[=<parent>]
 *
 * Sets the parent of <target> to <parent>. Omitting or leaving <parent>
 * empty clears the parent (TinyMUX canonical form — no switch required).
 *
 * TinyMUX rules:
 *   • You must control <target>.
 *   • You must own <parent> OR <parent> must have the PARENT_OK flag set.
 *   • Circular parent chains are rejected.
 *
 * Legacy support:
 *   @parent/clear <target>  — still accepted (backward compat)
 *
 * Examples:
 *   @parent widget=proto-widget
 *   @parent widget=           — clears parent
 *   @parent/clear widget      — same as above (legacy)
 */
export default async (u: IUrsamuSDK) => {
  const actor    = u.me;
  const fullArgs = (u.cmd.args[0] || "").trim();
  const swtch    = (u.cmd.switches?.[0] || "").toLowerCase();

  // ── Legacy /clear switch (backward compat) ────────────────────────────────
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

  // ── Parse: @parent obj=parent  or  @parent obj= ───────────────────────────
  const eqIdx = fullArgs.indexOf("=");

  if (eqIdx === -1) {
    // No = sign at all — show usage
    u.send("Usage: @parent <target>[=<parent>]  (leave parent empty to clear)");
    return;
  }

  const targetName = fullArgs.slice(0, eqIdx).trim();
  const parentName = fullArgs.slice(eqIdx + 1).trim();

  if (!targetName) {
    u.send("Usage: @parent <target>[=<parent>]");
    return;
  }

  const tResults = await u.db.search(targetName);
  const target   = tResults[0];
  if (!target) { u.send(`Could not find target: ${targetName}`); return; }
  if (!(await u.canEdit(actor, target))) { u.send("Permission denied."); return; }

  // ── Empty parent = clear ──────────────────────────────────────────────────
  if (!parentName) {
    await u.db.modify(target.id, "$unset", { "data.parent": 1 });
    u.send(`Parent cleared for ${u.util.displayName(target, actor)}.`);
    return;
  }

  // ── Set parent ────────────────────────────────────────────────────────────
  const pResults  = await u.db.search(parentName);
  const parentObj = pResults[0];
  if (!parentObj) { u.send(`Could not find parent: ${parentName}`); return; }

  // TinyMUX: must own parent OR parent has PARENT_OK
  const canUseParent = (await u.canEdit(actor, parentObj)) || parentObj.flags.has("parent_ok");
  if (!canUseParent) {
    u.send("Permission denied: you don't own that parent and it isn't PARENT_OK.");
    return;
  }

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
