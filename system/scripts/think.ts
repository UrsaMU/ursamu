import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: think.ts
 * ESM Refactored, Production-ready.
 */
export default (u: IUrsamuSDK) => {
  const message = u.cmd.args.join(" ");

  if (!message) {
    u.send("What do you want to think?");
    return;
  }

  u.send(message);
};
