import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @away [<message>]
 *
 * Set or clear your away message. When someone pages you while this is set
 * they see the message in addition to the page being delivered.
 *   @away At dinner, back in 30 min.
 *   @away          (clears it)
 */
export default async (u: IUrsamuSDK) => {
  const msg = (u.cmd.args[0] || "").trim();
  await u.db.modify(u.me.id, "$set", { "data.away": msg });
  if (msg) {
    u.send(`Away message set: ${msg}`);
  } else {
    u.send("Away message cleared.");
  }
};
