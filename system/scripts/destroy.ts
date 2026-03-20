import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: destroy.ts
 * @destroy <target>            — shows confirmation prompt
 * @destroy/confirm <target>    — actually destroys the object
 * @destroy/override <target>   — destroys even if safe flag is set
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const switches = u.cmd.switches || [];
  const targetName = (u.cmd.args[0] || "").trim();

  if (!targetName) {
    u.send("Usage: @destroy[/confirm] <target>");
    return;
  }

  const searchTarget = await u.db.search(targetName);
  const target = searchTarget[0];

  if (!target) {
    u.send(`Could not find target: ${targetName}`);
    return;
  }

  // Permission check
  if (!(await u.canEdit(actor, target))) {
    u.send("You can't destroy that.");
    return;
  }

  // Void check — never destroyable
  if (target.flags.has("void")) {
    u.send("You can't destroy the void.");
    return;
  }

  // Safe check — requires /override
  if (target.flags.has("safe") && !switches.includes("override")) {
    u.send(`${u.util.displayName(target, actor)} has the SAFE flag. Use %ch@destroy/override%cn to destroy it.`);
    return;
  }

  // Player check — can't destroy players with @destroy (use @toad)
  if (target.flags.has("player")) {
    u.send("Use %ch@toad%cn to destroy players.");
    return;
  }

  // Confirmation required
  if (!switches.includes("confirm") && !switches.includes("override")) {
    u.send(`Are you sure you want to destroy ${u.util.displayName(target, actor)} (#${target.id})?`);
    u.send(`Use %ch@destroy/confirm ${targetName}%cn to confirm.`);
    return;
  }

  // Room destruction: send ALL occupants home before destroying
  if (target.flags.has("room")) {
    const occupants = (target.contents || []).filter(obj => obj.flags.has("player"));
    for (const occ of occupants) {
      const occHome = (occ.state.home as string) || "1";
      u.teleport(occ.id, occHome);
      u.send("The room you were in has been destroyed. You are sent home.", occ.id);
    }
  }

  await u.db.destroy(target.id);
  u.send(`You destroy ${u.util.displayName(target, actor)}.`);

  // Clean up orphaned exits
  const orphanedExits = await u.db.search({
    $and: [
      { $or: [{ "data.destination": target.id }, { location: target.id }] },
      { flags: /exit/i },
    ],
  });

  for (const exit of orphanedExits) {
    await u.db.destroy(exit.id);
  }

  if (orphanedExits.length > 0) {
    u.send(`${orphanedExits.length} orphaned exit${orphanedExits.length === 1 ? "" : "s"} also destroyed.`);
  }
};
