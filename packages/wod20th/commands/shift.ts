// commands/shift.ts -- +shift command for WtA form shifting.
//
// Syntax:
//   +shift                  -- show current form and modifier table.
//   +shift <form>           -- attempt to shift to <form>.
//   +shift/who              -- (staff) list nearby characters and their forms.
//
// Persistence lives here; pure mechanics live in core/forms.ts.

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findByPlayer } from "../db/charDb.ts";
import { saveChar } from "../db/charDb.ts";
import {
  FORM_LIST,
  FORM_MODIFIERS,
  defaultFormForBreed,
  shiftTo,
  type Form,
} from "../core/forms.ts";
import { emitFormChanged } from "../hooks.ts";
import { header, divider, footer } from "../core/format.ts";
import { poseRoom } from "../core/poseRoom.ts";
import { shiftedDisplayName } from "../core/displayName.ts";

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Build the static modifier table for display in `+shift` (no args). */
async function renderFormTable(currentForm: Form): Promise<string> {
  const lines: string[] = [
    header("Werewolf Forms"),
    `Current form: %ch${titleCase(currentForm)}%cn`,
    divider("Modifiers"),
    `  ${"Form".padEnd(8)} ${"Str".padStart(4)} ${"Dex".padStart(4)} ${"Sta".padStart(4)} ${"Man".padStart(4)} ${"App".padStart(4)}`,
  ];
  for (const f of FORM_LIST) {
    const m = FORM_MODIFIERS[f];
    const cell = (n: number) => (n >= 0 ? `+${n}` : `${n}`).padStart(4);
    const apparent = (f === "crinos" || f === "hispo" || f === "lupus") ? "  0*" : cell(m.Appearance);
    lines.push(
      `  ${titleCase(f).padEnd(8)} ${cell(m.Strength)} ${cell(m.Dexterity)} ${cell(m.Stamina)} ${cell(m.Manipulation)} ${apparent}`,
    );
  }
  lines.push("");
  lines.push("  * Appearance is 0 to non-Garou observers.");
  lines.push(footer());
  return lines.join("%r");
}

addCmd({
  name: "+shift",
  pattern: /^\+shift(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+shift[/switch] [<form>]  -- Shift between Werewolf forms.

  The five forms are Homid, Glabro, Crinos, Hispo, and Lupus. Each applies
  static modifiers to Strength, Dexterity, Stamina, Manipulation, and
  Appearance. Crinos, Hispo, and Lupus appear as Appearance 0 to non-Garou.

SYNTAX
  +shift              Show current form and the modifier table.
  +shift <form>       Shift to <form>.
  +shift/who          (Staff) List nearby characters and their forms.

EXAMPLES
  +shift              Show the table.
  +shift crinos       Shift to war-form.
  +shift homid        Return to human form.

SEE ALSO: +help shift, +help wod20th`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // /who -- staff listing of characters' current forms.
    if (sw === "who") {
      const isStaff = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
      if (!isStaff) { u.send("Permission denied."); return; }

      const lines: string[] = [header("Form Roster")];
      const char = await findByPlayer(u.me.id);
      if (!char) {
        lines.push("  (You have no character on file.)");
      } else if (char.splat !== "wta") {
        lines.push("  (Your character is not a Garou.)");
      } else {
        const form = (char.currentForm ?? defaultFormForBreed(char.breed)) as Form;
        const name = u.util.displayName(u.me, u.me);
        lines.push(`  ${name.padEnd(20)} ${titleCase(form)}`);
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    const char = await findByPlayer(u.me.id);
    if (!char) {
      u.send("You have no character on file.");
      return;
    }
    if (char.splat !== "wta") {
      u.send("Only Garou (WtA) characters can shift forms.");
      return;
    }

    const currentForm: Form = (char.currentForm ?? defaultFormForBreed(char.breed)) as Form;

    // No argument -- show the modifier table.
    if (!arg) {
      u.send(await renderFormTable(currentForm));
      return;
    }

    const result = shiftTo(char, arg);
    if (!result.ok) {
      u.send(result.message);
      return;
    }

    const target = arg.toLowerCase() as Form;

    char.currentForm = target;
    await saveChar(char);

    emitFormChanged({
      playerId: u.me.id,
      charId: char.id,
      from: currentForm,
      to: target,
    });

    u.send(`%cgYou shift from %ch${titleCase(currentForm)}%cn%cg to %ch${titleCase(target)}%cn%cg.%cn`);
    const loginName = u.util.displayName(u.me, u.me);
    // The pose uses the name onlookers WOULD see post-shift -- so a Garou
    // shifting into a war-form is announced by their deed name if set.
    const seenAs = shiftedDisplayName(char, loginName);
    poseRoom(u, `%cy${seenAs}%cn shifts from %ch${titleCase(currentForm)}%cn to %ch${titleCase(target)}%cn form.`);
  },
});
