import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: quit.ts
 * Quits the game and disconnects the player.
 */
export default (u: IUrsamuSDK) => {
  u.send("See You, Space Cowboy...", undefined, { quit: true });
};
