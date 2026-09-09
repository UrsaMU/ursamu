// commands/eq.ts -- @eq <item>=<key=val>,... builder for equipment metadata.
//
// Sets equipment fields on an item the actor can edit. Storage lives in
// item.state.<field> per the eq state contract (see core/eq.ts).
//
// Examples:
//   @eq sword=kind=weapon,weaponType=melee,damage=3,damageType=L
//   @eq leather jacket=kind=armor,armorRating=1,concealability=J
//   @eq sword=damage=4                                 (partial update)
//   @eq sword/clear                                    (delete eq fields)

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { footer, frame, header } from "../core/format.ts";
import {
  captureEqTemplate,
  EQ_FIELDS,
  EQ_KINDS,
  WEAPON_TYPES,
  DAMAGE_TYPES,
  CONCEALABILITIES,
  TEMPLATE_FIELDS,
  type IEqMeta,
} from "../core/eq.ts";
import {
  createEqTemplate,
  deleteEqTemplate,
  findAllEqTemplates,
  findEqTemplateByName,
  saveEqTemplate,
} from "../db/eqTemplateDb.ts";

function parseBool(v: string): boolean | null {
  const s = v.toLowerCase().trim();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return null;
}

function parseIntNonNeg(v: string): number | null {
  if (!/^\d+$/.test(v.trim())) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// -- Template helpers -------------------------------------------------------

async function listTemplateLines(): Promise<string> {
  const all = await findAllEqTemplates();
  if (!all.length) {
    return "No eq templates yet. Use @eq/copy <item>=<template> to create one.";
  }
  const lines: string[] = [];
  for (const t of all) {
    const nameCol = t.name.padEnd(20);
    const kinds = t.payload.eq?.kind ? ` (${t.payload.eq.kind})` : "";
    const dmg = t.payload.eq?.damage != null ? ` ${t.payload.eq.damage}${t.payload.eq.damageType ?? "L"}` : "";
    lines.push(`    %cg>%cn %ch${nameCol}%cn${kinds}${dmg}`);
  }
  return frame(" Stored Equipment Templates ", lines);
}

async function handleEqTemplate(
  u: IUrsamuSDK,
  sw: string,
  itemArg: string,
  valueArg: string,
): Promise<void> {
  if (sw === "template") {
    const rest = itemArg.trim();

    // @eq/template  (bare) or @eq/template list
    if (rest === "" || /^list$/i.test(rest)) {
      u.send(await listTemplateLines());
      return;
    }

    // @eq/template/delete <name>   (slash or space forms)
    const delMatch = rest.match(/^(?:delete|\/delete)\s+(.+)$/i);
    if (delMatch) {
      const del = await findEqTemplateByName(delMatch[1].trim());
      if (!del) { u.send(`%crNo template named "${delMatch[1].trim()}".%cn`); return; }
      await deleteEqTemplate(del.id);
      u.send(`%cyTemplate "${del.name}" deleted.%cn`);
      return;
    }

    // @eq/template <name>  --  show one template
    const tpl = await findEqTemplateByName(rest.trim());
    if (tpl) {
      const out = [
        header(` ${tpl.name} `),
        "",
      ];
      const fields: string[] = [];
      for (const f of TEMPLATE_FIELDS) {
        const v = tpl.payload.eq?.[f as keyof IEqMeta];
        if (v !== undefined && v !== null && v !== "") fields.push(`  ${f}: ${v}`);
      }
      if (tpl.payload.name) fields.push(`  name: ${tpl.payload.name}`);
      if (tpl.payload.desc) fields.push(`  desc: ${tpl.payload.desc}`);
      if (tpl.payload.verbs) {
        for (const [k, v] of Object.entries(tpl.payload.verbs)) fields.push(`  ${k.toLowerCase()}: ${v}`);
      }
      out.push(...(fields.length ? fields : ["  (no fields)"]));
      out.push(footer());
      u.send(out.join("%r"));
      return;
    }

    u.send(`%crUnknown template "${rest}". Try @eq/template list, @eq/template delete <name>.%cn`);
    return;
  }

  // -- @eq/copy <item>=<template> ------------------------------------------
  if (sw === "copy") {
    if (!itemArg || !valueArg) { u.send("Usage: @eq/copy <item>=<template>"); return; }
    const src = await u.util.target(u.me, itemArg, true);
    if (!src) { u.send(`Item not found: ${itemArg}`); return; }
    if (!(await u.canEdit(u.me, src))) { u.send("Permission denied."); return; }

    const payload = captureEqTemplate(src);
    const existing = await findEqTemplateByName(valueArg.trim());
    if (existing) {
      existing.payload = payload;
      await saveEqTemplate(existing);
      u.send(`%cgTemplate "${existing.name}" updated from ${u.util.displayName(src, u.me)}.%cn`);
    } else {
      await createEqTemplate(valueArg.trim(), payload);
      u.send(`%cgTemplate "${valueArg}" created from ${u.util.displayName(src, u.me)}.%cn`);
    }
    return;
  }

  // -- @eq/give <item>=<template> ------------------------------------------
  if (sw === "give" || sw === "spawn") {
    const isSpawn = sw === "spawn";
    if (!itemArg || !valueArg) { u.send(isSpawn ? "Usage: @eq/new <template>=<new item name>" : "Usage: @eq/give <item>=<template>"); return; }
    // spawn: itemArg = template, valueArg = new item name
    // give:   itemArg = target item, valueArg = template
    const tplName = isSpawn ? itemArg : valueArg;
    const tpl = await findEqTemplateByName(tplName.trim());
    if (!tpl) { u.send(`%crNo template named "${tplName}". Use @eq/copy to create one.%cn`); return; }

    let target;
    if (isSpawn) {
      // Create a brand-new thing in the actor's inventory.
      const created = await u.db.create({
        name: valueArg.trim(),
        flags: new Set(["thing"]),
        location: u.me.id,
        state: {},
        contents: [],
      });
      target = created;
    } else {
      target = await u.util.target(u.me, itemArg, true);
      if (!target) { u.send(`Item not found: ${itemArg}`); return; }
      if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }
    }

    const setOp: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(tpl.payload.eq ?? {})) setOp[`state.${k}`] = v;
    if (tpl.payload.name) setOp.name = tpl.payload.name;
    if (tpl.payload.desc) setOp["state.description"] = tpl.payload.desc;
    if (tpl.payload.verbs) {
      // deno-lint-ignore no-explicit-any
      const existing: Array<{ name: string; value: unknown }> = Array.isArray((target as any)?.state?.attributes)
        // deno-lint-ignore no-explicit-any
        ? (target as any).state.attributes.slice()
        : [];
      for (const [k, v] of Object.entries(tpl.payload.verbs)) {
        const upper = k.toUpperCase();
        const filtered = existing.filter((a) => (a?.name ?? "").toUpperCase() !== upper);
        filtered.push({ name: upper, value: v });
        existing.length = 0;
        existing.push(...filtered);
      }
      setOp["state.attributes"] = existing;
    }
    if (Object.keys(setOp).length) await u.db.modify(target.id, "$set", setOp);
    u.send(`%cgApplied template "${tpl.name}" to ${u.util.displayName(target, u.me)}.%cn`);
    return;
  }
}

