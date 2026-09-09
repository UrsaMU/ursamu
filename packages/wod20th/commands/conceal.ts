// commands/conceal.ts -- +conceal / +reveal commands.
//
// Conceal: silently tuck a worn/wielded item out of sight. Sets
//          state.concealed = true. No room broadcast.
// Reveal:  clear state.concealed and pose the item back into view.
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { getEqMeta } from "../core/eq.ts";
import { poseRoom } from "../core/poseRoom.ts";

// deno-lint-ignore no-explicit-any
type AnyObj = any;

function findHeldByName(u: IUrsamuSDK, name: string): AnyObj | null {
  // deno-lint-ignore no-explicit-any
  const items: AnyObj[] = Array.isArray((u.me as any)?.contents)
    // deno-lint-ignore no-explicit-any
    ? (u.me as any).contents
    : [];
  const needle = name.toLowerCase();
  return items.find((it) =>
    typeof it?.name === "string" && it.name.toLowerCase().includes(needle)
  ) ?? null;
}

addCmd({
  name: "+conceal",
  pattern: /^\+(conceal|reveal)\s+(.+)$/i,
  lock: "connected",
  category: "Equipment",
  help: `+conceal <item>  -- Tuck a held item out of sight.
+reveal <item>   -- Produce a concealed item; others see it now.

  Concealment only matters while you are wearing or wielding an item;
  loose gear in your pockets is already out of view. Items with
  concealability "N" cannot be concealed.

SYNTAX
  +conceal <item>
  +reveal <item>

EXAMPLES
  +conceal pistol    Tuck the pistol out of sight (silent).
  +reveal pistol     Produce the pistol; the room sees it.

SEE ALSO: +help spot, +help wod20th`,

  exec: async (u: IUrsamuSDK) => {
    const verb = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg  = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    if (!arg) { u.send(`Usage: +${verb} <item>`); return; }

    const item = findHeldByName(u, arg);
    if (!item) { u.send(`You are not carrying anything called "${arg}".`); return; }

    const meta = getEqMeta(item);
    const display = typeof item.name === "string" ? item.name : "item";

    if (verb === "conceal") {
      if (meta.concealability === "N") {
        u.send("This item is too obvious to conceal.");
        return;
      }
      if (!meta.worn && !meta.wielded) {
        u.send("It is already out of sight -- conceal only matters for worn or wielded gear.");
        return;
      }
      if (meta.concealed) { u.send(`The ${display} is already concealed.`); return; }
      await u.db.modify(item.id, "$set", { "state.concealed": true });
      u.send(`%cyYou tuck the ${display} out of sight.%cn`);
      return;
    }

    // reveal
    if (!meta.concealed) { u.send(`The ${display} is not concealed.`); return; }
    await u.db.modify(item.id, "$unset", { "state.concealed": "" });
    u.send(`You produce the ${display}.`);
    const actor = u.util.displayName(u.me, u.me);
    poseRoom(u, `${actor} produces a ${display}.`);
  },
});
