import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: say.ts
 * ESM Refactored, Production-ready, and Telnet-compatible.
 */
export default (u: IUrsamuSDK) => {
  const actor = u.me;
  const message = u.cmd.args.join(" ").trim();

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
};
