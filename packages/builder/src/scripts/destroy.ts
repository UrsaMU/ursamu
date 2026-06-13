import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

/**
 * @destroy[/override][/instant] <object>
 *
 * Destroys <object> and refunds its creation cost to the owner.
 *
 * TinyMUX rules:
 *   • Things and exits are destroyed immediately — no confirmation required.
 *   • Rooms are NOT destroyed immediately. The GOING flag is set and destruction
 *     is delayed. Calling @destroy again on a GOING room destroys it at once.
 *   • /instant  — bypass delay; destroy room immediately.
 *   • /override — destroy even if SAFE flag is set.
 *   • DESTROY_OK on target: anyone holding it may destroy it (overrides SAFE).
 *
 * Examples:
 *   @destroy widget
 *   @destroy/override safe-widget
 *   @destroy/instant hall
 */
export default async (u: IUrsamuSDK) => {
  const actor      = u.me;
  const switches   = u.cmd.switches || [];
  const targetName = (u.cmd.args[0] || "").trim();
  const instant    = switches.includes("instant");
  const override   = switches.includes("override");

  if (!targetName) {
    u.send("Usage: @destroy[/override][/instant] <target>");
    return;
  }

  const results = await u.db.search(targetName);
  const target  = results[0];
  if (!target) { u.send(`Could not find target: ${targetName}`); return; }

  if (target.flags.has("void"))   { u.send("You can't destroy the void."); return; }
  if (target.flags.has("player")) { u.send("Use %ch@toad%cn to destroy players."); return; }

  // ── DESTROY_OK ────────────────────────────────────────────────────────────
  // If the target (or its owner) has DESTROY_OK, anyone holding the object
  // may destroy it regardless of ownership, and SAFE is bypassed.
  const destroyOk = target.flags.has("destroy_ok");
  const isHolding = target.location === actor.id;
  const isThingLike = !target.flags.has("room") && !target.flags.has("exit") && !target.flags.has("player");

  let effectiveDestroyOk = destroyOk;
  if (effectiveDestroyOk && isThingLike && !isHolding) {
    // DESTROY_OK but actor isn't holding it — fall back to canEdit
    if (!(await u.canEdit(actor, target))) {
      u.send(`You must be holding ${u.util.displayName(target, actor)} to destroy it.`);
      return;
    }
    // canEdit passed — still counts as effectiveDestroyOk
  }

  // ── Ownership check ───────────────────────────────────────────────────────
  if (!effectiveDestroyOk && !(await u.canEdit(actor, target))) {
    u.send("You can't destroy that.");
    return;
  }

  // ── SAFE check ────────────────────────────────────────────────────────────
  if (target.flags.has("safe") && !override && !effectiveDestroyOk) {
    u.send(`${u.util.displayName(target, actor)} has the SAFE flag. Use %ch@destroy/override%cn to destroy it.`);
    return;
  }

  // ── GOING flag for rooms ──────────────────────────────────────────────────
  // TinyMUX: rooms are delayed up to 10 min. First call sets GOING; second
  // call (or /instant or DESTROY_OK) destroys immediately.
  if (target.flags.has("room") && !instant && !effectiveDestroyOk) {
    if (!target.flags.has("going")) {
      await u.db.modify(target.id, "$set", {
        "data.going":   true,
        "data.goingAt": Date.now() + 10 * 60 * 1000,
      });
      await u.setFlags(target.id, "going");
      u.send(`${u.util.displayName(target, actor)} is going.  It will be destroyed in ten minutes.`);
      return;
    }
    // Already GOING — destroy now
  }

  // ── Evict connected occupants before destroying a room ────────────────────
  if (target.flags.has("room")) {
    const occupants = await u.db.search({
      $and: [{ location: target.id }, { flags: /connected/i }],
    });
    for (const occ of occupants) {
      const homeId = (occ.state.home as string) || "1";
      u.send("The room crumbles around you. You are sent home.", occ.id);
      u.teleport(occ.id, homeId);
    }
  }

  const displayName = u.util.displayName(target, actor);
  await u.db.destroy(target.id);
  u.send(`You destroy ${displayName}.`);

  // ── Quota refund to non-staff owner ───────────────────────────────────────
  const ownerId = target.state.owner as string | undefined;
  if (ownerId) {
    const ownerResults = await u.db.search({ id: ownerId });
    const owner        = ownerResults[0];
    const isStaff      = owner?.flags.has("wizard") || owner?.flags.has("admin") || owner?.flags.has("superuser");
    if (owner && !isStaff) {
      await u.db.modify(owner.id, "$inc", { "data.quota": 1 });
    }
  }

  // ── Clean up orphaned exits ────────────────────────────────────────────────
  const orphans = await u.db.search({
    $and: [
      { $or: [{ "data.destination": target.id }, { location: target.id }] },
      { flags: /exit/i },
    ],
  });
  for (const exit of orphans) {
    await u.db.destroy(exit.id);
  }
  if (orphans.length > 0) {
    u.send(`${orphans.length} orphaned exit${orphans.length === 1 ? "" : "s"} also destroyed.`);
  }
};
