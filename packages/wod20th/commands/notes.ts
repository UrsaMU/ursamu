// commands/notes.ts -- +notes character background/personality notes.
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  divider,
  footer,
  header,
  WIDTH,
  clipVis,
} from "../core/format.ts";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import {
  applyNote,
  deleteNote,
  setNotePublic,
} from "../core/chargen.ts";
import type { IWoDChar } from "../core/types.ts";

addCmd({
  name: "+notes",
  pattern: /^\+notes(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Character",
  help: `+notes[/<switch>] [<args>]  — Character notes.

  Background, personality, hooks text on your sheet.
  Private by default; /public shows on +sheet.

  Full help: +help notes

Examples:
  +notes/set bg=Born in the bayou.
  +notes bg
  +notes/public bg
  +notes/del goals`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    const char = await findByPlayer(u.me.id);
    if (!char) {
      u.send(
        "No character yet. Start with %ch+chargen/start%cn first.",
      );
      return;
    }

    // -- list -----------------------------------------------------------------
    if (!sw && !arg) {
      u.send(formatNoteList(char));
      return;
    }

    // -- read one note (bare +notes <name>) -----------------------------------
    if (!sw && arg) {
      const note = (char.notes ?? []).find(
        (n) => n.name.toLowerCase() === arg.toLowerCase(),
      );
      if (!note) {
        u.send(
          `No note named %ch${arg}%cn. ` +
            `Use %ch+notes%cn to list, or ` +
            `%ch+notes/set ${arg}=<text>%cn to create.`,
        );
        return;
      }
      u.send(formatOneNote(note.name, note.text, note.isPublic));
      return;
    }

    // -- /set -----------------------------------------------------------------
    if (sw === "set") {
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) {
        u.send("Usage: +notes/set <name>=<text>");
        return;
      }
      const name = arg.slice(0, eqIdx).trim();
      const text = arg.slice(eqIdx + 1).trim();
      const result = applyNote(char, name, text);
      if (!result.ok) {
        u.send(`%cr${result.message}%cn`);
        return;
      }
      await saveChar(char);
      u.send(result.message);
      return;
    }

    // -- /del -----------------------------------------------------------------
    if (sw === "del" || sw === "clear" || sw === "delete") {
      if (!arg) {
        u.send("Usage: +notes/del <name>");
        return;
      }
      const result = deleteNote(char, arg);
      if (!result.ok) {
        u.send(`%cr${result.message}%cn`);
        return;
      }
      await saveChar(char);
      u.send(result.message);
      return;
    }

    // -- /public --------------------------------------------------------------
    if (sw === "public") {
      if (!arg) {
        u.send("Usage: +notes/public <name>");
        return;
      }
      const result = setNotePublic(char, arg, true);
      if (!result.ok) {
        u.send(`%cr${result.message}%cn`);
        return;
      }
      await saveChar(char);
      u.send(result.message);
      return;
    }

    // -- /private -------------------------------------------------------------
    if (sw === "private") {
      if (!arg) {
        u.send("Usage: +notes/private <name>");
        return;
      }
      const result = setNotePublic(char, arg, false);
      if (!result.ok) {
        u.send(`%cr${result.message}%cn`);
        return;
      }
      await saveChar(char);
      u.send(result.message);
      return;
    }

    u.send(
      `Unknown switch %ch/${sw}%cn. ` +
        `See %ch+help notes%cn ` +
        `(set, del, public, private).`,
    );
  },
});

function formatNoteList(char: IWoDChar): string {
  const notes = char.notes ?? [];
  if (notes.length === 0) {
    return [
      header(" Character Notes "),
      "  No notes yet.",
      "",
      clipVis(
        "  %ch+notes/set <name>=<text>%cn  add one",
        WIDTH,
      ),
      clipVis(
        "  e.g. %ch+notes/set bg=Born under a blood moon.%cn",
        WIDTH,
      ),
      clipVis(
        "  Then %ch+notes/public bg%cn to show on +sheet.",
        WIDTH,
      ),
      footer(),
    ].join("%r");
  }

  const lines = [header(" Character Notes ")];
  for (const n of notes) {
    const vis = n.isPublic ? "%cgpublic%cn" : "private";
    lines.push(clipVis(`  %ch${n.name}%cn  (${vis})`, WIDTH));
  }
  lines.push(divider(null));
  lines.push(clipVis(
    "  Read: %ch+notes <name>%cn   " +
      "Edit: %ch+notes/set name=text%cn",
    WIDTH,
  ));
  lines.push(footer());
  return lines.join("%r");
}

function formatOneNote(
  name: string,
  text: string,
  isPublic: boolean,
): string {
  const vis = isPublic ? "%cgpublic%cn" : "private";
  return [
    header(` Note: ${name} (${vis}) `),
    ...wrapNoteBody(text),
    footer(),
  ].join("%r");
}

function wrapNoteBody(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "  ";
  for (const w of words) {
    const next = cur === "  " ? `  ${w}` : `${cur} ${w}`;
    if (next.length > WIDTH) {
      lines.push(cur);
      cur = `  ${w}`;
    } else {
      cur = next;
    }
  }
  if (cur.trim()) lines.push(cur);
  if (lines.length === 0) lines.push("  (empty)");
  return lines;
}
