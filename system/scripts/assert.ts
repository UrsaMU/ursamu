import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @assert <condition>
 *
 * If <condition> is empty, "0", or "false", the current action queue is
 * halted (no further commands in the trigger chain are executed). Otherwise
 * does nothing — execution continues normally.
 *
 * Primarily used inside triggered attribute sequences:
 *   &CMD_DO obj=$cmd *:@assert [hasattr(me,ACTIVE)];say I am active.
 */
export default (u: IUrsamuSDK) => {
  const val = (u.cmd.args[0] || "").trim().toLowerCase();
  // Truthy values — continue
  if (val && val !== "0" && val !== "false" && val !== "#-1") return;
  // Falsy — halt by throwing an abort sentinel
  throw new Error("@assert: condition false — halting action queue");
};
