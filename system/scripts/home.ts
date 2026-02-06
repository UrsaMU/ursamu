import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: home.ts
 * Sends the player to their home location.
 */
export default (u: IUrsamuSDK) => {
  const actor = u.me;
  const homeId = (actor.state.home as string) || "1";
  
  // Note: actor.location is currently not directly exposed in the SDK object,
  // but we can assume the teleport handles the check if we want, or just force it.
  u.teleport(actor.id, homeId);
  u.send("There's no place like home...");
};
