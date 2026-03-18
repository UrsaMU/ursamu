import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: page.ts
 *
 * page <target>=<message>       → Jupiter(J) pages you: Hello!
 * page <target>=:<pose>         → From afar, Jupiter(J) waves.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const input = (u.cmd.args[0] || "").trim();

  const match = input.match(/^(.+?)=(.*)$/);
  if (!match) {
    u.send("Usage: page <target>=<message>");
    return;
  }

  const targetName = match[1].trim();
  const rawMessage = match[2].trim();

  if (!rawMessage) {
    u.send("What do you want to say?");
    return;
  }

  // Resolve Target
  const target = (await u.db.search(targetName)).find(obj => obj.flags.has('player'));

  if (!target || target.flags.has("dark") || !target.flags.has("connected")) {
    u.send(`I can't find player "${targetName}" online.`);
    return;
  }

  // Build display names with alias
  const actorAlias = actor.state?.alias as string;
  const actorBaseName = (actor.state?.moniker as string) || (actor.state?.name as string) || actor.name || "Someone";
  const actorDisplay = actorAlias ? `${actorBaseName}(${actorAlias})` : actorBaseName;

  const targetAlias = target.state?.alias as string;
  const targetBaseName = (target.state?.moniker as string) || (target.state?.name as string) || target.name || "Someone";
  const targetDisplay = targetAlias ? `${targetBaseName}(${targetAlias})` : targetBaseName;

  // Check for pose (starts with :)
  if (rawMessage.startsWith(":")) {
    const pose = rawMessage.slice(1);
    // To target
    u.send(`From afar, %ch${actorDisplay}%cn ${pose}`, target.id);
    // To sender
    u.send(`Long distance to ${targetDisplay}: %ch${actorDisplay}%cn ${pose}`);
  } else {
    // Normal page
    // To target
    u.send(`%ch${actorDisplay}%cn pages you: ${rawMessage}`, target.id);
    // To sender
    u.send(`You paged ${targetDisplay} with: ${rawMessage}`);
  }

  // Structured result for Web
  u.ui.layout({
    components: [],
    meta: {
      type: "page",
      actorId: actor.id,
      actorName: actorDisplay,
      targetId: target.id,
      targetName: targetDisplay,
      message: rawMessage
    }
  });
};
