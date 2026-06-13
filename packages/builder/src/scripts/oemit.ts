import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

/**
 * @oemit <message>
 *
 * Emits a raw (unattributed) message to all connected players in your
 * current room except yourself. Useful for room events, triggered effects,
 * and softcode that should appear without character attribution.
 *
 * Examples:
 *   @oemit The door creaks as someone enters.
 *   @oemit A bolt of lightning strikes the floor!
 */
export default async (u: IUrsamuSDK) => {
  const message = (u.cmd.args[0] || "").trim();

  if (!message) {
    u.send("Usage: @oemit <message>");
    return;
  }

  const allInRoom = await u.db.search({
    $and: [{ location: u.here.id }, { flags: /connected/i }],
  });
  const others = allInRoom.filter(occ => occ.id !== u.me.id);

  for (const occ of others) {
    u.send(message, occ.id);
  }
};
