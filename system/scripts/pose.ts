import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: pose.ts
 * ESM Refactored, Production-ready, and Telnet-compatible.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const input = u.cmd.args.join(" ").trim();

  if (!input) {
    u.send("Pose what?");
    return;
  }

  const name = (actor.state.moniker as string) || (actor.state.name as string) || actor.name;
  const isSemipose = u.cmd.name === ";";
  const content = isSemipose ? `${name}${input}` : `${name} ${input}`;

  // ANSI Output for Telnet
  const ansiOutput = `%ch${content}%cn`;
  u.here.broadcast(ansiOutput);

  // Structured result for Web
  const meta: Record<string, unknown> = {
    type: "pose",
    actorId: actor.id,
    actorName: name,
    content: content,
    isSemipose: isSemipose
  };

  // Check for active scenes
  const activeScenes = await u.db.search({ status: "active", location: u.here.id });
  if (activeScenes && activeScenes.length > 0) {
    meta.sceneId = activeScenes[0].id;
  }

  u.ui.layout({
    components: [],
    meta: meta
  });
};
