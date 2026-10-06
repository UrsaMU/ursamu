/** +chargen — Cinematic Unisystem character generation. */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { charType } from "../src/data.ts";
import { checkRequired } from "../src/validation.ts";
import { formatTypes } from "../src/tables.ts";
import { handleStaff } from "./staff.ts";
import {
  blankChar,
  readChar,
  type CharTypeSlug,
  type ICinChar,
} from "../src/types.ts";

export async function saveChar(
  u: IUrsamuSDK,
  c: ICinChar,
): Promise<void> {
  await u.db.modify(u.me.id, "$set", { "state.cinematic": c });
}

export function buildChargenCmd() {
  return addCmd({
    name: "+chargen",
    pattern: /^\+chargen(?:\/(\S+))?(?:\s+(.*))?$/i,
    lock: "connected",
    category: "Cinematic",
    help: `+chargen[/<switch>] [<args>]  — Cinematic Unisystem chargen.

Switches:
  /start            Begin a new cast member (resets draft).
  /type <slug>      Set type: whitehat, hero, experienced.
  /submit           Submit for staff approval.
  /approve <player> Approve a submitted sheet (admin+).
  /reject <p>=<n>   Return for revision (admin+).
  /reset            Wipe the character.

Examples:
  +chargen/start
  +chargen/type hero
  +chargen/submit
  +chargen/reject Bob=skills over budget`,
    exec: async (u) => {
      const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
      const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
      let c = readChar(u.me.state);
      if (sw === "start") {
        c = blankChar();
        c.status = "draft";
        await saveChar(u, c);
        u.send(
          "Chargen started. Set your type with " +
            `%ch+chargen/type <whitehat|hero|experienced>%cn.`,
        );
        return;
      }
      if (sw === "type") {
        const t = charType(arg.toLowerCase());
        if (!t) {
          u.send(`%crUnknown type%cn. ${formatTypes()}`);
          return;
        }
        c.type = t.slug as CharTypeSlug;
        c.dramaPoints = t.dramaPoints;
        c.status = "draft";
        await saveChar(u, c);
        u.send(
          `Type set: %cy${t.name}%cn ` +
            `(${t.attrPoints} attr, ${t.qualityPoints} qual, ` +
            `${t.skillPoints} skill, ${t.dramaPoints} drama).`,
        );
        return;
      }
      if (sw === "submit") {
        if (c.status === "approved") {
          u.send("Character is locked.");
          return;
        }
        const missing = checkRequired(c);
        if (missing.length) {
          u.send(
            `%crCannot submit%cn — missing: ` + missing.join("; "),
          );
          return;
        }
        c.status = "submitted";
        await saveChar(u, c);
        u.send("Character submitted for approval.");
        return;
      }
      if (sw === "approve" || sw === "reject") {
        await handleStaff(u, sw, arg);
        return;
      }
      if (sw === "reset") {
        await u.db.modify(u.me.id, "$unset", {
          "state.cinematic": "",
        });
        u.send("Character wiped.");
        return;
      }
      u.send(
        c.status === "none"
          ? "No character. Use %ch+chargen/start%cn."
          : `%ch+chargen%cn status: ${c.status}`,
      );
    },
  });
}
