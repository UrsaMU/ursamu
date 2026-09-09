// commands/defend.ts -- Reactive defense declaration for combat.
//
// `+defend/<kind>` sets state.pendingDefense on your character. The next
// +attack resolved against you rolls that defense at full pool; canon
// cost is your action this turn (defender "aborts to defense"). If you
// don't declare, the engine auto-rolls your best legal defense at half
// pool when attacked.

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findByPlayer, saveChar, unsetCharFields } from "../db/charDb.ts";
import { isIncapacitated } from "../core/wounds.ts";
import type { DefenseKind } from "../core/defense.ts";

const KINDS: DefenseKind[] = ["dodge", "block", "parry"];

addCmd({
  name: "+defend",
  pattern: /^\+defend(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Combat",
  help: `+defend/<kind>  -- Declare a reactive defense for the next attack.

  Full help: +help defend

Examples:
  +help defend`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const char = await findByPlayer(u.me.id);
    if (!char) { u.send("You have no character on file."); return; }
    if (isIncapacitated(char)) { u.send("You are incapacitated and cannot defend."); return; }

    if (sw === "clear") {
      if (!char.pendingDefense) { u.send("You have no declared defense."); return; }
      await unsetCharFields(char.id, ["pendingDefense"]);
      u.send("%cyDeclared defense cleared.%cn");
      return;
    }

    if (!sw) {
      if (!char.pendingDefense) {
        u.send("You have no declared defense. Without one, an attack on you is unopposed.");
        return;
      }
      u.send(`%cyDeclared defense:%cn ${char.pendingDefense.kind}`);
      return;
    }

    if (!KINDS.includes(sw as DefenseKind)) {
      u.send(`Unknown defense: /${sw}. Use /dodge, /block, /parry, or /clear.`);
      return;
    }

    char.pendingDefense = { kind: sw as DefenseKind, setAt: Date.now() };
    await saveChar(char);
    u.send(`%cgYou ready a ${sw}.%cn`);
  },
});
