import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

/**
 * @link <target>=<destination>
 *
 * Links an object to a destination. TinyMUX rules:
 *
 *   Room  → sets dropto (destination must be LINK_OK or owned by actor)
 *   Exit  → sets destination; exit MUST be unlinked first.
 *           Anyone may link an unlinked exit. If owned by someone else, actor
 *           becomes the new owner (costs 2 quota: 1 link + 1 reimburse).
 *           Linking your own exit costs 1 quota.
 *   Thing/Player → sets home (destination must be ABODE or owned by actor)
 *
 * Destination keywords:
 *   here  — current room (no db search)
 *   home  — actor's stored home room
 *
 * Examples:
 *   @link North;N=here          — link exit to current room
 *   @link North;N=#5            — link exit to room #5
 *   @link here=#10              — set current room's dropto to #10
 *   @link me=here               — set your home to your current room
 *   @link widget=#5             — set widget's home to room #5
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const input = (u.cmd.args[0] || "").trim();
  const match = input.match(/^(.+?)\s*=\s*(.*)$/);

  if (!match) {
    u.send("Usage: @link <target>=<destination>");
    return;
  }

  const targetName = match[1].trim();
  const destArg    = match[2].trim();

  // ── Resolve target ────────────────────────────────────────────────────────
  const tResults = await u.db.search(targetName);
  const target   = tResults[0];
  if (!target) { u.send(`Could not find target: ${targetName}`); return; }
  if (!(await u.canEdit(actor, target))) { u.send("Permission denied."); return; }

  // ── Resolve destination ───────────────────────────────────────────────────
  const isHere = /^here$/i.test(destArg);
  const isHome = /^home$/i.test(destArg);

  let dest = undefined as typeof target | undefined;

  if (isHere) {
    dest = u.here;
  } else if (isHome) {
    const actorHomeId = actor.state.home as string | undefined;
    if (!actorHomeId) {
      u.send("You have no home set.");
      return;
    }
    const homeResults = await u.db.search({ id: actorHomeId });
    dest = homeResults[0];
    if (!dest) {
      u.send("Your home room no longer exists.");
      return;
    }
  } else {
    const dResults = await u.db.search(destArg);
    dest = dResults[0];
    if (!dest) {
      u.send(`Could not find destination: ${destArg}`);
      return;
    }
  }

  const isStaff = actor.flags.has("wizard") || actor.flags.has("admin") || actor.flags.has("superuser");
  const quota   = (actor.state.quota as number) ?? 0;

  // ── Exit: must be unlinked ────────────────────────────────────────────────
  if (target.flags.has("exit")) {
    const alreadyLinked = !!(target.state.destination as string | undefined);
    if (alreadyLinked) {
      u.send(`${u.util.displayName(target, actor)} is already linked. Use %ch@unlink%cn first.`);
      return;
    }

    // Check that actor can link to destination (LINK_OK or owns it)
    const canLinkTo = (await u.canEdit(actor, dest)) || dest.flags.has("link_ok");
    if (!canLinkTo) {
      u.send("You can't link to that.");
      return;
    }

    // Cost: 1 if own exit, 2 if taking over someone else's exit
    const exitOwnerId = target.state.owner as string | undefined;
    const isOwnExit   = !exitOwnerId || exitOwnerId === actor.id;
    const linkCost    = isOwnExit ? 1 : 2;

    if (!isStaff && quota < linkCost) {
      u.send(`Not enough quota. Cost: ${linkCost}, You have: ${quota}.`);
      return;
    }

    // Transfer ownership if needed, reimburse former owner
    if (!isOwnExit && exitOwnerId) {
      await u.db.modify(target.id, "$set", { "data.owner": actor.id });
      const formerOwnerResults = await u.db.search({ id: exitOwnerId });
      const formerOwner = formerOwnerResults[0];
      if (formerOwner && !formerOwner.flags.has("wizard") && !formerOwner.flags.has("admin")) {
        await u.db.modify(exitOwnerId, "$inc", { "data.quota": 1 });
      }
    }

    await u.db.modify(target.id, "$set", { "data.destination": dest.id });
    if (!isStaff) {
      await u.db.modify(actor.id, "$inc", { "data.quota": -linkCost });
    }
    u.send(`You link ${u.util.displayName(target, actor)} to ${u.util.displayName(dest, actor)}.`);
    return;
  }

  // ── Room: sets dropto (LINK_OK or owned) ──────────────────────────────────
  if (target.flags.has("room")) {
    const canLinkTo = (await u.canEdit(actor, dest)) || dest.flags.has("link_ok");
    if (!canLinkTo) {
      u.send("Permission denied.");
      return;
    }
    await u.db.modify(target.id, "$set", { "data.dropto": dest.id });
    u.send(`You link ${u.util.displayName(target, actor)} to ${u.util.displayName(dest, actor)}.`);
    return;
  }

  // ── Thing / Player: sets home (ABODE or owned) ────────────────────────────
  const canLinkTo = (await u.canEdit(actor, dest)) || dest.flags.has("abode");
  if (!canLinkTo) {
    u.send(`That room is not set ABODE. You can't link to it.`);
    return;
  }
  await u.db.modify(target.id, "$set", { "data.home": dest.id });
  u.send(`You link ${u.util.displayName(target, actor)} to ${u.util.displayName(dest, actor)}.`);
};