interface IParseResult {
  ok: boolean;
  set?: Partial<IEqMeta>;
  error?: string;
}

/** Validate one field=value pair and merge into `set`. Returns error message or null. */
function setField(set: Record<string, unknown>, key: string, val: string): string | null {
  switch (key) {
    case "kind":
      if (!EQ_KINDS.includes(val as IEqMeta["kind"] as never)) {
        return `kind must be one of: ${EQ_KINDS.join(", ")}`;
      }
      set.kind = val;
      return null;
    case "weaponType":
      if (!WEAPON_TYPES.includes(val as IEqMeta["weaponType"] as never)) {
        return `weaponType must be one of: ${WEAPON_TYPES.join(", ")}`;
      }
      set.weaponType = val;
      return null;
    case "damageType":
      if (!DAMAGE_TYPES.includes(val.toUpperCase() as IEqMeta["damageType"] as never)) {
        return `damageType must be one of: ${DAMAGE_TYPES.join(", ")}`;
      }
      set.damageType = val.toUpperCase();
      return null;
    case "concealability":
      if (!CONCEALABILITIES.includes(val.toUpperCase() as IEqMeta["concealability"] as never)) {
        return `concealability must be one of: ${CONCEALABILITIES.join(", ")}`;
      }
      set.concealability = val.toUpperCase();
      return null;
    case "damage":
    case "armorRating":
    case "fetishCost": {
      const n = parseIntNonNeg(val);
      if (n === null) return `${key} must be a non-negative integer.`;
      set[key] = n;
      return null;
    }
    case "silver":
    case "fetish":
    case "fetishActive":
    case "talen":
    case "talenSpent":
    case "worn":
    case "wielded":
    case "concealed": {
      const b = parseBool(val);
      if (b === null) return `${key} must be true/false.`;
      set[key] = b;
      return null;
    }
    case "fetishDesc":
      set.fetishDesc = val;
      return null;
    case "spiritSlug": {
      const slug = val.toLowerCase().trim();
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
        return "spiritSlug must be lowercase-kebab (letters, digits, hyphens).";
      }
      set.spiritSlug = slug;
      return null;
    }
    default:
      return `Unknown eq field: ${key}`;
  }
}

