import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @emit <room>=<message>
 * Emit a message to all players in a room. Admin/wizard only.
 * No attribution — message appears as raw text.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  if (!actor.flags.has("admin") && !actor.flags.has("wizard") && !actor.flags.has("superuser")) {
    u.send("Permission denied.");
    return;
  }

  const arg = u.cmd.args[0] || "";
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) {
    u.send("Usage: @emit <room>=<message>");
    return;
  }

  const roomRef = arg.slice(0, eqIdx).trim();
  const message = arg.slice(eqIdx + 1);

  if (!roomRef || !message) {
    u.send("Usage: @emit <room>=<message>");
    return;
  }

  const roomResults = await u.db.search(roomRef);
  const room = roomResults[0];
  if (!room) {
    u.send(`I can't find a room called '${roomRef}'.`);
    return;
  }

  // Find all connected players in that room
  const players = await u.db.search({ location: room.id });
  const connected = players.filter(p => p.flags.has("connected"));

  if (connected.length === 0) {
    u.send(`No connected players in ${room.name || room.id}.`);
    return;
  }

  for (const p of connected) {
    u.send(message, p.id);
  }

  u.send(`Emitted to ${connected.length} player(s) in ${room.name || room.id}.`);
};
