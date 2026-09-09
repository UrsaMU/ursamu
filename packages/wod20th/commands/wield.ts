// commands/wield.ts -- +wield and +sheathe for weapons.
//
// Sets/unsets item.state.wielded on weapons in the actor's contents.
// V1 limit: at most 2 wielded weapons concurrently.

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { isWeapon, getEqMeta, wieldedWeapons } from "../core/eq.ts";
import { poseRoom } from "../core/poseRoom.ts";

const MAX_WIELDED = 2;

// deno-lint-ignore no-explicit-any
function findInContents(holder: any, q: string): any | undefined {
  // deno-lint-ignore no-explicit-any
  const items: any[] = Array.isArray(holder?.contents) ? holder.contents : [];
  const ql = q.toLowerCase();
  for (const it of items) {
    const raw = String(it?.state?.name ?? it?.name ?? "");
    const first = raw.split(";")[0]?.trim().toLowerCase();
    if (first === ql || raw.toLowerCase() === ql) return it;
  }
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
  return await u.util.target(u.me, arg, true);
}

addCmd({
  name: "+wield",
  pattern: /^\+wield\s+(.+)$/i,
  lock: "connected",
  category: "Equipment",
  help: `+wield <item>  -- Ready a weapon you are carrying for combat.

  You may wield at most two weapons at once.

SYNTAX
  +wield <item>

EXAMPLES
  +wield sword
  +wield silver klaive

SEE ALSO: +help sheathe, +help wear, +help eq`,

  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    if (!arg) { u.send("Usage: +wield <item>"); return; }

    const item = await resolveCarriedItem(u, arg);
    if (!item) { u.send(`You aren't carrying anything called "${arg}".`); return; }

    const carried = Array.isArray(u.me.contents) && u.me.contents.some(
      // deno-lint-ignore no-explicit-any
      (c: any) => c?.id === item.id,
    );
    if (!carried) { u.send("You can only wield what you are carrying."); return; }

    if (!isWeapon(item)) { u.send("That isn't a weapon."); return; }
    if (getEqMeta(item).wielded) { u.send("You are already wielding that."); return; }

    const current = wieldedWeapons(u.me);
    if (current.length >= MAX_WIELDED) {
      u.send(`You are already wielding ${MAX_WIELDED} weapons. Sheathe one first.`);
      return;
    }

    await u.db.modify(item.id, "$set", { "state.wielded": true });

    const itemName = u.util.displayName(item, u.me);
    const meName   = u.util.displayName(u.me, u.me);
    u.send(`You ready the ${itemName}.`);
    poseRoom(u, `${meName} readies ${itemName}.`);
  },
});

addCmd({
  name: "+sheathe",
  pattern: /^\+sheathe\s+(.+)$/i,
  lock: "connected",
  category: "Equipment",
  help: `+sheathe <item>  -- Put away a weapon you are wielding.

SYNTAX
  +sheathe <item>

EXAMPLES
  +sheathe sword

SEE ALSO: +help wield, +help remove, +help eq`,

  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    if (!arg) { u.send("Usage: +sheathe <item>"); return; }

    const item = await resolveCarriedItem(u, arg);
    if (!item) { u.send(`You aren't carrying anything called "${arg}".`); return; }

    if (!isWeapon(item)) { u.send("That isn't a weapon."); return; }
    if (!getEqMeta(item).wielded) { u.send("You aren't wielding that."); return; }

    await u.db.modify(item.id, "$unset", { "state.wielded": "" });

    const itemName = u.util.displayName(item, u.me);
    const meName   = u.util.displayName(u.me, u.me);
    u.send(`You sheathe the ${itemName}.`);
    poseRoom(u, `${meName} sheathes their ${itemName}.`);
  },
});
