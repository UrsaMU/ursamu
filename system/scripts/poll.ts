import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @poll [<message>]
 *
 * Set or clear your WHO-list "doing" blurb.
 *   @poll Adventuring in the Shadowlands
 *   @poll          (clears it)
 */
export default async (u: IUrsamuSDK) => {
  const doing = (u.cmd.args[0] || "").trim();
  await u.db.modify(u.me.id, "$set", { "data.doing": doing });
  if (doing) {
    u.send(`WHO doing set to: ${doing}`);
  } else {
    u.send("WHO doing cleared.");
  }
};
