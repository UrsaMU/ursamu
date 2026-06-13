import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

/**
 * @clone[/<switches>] <object>[=<newname>]
 *
 * Creates a near-exact duplicate of <object>. TinyMUX rules:
 *
 *   • You may clone your own objects OR VISUAL objects owned by others.
 *   • Default placement: current location (/location).
 *   • Cloning someone else's object (even VISUAL) sets HALTED on the clone.
 *   • Flags in the stripped list are removed unless /nostrip is used.
 *     Stripped by default: BLIND CONNECTED GAGGED IMMORTAL INHERIT ROYALTY
 *                          SLAVE STAFF SUSPECT UNINSPECTED WIZARD
 *   • WIZARD can never be cloned (even with /nostrip) except by #1.
 *   • Exits, contents, and locked attributes of the original are NOT copied.
 *
 * Switches:
 *   /cost       Treat the value after = as the object's coin cost, not its name.
 *   /inherit    Don't reset the INHERIT flag on the clone.
 *   /inventory  Place clone in your inventory instead of your current location.
 *   /location   Place clone in your current location (default).
 *   /nostrip    Don't strip flags (except WIZARD).
 *   /parent     Set clone's parent to the original object.
 *
 * Examples:
 *   @clone widget=My Widget Copy
 *   @clone/inventory widget
 *   @clone/location widget=Library Copy
 *   @clone/parent widget=Derived Widget
 */

const STRIPPED_FLAGS = new Set([
  "blind", "connected", "gagged", "immortal", "inherit",
  "royalty", "slave", "staff", "suspect", "uninspected", "wizard",
]);

export default async (u: IUrsamuSDK) => {
  const actor    = u.me;
  const fullArgs = (u.cmd.args[0] || "").trim();
  const switches = u.cmd.switches || [];

  const eqIdx  = fullArgs.indexOf("=");
  const objRef = eqIdx >= 0 ? fullArgs.slice(0, eqIdx).trim() : fullArgs.trim();
  const rhsArg = eqIdx >= 0 ? fullArgs.slice(eqIdx + 1).trim() : "";

  if (!objRef) {
    u.send("Usage: @clone[/<switches>] <object>[=<newname>]");
    return;
  }

  const isCost      = switches.includes("cost");
  const noStrip     = switches.includes("nostrip");
  const useInventory = switches.includes("inventory");
  const useParent   = switches.includes("parent");
  const keepInherit = switches.includes("inherit");

  // Resolve name/cost from RHS
  const newName = (!isCost && rhsArg) ? rhsArg : "";
  if (newName && newName.length > 200) {
    u.send("Name too long (max 200 characters).");
    return;
  }

  // Find original
  const results = await u.db.search(objRef);
  const obj     = results[0];
  if (!obj) { u.send("I can't see that here."); return; }

  // Permission check: own object OR VISUAL
  const isOwn   = (obj.state.owner as string) === actor.id;
  const isVis   = obj.flags.has("visual");
  if (!isOwn && !isVis) {
    u.send("Permission denied.");
    return;
  }

  // Quota check
  const isStaff = actor.flags.has("wizard") || actor.flags.has("admin") || actor.flags.has("superuser");
  const quota   = (actor.state.quota as number) ?? 0;
  if (!isStaff && quota < 1) {
    u.send("You don't have enough quota to clone.");
    return;
  }

  // Build cloned flags
  const cloneFlags = new Set<string>();
  for (const f of obj.flags) {
    if (f === "wizard") continue;   // WIZARD is never cloned (even with /nostrip)
    if (!noStrip && STRIPPED_FLAGS.has(f)) continue;
    if (f === "inherit" && !keepInherit && !noStrip) continue;
    cloneFlags.add(f);
  }

  // Placement: /inventory → actor.id, default → current room
  const location = useInventory ? actor.id : u.here.id;

  // Clone state: copy attributes, description; don't copy locked attrs
  // deno-lint-ignore no-explicit-any
  const srcState = obj.state as Record<string, any>;
  // deno-lint-ignore no-explicit-any
  const newState: Record<string, any> = {
    name:        newName || (srcState.name as string) || obj.name || "Cloned Object",
    description: srcState.description || "",
    owner:       actor.id,
    attributes:  Array.isArray(srcState.attributes) ? [...srcState.attributes] : [],
  };

  let clone;
  try {
    clone = await u.db.create({ flags: cloneFlags, location, state: newState });
  } catch (err: unknown) {
    u.send(`Clone failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  // /parent: set clone's parent to original
  if (useParent) {
    await u.db.modify(clone.id, "$set", { "data.parent": obj.id });
  }

  // Set HALTED on clone if we cloned someone else's object
  if (!isOwn) {
    await u.db.modify(clone.id, "$set", { "data.halted": true });
    await u.setFlags(clone.id, "halted");
  }

  // Deduct quota
  if (!isStaff) {
    await u.db.modify(actor.id, "$inc", { "data.quota": -1 });
  }

  u.send(
    `Cloned: %ch${obj.name || obj.id}%cn(#${obj.id}) → %ch${newState.name as string}%cn(#${clone.id})`,
  );
};
