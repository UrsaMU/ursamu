import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @trigger <object>/<attr> [=args]
 * Fire a stored attribute as a script.
 * The attribute's value is run through the sandbox with the object as actor.
 *
 * Examples:
 *   @trigger me/ACONNECT
 *   @trigger box/OPEN=force
 */
export default async (u: IUrsamuSDK) => {
  const arg = (u.cmd.args[0] || "").trim();

  if (!arg) {
    u.send("Usage: @trigger <object>/<attr> [=args]");
    return;
  }

  // Split off optional args after "="
  const eqIdx = arg.indexOf("=");
  const ref = eqIdx === -1 ? arg : arg.slice(0, eqIdx).trim();
  const triggerArgs = eqIdx === -1 ? [] : arg.slice(eqIdx + 1).trim().split(" ").filter(Boolean);

  const slashIdx = ref.indexOf("/");
  if (slashIdx === -1) {
    u.send("Usage: @trigger <object>/<attr>  (must include '/')");
    return;
  }

  const objRef = ref.slice(0, slashIdx).trim();
  const attrName = ref.slice(slashIdx + 1).trim().toUpperCase();

  if (!objRef || !attrName) {
    u.send("Usage: @trigger <object>/<attr>");
    return;
  }

  const results = await u.db.search(objRef);
  const target = results[0];
  if (!target) {
    u.send(`I can't find '${objRef}'.`);
    return;
  }

  await u.trigger(target.id, attrName, triggerArgs);
};
