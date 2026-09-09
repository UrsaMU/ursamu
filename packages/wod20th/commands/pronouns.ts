// commands/pronouns.ts -- show + set per-character pronouns.

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import {
  DEFAULT_PRONOUNS,
  PRONOUN_PRESETS,
  pronounsFor,
} from "../core/pronouns.ts";
import { divider, footer, header } from "../core/format.ts";

addCmd({
  name: "+pronouns",
  pattern: /^\+pronouns(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "General",
  help: `+pronouns[/switch] [<args>]  -- Set your character's pronouns.

  Full help: +help pronouns

Examples:
  +help pronouns`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    const char = await findByPlayer(u.me.id);
    if (!char) { u.send("You have no character on file."); return; }

    if (!sw) {
      const p = pronounsFor(char);
      const lines: string[] = [
        header("Pronouns"),
        `  Subject     (%s/%S):  ${p.subject}`,
        `  Object      (%o/%O):  ${p.object}`,
        `  Possessive  (%p/%P):  ${p.possessive}  ("${p.possessive} talons")`,
        `  Absolute    (%a/%A):  ${p.absolute}  ("the talons are ${p.absolute}")`,
        footer(),
      ];
      u.send(lines.join("%r"));
      return;
    }

    if (sw === "clear") {
      char.pronouns = { ...DEFAULT_PRONOUNS };
      await saveChar(char);
      u.send("%cyPronouns reset to they/them/their/theirs.%cn");
      return;
    }

    if (sw === "set") {
      if (!arg) { u.send("Usage: +pronouns/set <preset> | <s>/<o>/<p>/<a>"); return; }
      // Preset path.
      const presetKey = arg.toLowerCase();
      if (PRONOUN_PRESETS[presetKey]) {
        char.pronouns = { ...PRONOUN_PRESETS[presetKey] };
        await saveChar(char);
        const p = char.pronouns;
        u.send(`%cgPronouns set to ${p.subject}/${p.object}/${p.possessive}/${p.absolute}.%cn`);
        return;
      }
      // Custom four-part path.
      const parts = arg.split("/").map((s) => s.trim()).filter(Boolean);
      if (parts.length !== 4) {
        u.send("Custom pronouns must be exactly 4 parts: <subject>/<object>/<possessive>/<absolute>.");
        return;
      }
      for (const p of parts) {
        if (!/^[a-z]+$/i.test(p) || p.length > 20) {
          u.send(`Bad pronoun part: "${p}". Letters only, <=20 chars.`);
          return;
        }
      }
      char.pronouns = {
        subject:    parts[0].toLowerCase(),
        object:     parts[1].toLowerCase(),
        possessive: parts[2].toLowerCase(),
        absolute:   parts[3].toLowerCase(),
      };
      await saveChar(char);
      u.send(`%cgPronouns set to ${parts.join("/").toLowerCase()}.%cn`);
      return;
    }

    u.send(`Unknown switch: /${sw}. See +help pronouns.`);
  },
});
