import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: say.ts
 * ESM Refactored, Production-ready, and Telnet-compatible.
 *
 * After broadcasting, iterates over objects in the same room and fires
 * AHEAR attributes on any object whose LISTEN pattern matches the message.
 */

/** Inline glob/substring matcher for LISTEN patterns. Case-insensitive. */
function _matchListen(pattern: string, text: string): boolean {
  const p = pattern.trim().toLowerCase();
  const t = text.toLowerCase();
  if (p === "*") return true;
  const hasLeading = p.startsWith("*");
  const hasTrailing = p.endsWith("*");
  if (hasLeading && hasTrailing) {
    const inner = p.slice(1, -1);
    return inner === "" ? true : t.includes(inner);
  }
  if (hasLeading) return t.endsWith(p.slice(1));
  if (hasTrailing) return t.startsWith(p.slice(0, -1));
  return t.includes(p);
}

export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const message = (u.cmd.args[0] || "").trim();

  if (!message) {
    u.send("What do you want to say?");
    return;
  }

  const name = (actor.state.moniker as string) || (actor.state.name as string) || actor.name;

  // ANSI Output for Telnet
  const ansiOutput = `%ch${name}%cn says, "${message}"`;
  u.here.broadcast(ansiOutput);

  // Structured result for Web
  u.ui.layout({
    components: [],
    meta: {
      type: "say",
      actorId: actor.id,
      actorName: name,
      message: message
    }
  });

  // Fire @listen / @ahear hooks for objects in the same room
  try {
    const roomId = u.here.id;
    const roomContents = await u.db.search({ location: roomId });
    for (const obj of roomContents) {
      // Skip the speaker themselves
      if (obj.id === actor.id) continue;
      // Check for a LISTEN attribute
      const listenAttr = (obj.state.attributes as Array<{ name: string; value: string }> | undefined)
        ?.find((a) => a.name.toUpperCase() === "LISTEN");
      if (!listenAttr) continue;
      if (!_matchListen(listenAttr.value, message)) continue;
      // Fire the AHEAR attribute on this object
      await u.trigger(obj.id, "AHEAR", [message, actor.id]);
    }
  } catch (_e) {
    // Non-fatal: LISTEN/AHEAR errors must not interrupt the say command
  }
};
