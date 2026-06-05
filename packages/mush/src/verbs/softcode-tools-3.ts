import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";
import { DBO } from "@ursamu/core";

// ── userFuncs DBO ─────────────────────────────────────────────────────────

interface IUserFunc {
  id: string;
  name: string;
  code: string;
  ownerId: string;
}

const userFuncs = new DBO<IUserFunc>("server.userfuncs");

function isWizard(flags: Set<string> | string): boolean {
  const s = typeof flags === "string" ? flags : [...flags].join(" ");
  return s.includes("wizard") || s.includes("superuser");
}

// ── @function ─────────────────────────────────────────────────────────────

addCmd({
  name: "@function",
  pattern: /^@function(?:\/(list|remove))?\s*([^=\s]*)(?:\s*=\s*(.*))?/i,
  lock: "connected wizard+",
  category: "Scripting",
  help: `@function[/list|/remove] <name>[=<code>]  — Define global softcode functions.

Switches:
  /list     List all defined functions.
  /remove   Remove a function by name.

Wizard-only. Functions are callable from softcode as name(arg0, arg1, ...).

Examples:
  @function double=%0 * 2
  @function/list
  @function/remove double`,
  exec: async (u: IUrsamuSDK) => {
    const sw   = (u.cmd.args[0] ?? "").toLowerCase();
    const name = (u.cmd.args[1] ?? "").trim().toLowerCase();
    const code = (u.cmd.args[2] ?? "").trim();

    if (!isWizard(u.me.flags)) { u.send("Permission denied. (wizard+ required)"); return; }

    if (sw === "list") {
      const all = await userFuncs.find({});
      if (!all.length) { u.send("No user-defined functions registered."); return; }
      const lines = all.map((f) => `  %ch${f.name.toUpperCase()}%cn — owner #${f.ownerId}`);
      u.send(`%chUser Functions:%cn\r\n${lines.join("\r\n")}`);
      return;
    }

    if (sw === "remove") {
      if (!name) { u.send("Usage: @function/remove <name>"); return; }
      const existing = await userFuncs.findOne({ id: name });
      if (!existing) { u.send(`Function '${name}' not found.`); return; }
      await userFuncs.delete({ id: name });
      u.send(`Function '${name.toUpperCase()}' removed.`);
      return;
    }

    if (!name) { u.send("Usage: @function <name>=<code>"); return; }
    if (!code) { u.send("Usage: @function <name>=<code>"); return; }
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
      u.send("Function name must start with a letter and contain only letters, digits, and underscores.");
      return;
    }

    const existing = await userFuncs.findOne({ id: name });
    if (existing) {
      await userFuncs.modify({ id: name }, "$set", { code, ownerId: u.me.id } as Partial<IUserFunc>);
      u.send(`Function '${name.toUpperCase()}' updated.`);
    } else {
      await userFuncs.create({ id: name, name, code, ownerId: u.me.id });
      u.send(`Function '${name.toUpperCase()}' registered.`);
    }
  },
});

// ── & (attrCommands) ─────────────────────────────────────────────────────

addCmd({
  name: "&",
  pattern: /^&(\S+)\s+(\S+)\s*=\s*(.*)?$/is,
  lock: "connected",
  category: "Building",
  help: `&<attribute>[/softcode] <target>=<value>  — Set an attribute on an object.
&<attribute> <target>=                     — Clear an attribute.

The /softcode type hint marks the attribute as evaluable softcode.

Examples:
  &short-desc me=A tall figure in a dark coat.
  &ahear/softcode #5=[say(hello)]`,
  exec: async (u: IUrsamuSDK) => {
    const attrPart  = u.cmd.args[0] || "";
    const targetRef = (u.cmd.args[1] || "").trim();
    const value     = u.cmd.args[2] ?? "";

    const slashIdx = attrPart.indexOf("/");
    const attrName = (slashIdx === -1 ? attrPart : attrPart.slice(0, slashIdx)).toUpperCase();
    const typeHint = slashIdx !== -1 && attrPart.slice(slashIdx + 1).toLowerCase() === "softcode"
      ? "softcode"
      : "attribute";

    if (!attrName) { u.send("Usage: &<attribute> <object>=<value>"); return; }

    const target = await u.util.target(u.me, targetRef, true);
    if (!target) { u.send(`I can't find "${targetRef}".`); return; }
    if (!await u.canEdit(u.me, target)) { u.send("You can't edit that."); return; }

    const displayName = target.name || target.id;

    if (!value) {
      const removed = await u.attr.clear(target.id, attrName);
      if (!removed) u.send(`${displayName} doesn't have attribute %ch${attrName}%cn.`);
      else u.send(`${displayName}'s attribute %ch${attrName}%cn removed.`);
      return;
    }

    await u.attr.set(target.id, attrName, value, typeHint);
    u.send(`${displayName}'s attribute %ch${attrName}%cn set.`);
  },
});
