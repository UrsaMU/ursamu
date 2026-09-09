// commands/wear.ts -- +wear and +remove for armor/shields.
//
// Sets/unsets item.state.worn for items in the actor's contents. Only items
// with kind=armor or kind=shield may be worn.

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { isArmor, getEqMeta } from "../core/eq.ts";
import { poseRoom } from "../core/poseRoom.ts";

// deno-lint-ignore no-explicit-any
function findInContents(holder: any, q: string): any | undefined {
  // deno-lint-ignore no-explicit-any
  const items: any[] = Array.isArray(holder?.contents) ? holder.contents : [];
  const ql = q.toLowerCase();
  // Exact-name match first.
  for (const it of items) {
    const raw = String(it?.state?.name ?? it?.name ?? "");
    const first = raw.split(";")[0]?.trim().toLowerCase();
    if (first === ql || raw.toLowerCase() === ql) return it;
  }
  // Substring fallback.
  for (const it of items) {
    const raw = String(it?.state?.name ?? it?.name ?? "").toLowerCase();
    if (raw.includes(ql)) return it;
  }
  return undefined;
}

// deno-lint-ignore no-explicit-any
async function resolveCarriedItem(u: IUrsamuSDK, arg: string): Promise<any | undefined> {
  const found = findInContents(u.me, arg);
  if (found) return found;
  // Fall back to ambient resolution (will be rejected if not in contents).
  return await u.util.target(u.me, arg, true);
}

addCmd({
  name: "+wear",
  pattern: /^\+wear\s+(.+)$/i,
  lock: "connected",
  category: "Equipment",
  help: `+wear <item>  -- Don a piece of armor or a shield you are carrying.

SYNTAX
  +wear <item>

EXAMPLES
  +wear leather jacket
  +wear riot shield

SEE ALSO: +help remove, +help wield, +help eq`,

  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    if (!arg) { u.send("Usage: +wear <item>"); return; }

    const item = await resolveCarriedItem(u, arg);
    if (!item) { u.send(`You aren't carrying anything called "${arg}".`); return; }

    const carried = Array.isArray(u.me.contents) && u.me.contents.some(
      // deno-lint-ignore no-explicit-any
      (c: any) => c?.id === item.id,
    );
    if (!carried) { u.send("You can only wear what you are carrying."); return; }

    if (!isArmor(item)) { u.send("That isn't armor or a shield."); return; }
    if (getEqMeta(item).worn) { u.send("You are already wearing that."); return; }

    await u.db.modify(item.id, "$set", { "state.worn": true });

    const itemName = u.util.displayName(item, u.me);
    const meName   = u.util.displayName(u.me, u.me);
    u.send(`You don the ${itemName}.`);
    poseRoom(u, `${meName} dons ${itemName}.`);
  },
});

addCmd({
  name: "+remove",
  pattern: /^\+remove\s+(.+)$/i,
  lock: "connected",
  category: "Equipment",
  help: `+remove <item>  -- Take off armor or a shield you are wearing.

SYNTAX
  +remove <item>

EXAMPLES
  +remove leather jacket

SEE ALSO: +help wear, +help sheathe, +help eq`,

  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    if (!arg) { u.send("Usage: +remove <item>"); return; }

    const item = await resolveCarriedItem(u, arg);
    if (!item) { u.send(`You aren't carrying anything called "${arg}".`); return; }

    if (!isArmor(item)) { u.send("That isn't armor or a shield."); return; }
    if (!getEqMeta(item).worn) { u.send("You aren't wearing that."); return; }

    await u.db.modify(item.id, "$unset", { "state.worn": "" });

    const itemName = u.util.displayName(item, u.me);
    const meName   = u.util.displayName(u.me, u.me);
    u.send(`You take off the ${itemName}.`);
    poseRoom(u, `${meName} takes off ${itemName}.`);
  },
});
