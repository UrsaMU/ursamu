/**
 * +attune / +magic — magic items.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/ursamu";
import { migrateSheet } from "../stats/dnd_sheet.ts";
import {
  applyAttune,
  applyUnattune,
  attunedSlugs,
  listMagic,
  magicBySlug,
} from "../adventure/magic.ts";

addCmd({
  name: "+magic",
  pattern: /^\+magic(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+magic — List known magic item catalog.\n` +
    `+magic/info <name> — Detail.\n` +
    `+attune <item slug|name> — Attune (max 3).\n` +
    `+unattune <item>`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "info" || sw === "view") {
      const m = magicBySlug(arg);
      if (!m) {
        u.send("Unknown magic item.");
        return;
      }
      u.send(
        `%ch%cmMAGIC>>%cn ${m.name} (${m.rarity})` +
          (m.attunement ? " [attune]" : "") +
          (m.valueGp ? ` ~${m.valueGp} gp` : ""),
      );
      if (m.summary) u.send(`  ${m.summary}`);
      return;
    }

    if (!sw || sw === "list") {
      u.send("%ch%cmMAGIC>>%cn Catalog:");
      for (const m of listMagic()) {
        u.send(
          `  ${m.slug.padEnd(28)} ${m.rarity.padEnd(10)}` +
            (m.attunement ? " attune" : ""),
        );
      }
      // deno-lint-ignore no-explicit-any
      const sheet = (u.me.state as any)?.dnd
        ? migrateSheet(
          // deno-lint-ignore no-explicit-any
          (u.me.state as any).dnd,
        )
        : null;
      if (sheet) {
        const a = attunedSlugs(sheet);
        u.send(
          a.length
            ? `Attuned: ${a.join(", ")}`
            : "Attuned: (none)",
        );
      }
      return;
    }

    u.send("Switches: /list /info — also +attune / +unattune");
  },
});

addCmd({
  name: "+attune",
  pattern: /^\+attune\s+(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+attune <magic item>  — Attune (max 3).

Examples:
  +attune cloak of protection
  +unattune cloak_of_protection`,
  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    if (!arg) {
      u.send("Usage: +attune <item>");
      return;
    }
    // deno-lint-ignore no-explicit-any
    if (!(u.me.state as any)?.dnd) {
      u.send("No sheet.");
      return;
    }
    const sheet = migrateSheet(
      // deno-lint-ignore no-explicit-any
      (u.me.state as any).dnd,
    );
    // Prefer carried item with magic flag matching name
    const items = await u.db.search({ location: u.me.id });
    let slug = arg;
    for (const it of items) {
      // deno-lint-ignore no-explicit-any
      const d = (it.state as any)?.dnd;
      if (!d?.magic) continue;
      const n = (it.name || "").toLowerCase();
      if (
        n.includes(arg.toLowerCase()) ||
        String(d.magic).includes(
          arg.toLowerCase().replace(/\s+/g, "_"),
        )
      ) {
        slug = String(d.magic);
        break;
      }
    }
    const r = applyAttune(sheet, slug);
    if (!r.ok) {
      u.send(`%ch%cmATTUNE>>%cn ${r.message}`);
      return;
    }
    await u.db.modify(u.me.id, "$set", {
      "data.dnd": r.sheet,
    });
    u.send(`%ch%cmATTUNE>>%cn ${r.message}`);
  },
});

addCmd({
  name: "+unattune",
  pattern: /^\+unattune\s+(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+unattune <item>  — End attunement.`,
  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    // deno-lint-ignore no-explicit-any
    if (!(u.me.state as any)?.dnd) {
      u.send("No sheet.");
      return;
    }
    const sheet = migrateSheet(
      // deno-lint-ignore no-explicit-any
      (u.me.state as any).dnd,
    );
    const r = applyUnattune(sheet, arg);
    if (!r.ok) {
      u.send(`%ch%cmATTUNE>>%cn ${r.message}`);
      return;
    }
    await u.db.modify(u.me.id, "$set", {
      "data.dnd": r.sheet,
    });
    u.send(`%ch%cmATTUNE>>%cn ${r.message}`);
  },
});
