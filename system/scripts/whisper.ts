import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * whisper <target>=<message>
 * whisper <target>:<pose>
 *
 * Sends a private message to a player in the same room.
 *   Sender sees:  You whisper to Target, "message"
 *   Target sees:  Actor whispers to you, "message"
 *   Room sees:    Actor whispers something to Target.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const arg = (u.cmd.args[0] || "").trim();
  if (!arg) { u.send("Usage: whisper <target>=<message>"); return; }

  // Support both "target=message" and "target:pose"
  const isPose = !arg.includes("=") && arg.includes(":");
  let targetRef: string;
  let rawMsg: string;

  if (isPose) {
    const colon = arg.indexOf(":");
    targetRef = arg.slice(0, colon).trim();
    rawMsg = arg.slice(colon + 1).trim();
  } else {
    const eq = arg.indexOf("=");
    if (eq === -1) { u.send("Usage: whisper <target>=<message>"); return; }
    targetRef = arg.slice(0, eq).trim();
    rawMsg = arg.slice(eq + 1).trim();
  }

  if (!rawMsg) { u.send("What do you want to whisper?"); return; }

  // Target must be in the same room
  const roomContents = await u.db.search({ location: u.here.id });
  const target = roomContents.find(o =>
    o.flags.has("player") && o.flags.has("connected") &&
    ((o.state.name as string) || o.name || "").toLowerCase().startsWith(targetRef.toLowerCase()) &&
    o.id !== actor.id
  );

  if (!target) {
    u.send(`There is no connected player "${targetRef}" here.`);
    return;
  }

  const actorName = (actor.state.moniker as string) || (actor.state.name as string) || actor.name || "Someone";
  const targetName = (target.state.moniker as string) || (target.state.name as string) || target.name || "Someone";

  if (isPose) {
    u.send(`%chWhisper>%cn ${actorName} ${rawMsg}`, target.id);
    u.send(`%chWhisper>%cn ${actorName} ${rawMsg}`);
    u.here.broadcast(`%ch${actorName}%cn whispers something to %ch${targetName}%cn.`,
      { exclude: [actor.id, target.id] } as Record<string, unknown>);
  } else {
    u.send(`%ch${actorName}%cn whispers to you, "${rawMsg}"`, target.id);
    u.send(`You whisper to %ch${targetName}%cn, "${rawMsg}"`);
    u.here.broadcast(`%ch${actorName}%cn whispers something to %ch${targetName}%cn.`,
      { exclude: [actor.id, target.id] } as Record<string, unknown>);
  }
};
