import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @emit [<room>=]<message>
 *
 * Emit a raw (unattributed) message to a room.
 *
 * Without a target: sends to everyone in your current room (any connected player).
 * With <room>=:     sends to a named room (admin/wizard only).
 *
 * Examples:
 *   @emit Thunder rolls across the sky.
 *   @emit here=The lights flicker and die.
 *   @emit #5=Someone has entered the building.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const arg   = u.cmd.args[0] || "";
  const eqIdx = arg.indexOf("=");

  // No target — emit to current room (builder-accessible)
  if (eqIdx === -1) {
    const message = arg.trim();
    if (!message) { u.send("Usage: @emit [<room>=]<message>"); return; }
    const occupants = await u.db.search({
      $and: [{ location: u.here.id }, { flags: /connected/i }],
    });
    for (const occ of occupants) { u.send(message, occ.id); }
    // Fire ^-pattern listeners for MONITOR objects in the room
    await u.events.emit("room:text", {
      roomId:    u.here.id,
      text:      message,
      speakerId: actor.id,
    });
    return;
  }

  // Room-targeted form: admin only.
  // Note: if a builder's message contains "=", it is routed here unintentionally.
  // The error explains the syntax so the user understands why it was rejected.
  if (!actor.flags.has("admin") && !actor.flags.has("wizard") && !actor.flags.has("superuser")) {
    u.send("Permission denied. (@emit <room>=<message> requires admin+. If your message contains '=', use @oemit instead.)");
    return;
  }

  const roomRef = arg.slice(0, eqIdx).trim();
  const message = arg.slice(eqIdx + 1);
  if (!roomRef || !message) { u.send("Usage: @emit [<room>=]<message>"); return; }

  const roomResults = await u.db.search(roomRef);
  const room = roomResults.find(r => r.flags.has("room"));
  if (!room) { u.send(`I can't find a room called '${roomRef}'.`); return; }

  const players   = await u.db.search({ location: room.id });
  const connected = players.filter(p => p.flags.has("connected"));
  if (connected.length === 0) { u.send(`No connected players in ${room.name || room.id}.`); return; }

  for (const p of connected) { u.send(message, p.id); }
  u.send(`Emitted to ${connected.length} player(s) in ${room.name || room.id}.`);
};
