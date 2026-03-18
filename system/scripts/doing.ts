import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: doing.ts
 * ESM Refactored, Production-ready.
 */
export default async (u: IUrsamuSDK) => {
  const message = u.cmd.args.join(" ").trim();

  const actorName = u.util.displayName(u.me, u.me);
  if (!message) {
    const { doing: _doing, ...rest } = u.me.state;
    await u.db.modify(u.me.id, "$set", { data: rest });
    u.send("@doing cleared.");
    u.here.broadcast(`${actorName} is no longer doing anything special.`, { exclude: [u.me.id] });
  } else {
    if (message.length > 100) {
      u.send("Doing message is too long (max 100).");
      return;
    }
    await u.db.modify(u.me.id, "$set", { data: { ...u.me.state, doing: message } });
    u.send(`You are now doing: ${message}`);
    u.here.broadcast(`${actorName} is now: ${message}`, { exclude: [u.me.id] });
  }
};
