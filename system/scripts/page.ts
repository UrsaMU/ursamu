import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: page.ts
 * ESM Refactored, Production-ready, and Telnet-compatible.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const input = u.cmd.args.join(" ").trim();

  const match = input.match(/^(.+?)=(.*)$/);
  if (!match) {
    u.send("Usage: page <target>=<message>");
    return;
  }

  const targetName = match[1].trim();
  const message = match[2].trim();

  if (!message) {
    u.send("What do you want to say?");
    return;
  }

  // Resolve Target
  const target = (await u.db.search(targetName)).find(obj => obj.flags.has('player'));

  if (!target || target.flags.has("dark") || !target.flags.has("connected")) {
    u.send(`I can't find player "${targetName}" online.`);
    return;
  }

  const actorName = (actor.state.moniker as string) || (actor.state.name as string) || actor.name;
  const targetActualName = (target.state.moniker as string) || (target.state.name as string) || target.name;

  // ANSI Output for Telnet
  u.send(`%ch${actorName}%cn pages you: ${message}`, target.id);
  u.send(`You paged ${targetActualName} with: ${message}`);

  // Structured result for Web
  u.ui.layout({
    components: [],
    meta: {
      type: "page",
      actorId: actor.id,
      actorName: actorName,
      targetId: target.id,
      targetName: targetActualName,
      message: message
    }
  });
};
