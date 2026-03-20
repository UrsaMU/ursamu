import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @remit <room>=<message>
 * Emit an attributed message to all players in a room. Admin/wizard only.
 * Message is prefixed with the actor's display name: "Name> message"
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
    u.send("Usage: @remit <room>=<message>");
    return;
  }

  const roomRef = arg.slice(0, eqIdx).trim();
  const message = arg.slice(eqIdx + 1);

  if (!roomRef || !message) {
    u.send("Usage: @remit <room>=<message>");
    return;
  }

  const roomResults = await u.db.search(roomRef);
  const room = roomResults.find(r => r.flags.has("room"));
  if (!room) {
    u.send(`I can't find a room called '${roomRef}'.`);
    return;
  }

  const actorName = u.util.displayName(actor, actor);
  const attributed = `${actorName}> ${message}`;

  // Find all connected players in that room
  const players = await u.db.search({ location: room.id });
  const connected = players.filter(p => p.flags.has("connected"));

  if (connected.length === 0) {
    u.send(`No connected players in ${room.name || room.id}.`);
    return;
  }

  for (const p of connected) {
    u.send(attributed, p.id);
  }

  u.send(`Remitted to ${connected.length} player(s) in ${room.name || room.id}.`);
};
