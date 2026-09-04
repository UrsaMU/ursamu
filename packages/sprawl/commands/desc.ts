/** +desc — d66/custom base; gear names always woven live. */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import {
  footer,
  ARR,
  ERR,
  OK,
  header,
  dim,
  val,
  ylw,
} from "./chrome.ts";
import {
  getChar,
  getInventory,
  saveChar,
} from "../engine/sheet-io.ts";
import type { ISprawlChar } from "../db/schemas.ts";
import {
  ACCESSORIES,
  AFFECTATIONS,
  find,
} from "../engine/catalog.ts";
import {
  composeBaseDesc,
  frameStreetLook,
  publishLook,
  resolveLook,
  rollAccessory,
  rollAffectation,
} from "../engine/desc.ts";
import { pronounsOf } from "../engine/pronouns.ts";

async function showLook(u: IUrsamuSDK, title: string): Promise<void> {
  const c = getChar(u.me);
  if (!c) return;
  const { items } = await getInventory(u, u.me);
  // resolveLook paints moniker into prose; badge uses plain name.
  const text = (await resolveLook(u, u.me, c, items)) ||
    dim("No look yet. Try +desc/roll.");
  const { plain } = await import("./chrome.ts");
  const countName = plain(String(c.name || "GOON")).trim() ||
    "GOON";
  u.send(
    frameStreetLook(text, { name: countName })
      .split("\n").join("\r\n"),
  );
  void title;
}

async function rebuildBase(
  u: IUrsamuSDK,
  c: ISprawlChar,
  opts: { rerollOpener?: boolean } = {},
): Promise<string> {
  const { items } = await getInventory(u, u.me);
  // Never bake moniker/gradient codes into stored @desc prose.
  const { plain } = await import("./chrome.ts");
  const name = plain(String(c.name || "Goon")).trim() || "Goon";
  const p = await pronounsOf(u, u.me);
  const draft = opts.rerollOpener
    ? { ...c, lookOpener: undefined, baseDesc: "" }
    : c;
  const composed = composeBaseDesc(name, draft, p);
  return publishLook(u, {
    base: composed.text,
    openerSlug: composed.openerSlug,
    items,
  });
}

/** Persist empty base — no table re-roll. */
async function wipeLookBase(
  u: IUrsamuSDK,
  c: ISprawlChar,
): Promise<ISprawlChar> {
  const next: ISprawlChar = {
    ...c,
    lookDesc: "",
    baseDesc: "",
    lookOpener: undefined,
  };
  await saveChar(u, next);
  u.me.state = {
    ...u.me.state,
    sprawl: next,
    description: "",
  };
  await u.db.modify(u.me.id, "$set", {
    "data.description": "",
    "state.sprawl": next,
  });
  return next;
}

function isClearArg(arg: string): boolean {
  const a = arg.toLowerCase();
  return a === "clear" || a === "reset" || a === "none" ||
    a === "wipe" || a === "all";
}

/** Parse remove target: "remove X", "-X", "drop X", bare name. */
function removeTarget(arg: string): string | null {
  const a = arg.trim();
  if (!a) return null;
  const m = a.match(/^(?:remove|drop|rm|un|-)\s+(.+)$/i);
  if (m) return m[1].trim();
  if (a.startsWith("-") && a.length > 1) return a.slice(1).trim();
  return null;
}

function listStyles(c: ISprawlChar): string[] {
  const lines = [header("LOOK · STYLES")];
  const aff = c.affectations ?? [];
  const acc = c.accessories ?? [];
  lines.push(`  ${ylw("Affectations")}`);
  if (!aff.length) lines.push(`  ${dim("none")}`);
  else {
    aff.forEach((n: string, i: number) => {
      lines.push(`  ${dim(String(i + 1) + ".")} ${val(n)}`);
    });
  }
  lines.push(`  ${ylw("Accessories")}`);
  if (!acc.length) lines.push(`  ${dim("none")}`);
  else {
    for (const slug of acc) {
      const row = find("accessory", slug) ??
        ACCESSORIES.find((r) => r.slug === slug);
      const label = row ? String(row.name) : slug;
      lines.push(
        `  ${dim(slug)} ${val(label)}`,
      );
    }
  }
  lines.push(
    `  ${dim("Undo:")} ${val("+desc/affect remove <name>")}`,
  );
  lines.push(
    `  ${dim("     ")} ${val("+desc/accessory remove <slug>")}`,
  );
  lines.push(
    `  ${dim("Full wipe:")} ${val("+desc/clear")}`,
  );
  lines.push(footer());
  return lines;
}

function dropAffectation(
  list: string[],
  q: string,
): { next: string[]; removed: string } | null {
  const n = q.toLowerCase().trim();
  if (!n) return null;
  if (/^\d+$/.test(n)) {
    const i = Number(n) - 1;
    if (i < 0 || i >= list.length) return null;
    const removed = list[i];
    return {
      next: list.filter((_, j) => j !== i),
      removed,
    };
  }
  const i = list.findIndex((x) =>
    x.toLowerCase() === n ||
    x.toLowerCase().includes(n)
  );
  if (i < 0) return null;
  return {
    next: list.filter((_, j) => j !== i),
    removed: list[i],
  };
}

