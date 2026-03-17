import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";
import { notes } from "./db.ts";

// ─── @note ────────────────────────────────────────────────────────────────────
//
// Usage:
//   @note <text>         — save a note
//   @note/list           — list your notes
//   @note/delete <id>    — delete a note by ID
//
// This demonstrates the most common plugin command patterns:
//   - Parsing switches (u.cmd.args[0])
//   - Parsing arguments (u.cmd.args[1])
//   - Reading / writing to a custom DBO
//   - Staff permission checks
//   - Sending output to the player (u.send)

addCmd({
  name: "@note",
  pattern: /^@note(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] || "").toLowerCase().trim();
    const arg = (u.cmd.args[1] || "").trim();

    // ── @note/list ────────────────────────────────────────────────────────
    if (sw === "list") {
      const all = await notes.find({ author: u.me.id });
      if (!all.length) {
        u.send("You have no notes.");
        return;
      }
      u.send("%ch%cyYour notes:%cn");
      for (const n of all) {
        u.send(`  [${n.id.slice(-6)}] ${n.text}`);
      }
      return;
    }

    // ── @note/delete <id> ─────────────────────────────────────────────────
    if (sw === "delete") {
      if (!arg) { u.send("Usage: @note/delete <id>"); return; }
      const note = await notes.queryOne({ id: arg });
      if (!note) { u.send(`No note with id "${arg}" found.`); return; }

      const isStaff = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
      if (note.author !== u.me.id && !isStaff) {
        u.send("Permission denied.");
        return;
      }
      await notes.delete({ id: note.id });
      u.send("Note deleted.");
      return;
    }

    // ── @note <text> ──────────────────────────────────────────────────────
    if (!arg) { u.send("Usage: @note <text>"); return; }

    const note = await notes.create({
      id:         `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      author:     u.me.id,
      authorName: u.me.name || u.me.id,
      text:       arg,
      createdAt:  Date.now(),
    });

    u.send(`Note saved [${note.id.slice(-6)}].`);
  },
});
