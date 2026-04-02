import type { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @lemit <message>
 *
 * Emit a raw (unattributed) message to the enactor's current room.
 * This is an alias for @emit without a room target, explicitly scoped to
 * the enacting object's location. Useful in trigger chains where code-running
 * objects may be in a different location than the enactor.
 *
 * Unlike @emit <room>=<msg>, @lemit always targets the enactor's room
 * and is available to builder+ (no admin required).
 *
 * Examples:
 *   @lemit Thunder rolls across the sky.
 *   @lemit The lights flicker and die.
 */
export default async (u: IUrsamuSDK) => {
  const message = (u.cmd.args[0] ?? "").trim();
  if (!message) { u.send("Usage: @lemit <message>"); return; }

  const occupants = await u.db.search({
    $and: [{ location: u.here.id }, { flags: /connected/i }],
  });

  for (const occ of occupants) u.send(message, occ.id);

  // Fire ^-pattern listeners for MONITOR objects in the room
  await u.events.emit("room:text", {
    roomId:    u.here.id,
    text:      message,
    speakerId: u.me.id,
  });
};