function dropAccessory(
  list: string[],
  q: string,
): { next: string[]; removed: string } | null {
  const n = q.toLowerCase().trim();
  if (!n) return null;
  if (/^\d+$/.test(n)) {
    const i = Number(n) - 1;
    if (i < 0 || i >= list.length) return null;
    const removed = list[i];
    return {
      next: list.filter((_, j) => j !== i),
      removed,
    };
  }
  const i = list.findIndex((slug) => {
    if (slug.toLowerCase() === n || slug.includes(n)) {
      return true;
    }
    const row = find("accessory", slug) ??
      ACCESSORIES.find((r) => r.slug === slug);
    const name = String(row?.name ?? "").toLowerCase();
    return name === n || name.includes(n);
  });
  if (i < 0) return null;
  return {
    next: list.filter((_, j) => j !== i),
    removed: list[i],
  };
}

addCmd({
  name: "+desc",
  pattern: /^\+desc(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+desc[/<switch>] [args]  — Cyberpunk street look.

Base body is @desc (me DESCRIPTION). Worn/wielded gear
weaves in live.

Switches:
  (none)                 Show look
  /roll                  Roll style + accent + base
  /gen                   Rebuild base from current styles
  /list                  Styles on your sheet
  /affect [roll|slug]    Add style
  /affect remove <name>  Undo one style (# or name)
  /affect clear          Drop all styles
  /accessory …           Same for accents
  /set <text>            Custom base (@desc me=)
  /clear                 Wipe base + all styles

Examples:
  +desc/roll
  +desc/list
  +desc/affect remove NeonPunk
  +desc/accessory remove 1
  +desc/clear`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    let c = getChar(u.me);
    if (!c || c.chargenStatus === "none") {
      u.send(`${ARR}No sheet. ${val("+chargen")} first.`);
      return;
    }

    if (!sw) {
      await showLook(u, "LOOK");
      return;
    }

    if (sw === "list" || sw === "styles") {
      u.send(listStyles(c).join("\r\n"));
      return;
    }

    if (sw === "set") {
      if (!arg || arg.length > 600) {
        u.send(`${ERR}Need text (max 600).`);
        return;
      }
      const { items } = await getInventory(u, u.me);
      await publishLook(u, { base: arg, items });
      u.send(
        `${OK}DESCRIPTION set` +
          ` ${dim("(gear still live)")}.`,
      );
      await showLook(u, "LOOK");
      return;
    }

    if (sw === "clear" || sw === "wipe" || sw === "reset") {
      c = {
        ...c,
        affectations: [],
        accessories: [],
        lookDesc: "",
        baseDesc: "",
        lookOpener: undefined,
      };
      await wipeLookBase(u, c);
      u.send(
        `${OK}Look cleared` +
          ` ${dim("(styles + base gone)")}.` +
          ` ${val("+desc/roll")} to start over.`,
      );
      return;
    }

    if (
      sw === "affect" || sw === "affectation" ||
      sw === "unaffect"
    ) {
      // /unaffect <x>  or  /affect remove <x>  or  /affect clear
      const forceRm = sw === "unaffect";
      const rm = forceRm
        ? (arg || null)
        : isClearArg(arg)
        ? null
        : removeTarget(arg);

      if (isClearArg(arg) && !forceRm) {
        c = { ...c, affectations: [] };
        await saveChar(u, c);
        u.me.state = { ...u.me.state, sprawl: c };
        if (c.lookOpener || (c.baseDesc ?? "").trim()) {
          await rebuildBase(u, c);
        }
        u.send(`${OK}All affectations cleared.`);
        return;
      }

      if (rm != null || forceRm) {
        const q = forceRm ? arg : (rm ?? "");
        if (!q) {
          u.send(
            `${ERR}Usage: ${val("+desc/affect remove <name|#>")}`,
          );
          return;
        }
        const hit = dropAffectation(c.affectations, q);
        if (!hit) {
          u.send(
            `${ERR}No style matched ${val(q)}. ` +
              `${val("+desc/list")}`,
          );
          return;
        }
        c = { ...c, affectations: hit.next };
        await saveChar(u, c);
        u.me.state = { ...u.me.state, sprawl: c };
        if (c.lookOpener || (c.baseDesc ?? "").trim()) {
          await rebuildBase(u, c);
        }
        u.send(`${OK}Removed style ${val(hit.removed)}.`);
        return;
      }

      if (arg === "list") {
        u.send(listStyles(c).join("\r\n"));
        return;
      }

      let name = "";
      if (!arg || arg === "roll") {
        const hit = rollAffectation(c.affectations);
        if (!hit) {
          u.send(`${ERR}Could not roll affectation.`);
          return;
        }
        name = hit.name;
      } else {
        const row = find("affectation", arg) ??
          AFFECTATIONS.find((a) =>
            String(a.name).toLowerCase().includes(
              arg.toLowerCase(),
            )
          );
        if (!row) {
          u.send(
            `${ERR}Unknown affectation. ` +
              `${dim("remove <name> · clear · roll")}`,
          );
          return;
        }
        name = String(row.name);
      }
      if (c.affectations.includes(name)) {
        u.send(`${ARR}Already have that style.`);
        return;
      }
      c = {
        ...c,
        affectations: [...c.affectations, name],
      };
      await saveChar(u, c);
      u.me.state = { ...u.me.state, sprawl: c };
      u.send(`${OK}Style ${val(name)}`);
      await rebuildBase(u, c);
      return;
    }

    if (
      sw === "accessory" || sw === "acc" ||
      sw === "unaccessory" || sw === "unacc"
    ) {
      const forceRm = sw === "unaccessory" || sw === "unacc";
      const have = c.accessories ?? [];
      const rm = forceRm
        ? (arg || null)
        : isClearArg(arg)
        ? null
        : removeTarget(arg);

      if (isClearArg(arg) && !forceRm) {
        c = { ...c, accessories: [] };
        await saveChar(u, c);
        u.me.state = { ...u.me.state, sprawl: c };
        if (c.lookOpener || (c.baseDesc ?? "").trim()) {
          await rebuildBase(u, c);
        }
        u.send(`${OK}All accessories cleared.`);
        return;
      }

      if (rm != null || forceRm) {
        const q = forceRm ? arg : (rm ?? "");
        if (!q) {
          u.send(
            `${ERR}Usage: ` +
              `${val("+desc/accessory remove <slug|#>")}`,
          );
          return;
        }
        const hit = dropAccessory(have, q);
        if (!hit) {
          u.send(
            `${ERR}No accent matched ${val(q)}. ` +
              `${val("+desc/list")}`,
          );
          return;
        }
        c = { ...c, accessories: hit.next };
        await saveChar(u, c);
        u.me.state = { ...u.me.state, sprawl: c };
        if (c.lookOpener || (c.baseDesc ?? "").trim()) {
          await rebuildBase(u, c);
        }
        const row = find("accessory", hit.removed);
        u.send(
          `${OK}Removed accent ` +
            `${val(String(row?.name ?? hit.removed))}.`,
        );
        return;
      }

      if (arg === "list") {
        u.send(listStyles(c).join("\r\n"));
        return;
      }

      let slug = "";
      let name = "";
      if (!arg || arg === "roll") {
        const hit = rollAccessory(have);
        if (!hit) {
          u.send(`${ERR}Could not roll accessory.`);
          return;
        }
        slug = hit.slug;
        name = hit.name;
      } else {
        const row = find("accessory", arg) ??
          ACCESSORIES.find((a) =>
            String(a.name).toLowerCase().includes(
              arg.toLowerCase(),
            ) || a.slug.includes(arg.toLowerCase())
          );
        if (!row) {
          u.send(
            `${ERR}Unknown accessory. ` +
              `${dim("remove <slug> · clear · roll")}`,
          );
          return;
        }
        slug = row.slug;
        name = String(row.name);
      }
      if (have.includes(slug)) {
        u.send(`${ARR}Already have that accent.`);
        return;
      }
      c = {
        ...c,
        accessories: [...have, slug],
      };
      await saveChar(u, c);
      u.me.state = { ...u.me.state, sprawl: c };
      u.send(`${OK}Accent ${val(name)}`);
      await rebuildBase(u, c);
      return;
    }

    if (sw === "roll") {
      const aff = rollAffectation(c.affectations);
      const acc = rollAccessory(c.accessories ?? []);
      const affectations = [...c.affectations];
      const accessories = [...(c.accessories ?? [])];
      const notes: string[] = [];
      if (aff) {
        affectations.push(aff.name);
        notes.push(`style ${aff.name}`);
      }
      if (acc) {
        accessories.push(acc.slug);
        notes.push(`accent ${acc.name}`);
      }
      c = { ...c, affectations, accessories };
      await saveChar(u, c);
      u.me.state = { ...u.me.state, sprawl: c };
      await rebuildBase(u, c, { rerollOpener: true });
      u.send(
        [
          header("LOOK · ROLL"),
          ...(notes.length
            ? notes.map((n) => `  ${ylw(n)}`)
            : [`  ${dim("tables already full")}`]),
          footer(),
        ].join("\r\n"),
      );
      await showLook(u, "LOOK");
      return;
    }

    if (sw === "gen" || sw === "generate" || sw === "refresh") {
      c = { ...c };
      await saveChar(u, c);
      u.me.state = { ...u.me.state, sprawl: c };
      await rebuildBase(u, c, { rerollOpener: true });
      await showLook(u, "LOOK · GEN");
      return;
    }

    u.send(
      `${ERR}Switches: /list /roll /gen /affect /accessory` +
        ` /set /clear`,
    );
  },
});
