import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: doing.ts
 * ESM Refactored, Production-ready.
 */
export default async (u: IUrsamuSDK) => {
  const message = u.cmd.args.join(" ").trim();

  if (!message) {
    delete u.me.state.doing;
    await u.db.modify(u.me.id, "$set", { data: { ...u.me.state } });
    u.send("@doing cleared.");
  } else {
    if (message.length > 100) {
      u.send("Doing message is too long (max 100).");
      return;
    }
    u.me.state.doing = message;
    await u.db.modify(u.me.id, "$set", { data: { ...u.me.state } });
    u.send(`You are now doing: ${message}`);
  }
};
