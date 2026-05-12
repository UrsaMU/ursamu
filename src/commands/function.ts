import { addCmd } from "../services/commands/index.ts";
import { send } from "../services/broadcast/index.ts";
import { userFuncs } from "../services/Database/index.ts";
import type { IUserFunc } from "../services/Database/index.ts";
import { isWizard } from "../utils/index.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

// ── @function command ─────────────────────────────────────────────────────

addCmd({
  name: "@function",
  pattern: /^@function(?:\/(list|remove))?\s*([^=\s]*)(?:\s*=\s*(.*))?/i,
  lock: "connected wizard+",
  category: "Scripting",
  help: `@function[/list|/remove] <name>[=<code>]  — Define global softcode functions.

Switches:
  /list     List all defined functions.
  /remove   Remove a function by name.

Wizard-only.  Functions are callable from softcode as name(arg0, arg1, ...).
Inside the code, %0–%9 are the arguments, %! is the calling object.

Examples:
  @function double=%0 * 2
  @function/list
  @function/remove double`,
  exec: async (u: IUrsamuSDK) => {
    const sw   = (u.cmd.args[0] ?? "").toLowerCase();
    const name = (u.cmd.args[1] ?? "").trim().toLowerCase();
    const code = (u.cmd.args[2] ?? "").trim();

    // Extra privilege check (lock may be evaluated as a string — this is authoritative).
    // Global function registration requires wizard+ to prevent admin-level code injection.
    if (!isWizard(u.me.flags)) { u.send("Permission denied. (wizard+ required)"); return; }

    // ── /list ──────────────────────────────────────────────────────────
    if (sw === "list") {
      const all = await userFuncs.find({});
      if (!all.length) {
        send([u.socketId ?? ""], "No user-defined functions registered.");
        return;
      }
      const lines = all.map(
        f => `  %ch${f.name.toUpperCase()}%cn — owner #${f.ownerId}`,
      );
      send([u.socketId ?? ""], `%chUser Functions:%cn\r\n${lines.join("\r\n")}`);
      return;
    }

    // ── /remove ────────────────────────────────────────────────────────
    if (sw === "remove") {
      if (!name) { u.send("Usage: @function/remove <name>"); return; }
      const existing = await userFuncs.findOne({ id: name });
      if (!existing) {
        send([u.socketId ?? ""], `Function '${name}' not found.`);
        return;
      }
      await userFuncs.delete({ id: name });
      send([u.socketId ?? ""], `Function '${name.toUpperCase()}' removed.`);
      return;
    }

    // ── Register / update ──────────────────────────────────────────────
    if (!name) { u.send("Usage: @function <name>=<code>"); return; }
    if (!code) { u.send("Usage: @function <name>=<code>"); return; }

    // Validate: function names must be alphanumeric + underscore, no spaces.
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
      u.send("Function name must start with a letter and contain only letters, digits, and underscores.");
      return;
    }

    const existing = await userFuncs.findOne({ id: name });
    if (existing) {
      await userFuncs.modify(
        { id: name },
        "$set",
        { code, ownerId: u.me.id } as Partial<IUserFunc>,
      );
      send([u.socketId ?? ""], `Function '${name.toUpperCase()}' updated.`);
    } else {
      await userFuncs.create({ id: name, name, code, ownerId: u.me.id });
      send([u.socketId ?? ""], `Function '${name.toUpperCase()}' registered.`);
    }
  },
});
