import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: doing.ts
 * ESM Refactored, Production-ready.
 */
export default async (u: IUrsamuSDK) => {
  const message = (u.cmd.args[0] || "").trim();

  if (!message) {
    await u.db.modify(u.me.id, "$unset", { "data.doing": 1 });
    u.send("@doing cleared.");
  } else {
    if (message.length > 100) {
      u.send("Doing message is too long (max 100).");
      return;
    }
    await u.db.modify(u.me.id, "$set", { "data.doing": message });
    u.send(`You are now doing: ${message}`);
  }
};