function parsePairs(raw: string): IParseResult {
  const set: Record<string, unknown> = {};
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) return { ok: false, error: `Bad pair (need key=val): ${part}` };
    const err = setField(set, part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    if (err) return { ok: false, error: err };
  }
  return { ok: true, set: set as Partial<IEqMeta> };
}

addCmd({
  name: "@eq",
  pattern: /^@eq(?:\/(\S+))?\s*([^=]*?)(?:\s*=\s*(.*))?$/i,
  lock: "connected",
  category: "Building",
  help: `@eq/<field> <item>=<value>  — Equipment fields and templates.

  Set kind, damage, armor, verbs, name, desc; copy/give templates.

  Full help: +help eq

Examples:
  @eq/damage klaive=4
  @eq/copy klaive=silver-klaive
  @eq/new silver-klaive=my klaive`,

  exec: async (u: IUrsamuSDK) => {
    const rawSw    = (u.cmd.args[0] ?? "").toLowerCase().trim();
    // Switch aliases -- short forms for verbose field names.
    const SW_ALIAS: Record<string, string> = {
      con:   "concealability",
      conc:  "concealability",
      wt:    "weaponType",
      type:  "weaponType",
      dt:    "damageType",
      armor: "armorRating",
      fcost: "fetishCost",
      fdesc: "fetishDesc",
      spirit: "spiritSlug",
    };
    const sw       = SW_ALIAS[rawSw] ?? rawSw;
    const itemArg  = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const valueArg = u.util.stripSubs(u.cmd.args[2] ?? "").trim();

    // -- template management ------------------------------------------------
    //   @eq/copy <item>=<template>       Save an item's eq definition as a template.
    //   @eq/give <item>=<template>       Apply a stored template's fields to an item.
    //   @eq/template                     List all templates.
    //   @eq/template <name>              Show one template's stored fields.
    //   @eq/template delete <name>       Delete a template.
    if (sw === "copy" || sw === "give" || sw === "new" || sw === "template" || sw.startsWith("template/")) {
      const tplRest = sw.startsWith("template/")
        ? `${sw.slice("template/".length)} ${itemArg}`.trim()
        : itemArg;
      const mode = sw === "copy" ? "copy" : sw === "give" ? "give" : sw === "new" ? "spawn" : "template";
      await handleEqTemplate(u, mode, tplRest, valueArg);
      return;
    }

    if (!itemArg) { u.send("Usage: @eq[/clear] <item>=<key=val>,..."); return; }

    const target = await u.util.target(u.me, itemArg, true);
    if (!target) { u.send(`Item not found: ${itemArg}`); return; }
    if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }

    if (sw === "clear") {
      const unset: Record<string, ""> = {};
      for (const f of EQ_FIELDS) unset[`state.${f}`] = "";
      await u.db.modify(target.id, "$unset", unset);
      u.send(`%cy${u.util.displayName(target, u.me)}: equipment fields cleared.%cn`);
      return;
    }

    // -- display + verb attrs ---------------------------------------------
    //   name -> obj.name (root)
    //   desc -> state.description (matches @desc convention)
    //   succ/osucc/fail/ofail/use/ouse -> state.attributes[] (MUSH &attr)
    const VERB_ATTRS = ["succ", "osucc", "fail", "ofail", "use", "ouse"];
    const DISPLAY_FIELDS = new Set(["name", "desc", ...VERB_ATTRS]);
    if (sw && DISPLAY_FIELDS.has(sw)) {
      if (!valueArg) { u.send(`Usage: @eq/${sw} <item>=<value>`); return; }

      if (sw === "name") {
        await u.db.modify(target.id, "$set", { name: valueArg });
      } else if (sw === "desc") {
        await u.db.modify(target.id, "$set", { "state.description": valueArg });
      } else {
        // Verb attr: rewrite state.attributes[] with the upserted entry.
        const upper = sw.toUpperCase();
        // deno-lint-ignore no-explicit-any
        const existing: Array<{ name: string; value: unknown }> = Array.isArray((target as any)?.state?.attributes)
          // deno-lint-ignore no-explicit-any
          ? (target as any).state.attributes.slice()
          : [];
        const filtered = existing.filter((a) => (a?.name ?? "").toUpperCase() !== upper);
        filtered.push({ name: upper, value: valueArg });
        await u.db.modify(target.id, "$set", { "state.attributes": filtered });
      }
      u.send(`%cg${u.util.displayName(target, u.me)} ${sw} = ${valueArg}%cn`);
      return;
    }

    // -- single-field switch path: @eq/<field> <item>=<value> --
    if (sw && EQ_FIELDS.includes(sw as keyof IEqMeta)) {
      if (!valueArg) {
        u.send(`Usage: @eq/${sw} <item>=<value>`);
        return;
      }
      const oneSet: Record<string, unknown> = {};
      const err = setField(oneSet, sw, valueArg);
      if (err) { u.send(`%cr${err}%cn`); return; }
      const setOp: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(oneSet)) setOp[`state.${k}`] = v;
      await u.db.modify(target.id, "$set", setOp);
      u.send(`%cg${u.util.displayName(target, u.me)} ${sw} = ${valueArg}.%cn`);
      return;
    }

    if (sw && sw !== "") {
      u.send(`Unknown switch: /${sw}. Valid: /clear or /<field> (${EQ_FIELDS.join(", ")}).`);
      return;
    }

    if (!valueArg) { u.send("Usage: @eq <item>=<key=val>,... (or /clear, or /<field>)"); return; }

    const parsed = parsePairs(valueArg);
    if (!parsed.ok || !parsed.set) { u.send(`%cr${parsed.error}%cn`); return; }

    const setOp: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed.set)) {
      setOp[`state.${k}`] = v;
    }
    await u.db.modify(target.id, "$set", setOp);

    const fieldList = Object.keys(parsed.set).join(", ");
    u.send(`%cg${u.util.displayName(target, u.me)} updated: ${fieldList}.%cn`);
  },
});
