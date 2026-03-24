import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * Force-speak commands — emit text as another object you control.
 *
 *   @fsay  <object>=<message>    Object says the message
 *   @fpose <object>=<pose>       Object poses the message
 *   @femit <object>=<message>    Object emits (no attribution)
 *   @npemit <player>=<message>   Private emit to player (no prefix); same-room for non-staff
 */
export const aliases = ["fpose", "femit", "npemit"];

export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const cmd = (u.cmd.original || u.cmd.name).replace(/^@/, "").toLowerCase();
  const isStaff = actor.flags.has("admin") || actor.flags.has("wizard") || actor.flags.has("superuser");

  if (cmd === "npemit") {
    // No-prefix private emit — same-room unless admin
    const arg = (u.cmd.args[0] || "").trim();
    const eqIdx = arg.indexOf("=");
    if (eqIdx === -1) { u.send("Usage: @npemit <player>=<message>"); return; }
    const targetRef = arg.slice(0, eqIdx).trim();
    const message   = arg.slice(eqIdx + 1);
    if (!targetRef || !message) { u.send("Usage: @npemit <player>=<message>"); return; }

    let pool: typeof u.me[];
    if (isStaff) {
      pool = await u.db.search(targetRef);
    } else {
      pool = await u.db.search({ location: u.here.id });
    }
    const target = pool.find(o => {
      const name = ((o.state.name as string) || o.name || "").toLowerCase();
      return o.flags.has("player") && o.flags.has("connected") &&
             name.startsWith(targetRef.toLowerCase());
    });
    if (!target) { u.send(`Can't find connected player "${targetRef}" here.`); return; }

    u.send(message, target.id);
    u.send(`Message sent to ${(target.state.name as string) || target.name}.`);
    return;
  }

  // @fsay / @fpose / @femit
  const arg = (u.cmd.args[0] || "").trim();
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send(`Usage: @${cmd} <object>=<message>`); return; }
  const objRef  = arg.slice(0, eqIdx).trim();
  const message = arg.slice(eqIdx + 1).trim();
  if (!objRef || !message) { u.send(`Usage: @${cmd} <object>=<message>`); return; }

  const results = await u.db.search(objRef);
  const target = results[0];
  if (!target) { u.send(`I can't find "${objRef}".`); return; }

  const canEdit = await u.canEdit(actor, target);
  if (!canEdit) { u.send("Permission denied."); return; }

  switch (cmd) {
    case "fsay":
      await u.forceAs(target.id, `say ${message}`);
      break;
    case "fpose":
      await u.forceAs(target.id, `pose ${message}`);
      break;
    case "femit":
      await u.forceAs(target.id, `@emit ${message}`);
      break;
  }
};
