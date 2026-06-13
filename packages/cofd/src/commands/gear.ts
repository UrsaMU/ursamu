// +gear command -- browse the Appendix One catalog and manage real game
// objects. Items are UrsaMU Things in the carrier's contents. Equipping
// a weapon or armor sets the "dark" flag (hidden from look) and stamps
// equippedBy on the item so it can't be dropped while equipped.
//
// Native get/drop/give handle item movement -- /drop, /pickup, and /give
// switches were removed in the durability/ammo pass.

import { divider, type IUrsamuSDK, type IDBObj } from "@ursamu/ursamu";
import {
  carriedItems,
  consumeReload,
  createItem,
  damageItem,
  destroyItem,
  displayName,
  EQUIPMENT,
  equipItem,
  inventoryItems,
  isAmbiguousMatch,
  itemData,
  lookupItem,
  parseWeaponTags,
  repairItem,
  resolveItemRef,
  splitStack,
  unequipItem,
} from "../equipment/index.ts";
import type { CofdSheet } from "../stats/index.ts";
import { getEncounterForRoom } from "../combat/encounter.ts";
import { hasMatchingQuickDraw } from "../combat/modifiers.ts";

/** Builder/admin/wizard gate on the caller. */
function isStaff(actor: { flags: Set<string> }): boolean {
  const f = actor.flags;
  return f.has("admin") || f.has("builder") || f.has("wizard");
}

/** Format ambiguous match candidates for the user, including slot numbers. */
function formatAmbiguous(
  ref: string,
  matches: IDBObj[],
  inv: IDBObj[],
): string {
  const parts: string[] = [];
  for (const m of matches) {
    const slot = inv.findIndex((o) => o.id === m.id) + 1;
    parts.push(slot > 0 ? `${displayName(m)} (#${slot})` : displayName(m));
  }
  return `Multiple matches for '${ref}': ${parts.join(", ")}.`;
}

function splitForTarget(rest: string): { body: string; target: string } {
  const idx = rest.toLowerCase().lastIndexOf(" for ");
  if (idx < 0) return { body: rest.trim(), target: "" };
  return { body: rest.slice(0, idx).trim(), target: rest.slice(idx + 5).trim() };
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function dots(n: number): string {
  return n > 0 ? "*".repeat(n) : "-";
}

async function resolveTarget(u: IUrsamuSDK, targetName: string) {
  const target = targetName ? await u.util.target(u.me, targetName, true) : u.me;
  if (!target) {
    u.send(`Player '${targetName}' not found.`);
    return null;
  }
  const sheet = target.state?.cofd as CofdSheet | undefined;
  if (!sheet) {
    u.send("That player does not have an approved character sheet yet.");
    return null;
  }
  const sameTarget = target.id === u.me.id;
  if (!sameTarget && !(await u.canEdit(u.me, target))) {
    u.send("Permission denied. You cannot modify that player's gear.");
    return null;
  }
  return { target, sheet, sameTarget };
}

async function gearList(u: IUrsamuSDK, category: string) {
  const cat = category.toLowerCase().trim();
  const lines: string[] = [];
  lines.push(await divider("E Q U I P M E N T   C A T A L O G"));

  const sections: Array<[string, { key: string; name: string; availability: number }[]]> = [];
  if (!cat || cat === "weapons" || cat === "ranged") {
    sections.push(["Ranged Weapons", EQUIPMENT.weapons.ranged]);
  }
  if (!cat || cat === "weapons" || cat === "melee") {
    sections.push(["Melee Weapons", EQUIPMENT.weapons.melee]);
  }
  if (!cat || cat === "armor") sections.push(["Armor", EQUIPMENT.armor]);
  if (!cat || cat === "mental") sections.push(["Mental Gear", EQUIPMENT.gear.mental]);
  if (!cat || cat === "physical") sections.push(["Physical Gear", EQUIPMENT.gear.physical]);
  if (!cat || cat === "social") sections.push(["Social Gear", EQUIPMENT.gear.social]);
  if (!cat || cat === "services") sections.push(["Services", EQUIPMENT.services]);
  if (!cat || cat === "ammo") sections.push(["Ammunition", EQUIPMENT.ammo]);

  if (sections.length === 0) {
    u.send("Usage: +gear/list [weapons|ranged|melee|armor|mental|physical|social|services|ammo]");
    return;
  }
  for (const [label, entries] of sections) {
    lines.push(`%ch${label}%cn`);
    for (const e of entries) {
      lines.push(`  ${e.key.padEnd(28)} ${dots(e.availability).padEnd(6)} ${e.name}`);
    }
  }
  u.send(lines.join("\n"));
}

async function gearShow(u: IUrsamuSDK, key: string) {
  const resolved = lookupItem(key);
  if (!resolved) {
    u.send(`Unknown item '${key}'. Try +gear/list.`);
    return;
  }
  const lines: string[] = [];
  lines.push(await divider(resolved.entry.name.toUpperCase()));
  switch (resolved.type) {
    case "weapon-ranged":
    case "weapon-melee": {
      const w = resolved.entry as typeof EQUIPMENT.weapons.ranged[number];
      lines.push(`  Type:         ${resolved.type === "weapon-ranged" ? "Ranged" : "Melee"}`);
      lines.push(`  Damage:       ${signed(w.damage)}`);
      lines.push(`  Initiative:   ${signed(w.initiative)}`);
      lines.push(`  Strength:     ${w.strength}`);
      lines.push(`  Size:         ${w.size}`);
      lines.push(`  Availability: ${dots(w.availability)}`);
      if (w.ranges) lines.push(`  Range:        ${w.ranges}`);
      if (w.capacity) lines.push(`  Capacity:     ${w.capacity}`);
      if (w.clip !== undefined) lines.push(`  Clip:         ${w.clip}`);
      if (w.special) lines.push(`  Special:      ${w.special}`);
      if (w.example) lines.push(`  Example:      ${w.example}`);
      break;
    }
    case "armor": {
      const a = resolved.entry as typeof EQUIPMENT.armor[number];
      lines.push(`  Rating:       ${a.ratingGeneral}/${a.ratingBallistic} (general/ballistic)`);
      lines.push(`  Strength:     ${a.strength}`);
      lines.push(`  Defense:      ${signed(a.defensePenalty)}`);
      lines.push(`  Speed:        ${signed(a.speedPenalty)}`);
      lines.push(`  Availability: ${dots(a.availability)}`);
      lines.push(`  Coverage:     ${a.coverage}`);
      lines.push(`  Concealed:    ${a.concealed ? "yes" : "no"}`);
      break;
    }
    case "gear-mental":
    case "gear-physical":
    case "gear-social": {
      const g = resolved.entry as typeof EQUIPMENT.gear.mental[number];
      lines.push(`  Dice Bonus:   ${signed(g.diceBonus)}`);
      lines.push(`  Durability:   ${g.durability}`);
      lines.push(`  Size:         ${g.size}`);
      lines.push(`  Availability: ${dots(g.availability)}`);
      lines.push(`  Effect:       ${g.effect}`);
      break;
    }
    case "service": {
      const s = resolved.entry as typeof EQUIPMENT.services[number];
      lines.push(`  Skill:        ${s.skill}`);
      lines.push(`  Availability: ${dots(s.availability)}`);
      lines.push(`  Dice Bonus:   ${signed(s.diceBonus)}`);
      break;
    }
    case "ammo": {
      const a = resolved.entry as typeof EQUIPMENT.ammo[number];
      lines.push(`  Rounds:       ${a.rounds}`);
      lines.push(`  Size:         ${a.size}`);
      lines.push(`  Availability: ${dots(a.availability)}`);
      lines.push(`  Concealed:    ${a.concealed ? "yes" : "no"}`);
      lines.push(`  Fits:         ${a.forWeaponKeys.join(", ")}`);
      break;
    }
  }
  u.send(lines.join("\n"));
}

async function gearAdd(u: IUrsamuSDK, rest: string) {
  const { body, target: targetName } = splitForTarget(rest);
  const slash = body.indexOf("/");
  const key = (slash >= 0 ? body.slice(0, slash) : body).trim();
  const note = slash >= 0 ? body.slice(slash + 1).trim() : "";
  if (!key) { u.send("Usage: +gear/add <key>[/<note>] [for <player>]"); return; }
  const resolved = lookupItem(key);
  if (!resolved) { u.send(`Unknown item '${key}'. See +gear/list.`); return; }
  const ctx = await resolveTarget(u, targetName);
  if (!ctx) return;
  // createItem already merges ammo stacks on the owner.
  const item = await createItem(u, ctx.target.id, key, { note: note || undefined });
  if (!item) { u.send(`Could not create '${key}'.`); return; }
  const who = ctx.sameTarget ? "your" : `${u.util.displayName(ctx.target, u.me)}'s`;
  if (resolved.type === "ammo") {
    const d = itemData(item);
    const count = d?.count ?? 1;
    const verb = count > 1 ? "Stacked" : "Added";
    u.send(`${verb} %ch${resolved.entry.name}%cn to ${who} inventory (x${count}).`);
  } else {
    u.send(`Added %ch${resolved.entry.name}%cn to ${who} inventory.`);
  }
}

async function gearRemove(u: IUrsamuSDK, rest: string) {
  const { body, target: targetName } = splitForTarget(rest);
  const idx = parseInt(body.trim(), 10);
  if (!Number.isInteger(idx) || idx < 1) { u.send("Usage: +gear/remove <#> [for <player>]"); return; }
  const ctx = await resolveTarget(u, targetName);
  if (!ctx) return;
  const inv = await inventoryItems(u, ctx.target.id);
  if (idx > inv.length) { u.send(`No inventory slot ${idx}.`); return; }
  const item = inv[idx - 1];
  await destroyItem(u, item.id);
  const who = ctx.sameTarget ? "your" : `${u.util.displayName(ctx.target, u.me)}'s`;
  u.send(`Removed %ch${displayName(item)}%cn from ${who} inventory.`);
}

async function gearEquip(u: IUrsamuSDK, rest: string) {
  const { body, target: targetName } = splitForTarget(rest);
  const idx = parseInt(body.trim(), 10);
  if (!Number.isInteger(idx) || idx < 1) { u.send("Usage: +gear/equip <#> [for <player>]"); return; }
  const ctx = await resolveTarget(u, targetName);
  if (!ctx) return;
  const eq = ctx.sheet.equipment ?? { equippedWeapon: null, equippedArmor: null };
  const result = await equipItem(u, ctx.target.id, idx, eq.equippedWeapon, eq.equippedArmor);
  if (result.error) { u.send(result.error); return; }
  const newEq = result.slot === "weapon"
    ? { ...eq, equippedWeapon: result.equippedId }
    : { ...eq, equippedArmor: result.equippedId };
  await u.db.modify(ctx.target.id, "$set", { "data.cofd": { ...ctx.sheet, equipment: newEq } });
  const items = await u.db.search({ id: result.equippedId });
  const equipped = items[0];
  const name = equipped ? displayName(equipped) : result.equippedId;
  const who = ctx.sameTarget ? "you" : u.util.displayName(ctx.target, u.me);
  u.send(`${who} now ${result.slot === "armor" ? "wears" : "wields"} %ch${name}%cn.`);

  if (result.slot === "weapon" && equipped) {
    const itemKey = itemData(equipped)?.key;
    const catalog = itemKey ? lookupItem(itemKey) : null;
    const tags = parseWeaponTags((catalog?.entry as { special?: string } | undefined)?.special);
    if (tags.slow) {
      const roomId = u.here?.id;
      const enc = roomId ? await getEncounterForRoom(roomId) : null;
      const isParticipant = !!enc &&
        enc.status === "active" &&
        enc.participants.some((p) => p.actorId === ctx.target.id);
      if (isParticipant) {
        const weaponClass = catalog?.type === "weapon-ranged"
          ? "firearms"
          : catalog?.type === "weapon-melee"
            ? "melee"
            : null;
        if (!hasMatchingQuickDraw(ctx.sheet, weaponClass)) {
          const subj = ctx.sameTarget ? "You spend" : `${who} spends`;
          u.send(
            `%cyNote:%cn ${subj} an instant action drawing the %ch${name}%cn (Slow). This is ${ctx.sameTarget ? "your" : "their"} turn.`,
          );
        }
      }
    }
  }
}

async function gearUnequip(u: IUrsamuSDK, rest: string) {
  const { body, target: targetName } = splitForTarget(rest);
  const slot = body.trim().toLowerCase();
  if (slot !== "weapon" && slot !== "armor") {
    u.send("Usage: +gear/unequip <weapon|armor> [for <player>]");
    return;
  }
  const ctx = await resolveTarget(u, targetName);
  if (!ctx) return;
  const eq = ctx.sheet.equipment ?? { equippedWeapon: null, equippedArmor: null };
  const itemId = slot === "weapon" ? eq.equippedWeapon : eq.equippedArmor;
  if (!itemId) { u.send(`No ${slot} equipped.`); return; }
  await unequipItem(u, itemId);
  const newEq = slot === "weapon"
    ? { ...eq, equippedWeapon: null }
    : { ...eq, equippedArmor: null };
  await u.db.modify(ctx.target.id, "$set", { "data.cofd": { ...ctx.sheet, equipment: newEq } });
  const who = ctx.sameTarget ? "You" : u.util.displayName(ctx.target, u.me);
  u.send(`${who} ${slot === "armor" ? "remove the armor" : "lower the weapon"}.`);
}

// ----- Reload --------------------------------------------------------

export async function gearReload(u: IUrsamuSDK, rest: string) {
  const { body, target: targetName } = splitForTarget(rest);
  const ctx = await resolveTarget(u, targetName);
  if (!ctx) return;
  const ref = body.trim();

  // Find the weapon item.
  let weaponItem: IDBObj | null = null;
  if (!ref) {
    const id = ctx.sheet.equipment?.equippedWeapon;
    if (!id) { u.send("No weapon equipped."); return; }
    const items = await u.db.search({ id });
    weaponItem = items[0] ?? null;
  } else {
    const resolved = await resolveItemRef(u, ctx.target.id, ref);
    if (isAmbiguousMatch(resolved)) {
      const inv = await inventoryItems(u, ctx.target.id);
      u.send(formatAmbiguous(ref, resolved.matches, inv));
      return;
    }
    weaponItem = resolved;
  }
  if (!weaponItem) { u.send(`No matching weapon for '${ref}'.`); return; }

  const d = itemData(weaponItem);
  const resolved = d ? lookupItem(d.key) : null;
  if (!resolved || resolved.type !== "weapon-ranged") {
    u.send(`${displayName(weaponItem)} is not a firearm.`);
    return;
  }

  const res = await consumeReload(u, ctx.target.id, weaponItem);
  const who = ctx.sameTarget ? "You" : u.util.displayName(ctx.target, u.me);
  if (!res.ok) {
    if (res.error === "no-stack") {
      u.send(`No magazine for ${displayName(weaponItem)} in inventory.`);
    } else {
      u.send(res.error ?? "Could not reload.");
    }
    return;
  }
  u.send(`${who} reload %ch${displayName(weaponItem)}%cn.`);
}

// ----- View ----------------------------------------------------------

function structuralTag(d: ReturnType<typeof itemData>): string {
  if (!d) return "";
  if (d.broken) return " %cr[broken]%cn";
  const cur = d.structure;
  const max = d.maxStructure;
  if (typeof cur === "number" && typeof max === "number" && cur < max) {
    return ` [hp ${cur}/${max}]`;
  }
  return "";
}

async function gearView(u: IUrsamuSDK, rest: string) {
  // Optional second positional filter: weapons | armor | gear | ammo
  // Form: "[<player>] [<filter>]" where filter is one of the known words.
  const parts = rest.trim().split(/\s+/).filter(Boolean);
  const KNOWN_FILTERS = new Set(["ammo", "weapons", "armor", "gear"]);
  let filter = "";
  let targetName = "";
  if (parts.length >= 1 && KNOWN_FILTERS.has(parts[parts.length - 1].toLowerCase())) {
    filter = parts.pop()!.toLowerCase();
  }
  targetName = parts.join(" ").trim();

  const target = targetName ? await u.util.target(u.me, targetName, true) : u.me;
  if (!target) { u.send(`Player '${targetName}' not found.`); return; }
  const sheet = target.state?.cofd as CofdSheet | undefined;
  if (!sheet) { u.send("That player does not have an approved character sheet yet."); return; }
  const carried = await carriedItems(u, target.id);
  const state = sheet.equipment ?? { equippedWeapon: null, equippedArmor: null };
  const lines: string[] = [];
  lines.push(await divider("G E A R"));
  const label = u.util.displayName(target, u.me);
  if (carried.length === 0 && !state.equippedWeapon && !state.equippedArmor) {
    lines.push(`  ${label} carries nothing.`);
    u.send(lines.join("\n"));
    return;
  }

  // Bucket the items.
  const buckets: Record<"equipped" | "weapons" | "armor" | "gear" | "ammo", IDBObj[]> = {
    equipped: [],
    weapons: [],
    armor: [],
    gear: [],
    ammo: [],
  };
  for (const obj of carried) {
    const d = itemData(obj)!;
    if (d.equippedBy) { buckets.equipped.push(obj); continue; }
    if (d.kind === "weapon") buckets.weapons.push(obj);
    else if (d.kind === "armor") buckets.armor.push(obj);
    else if (d.kind === "ammo") buckets.ammo.push(obj);
    else buckets.gear.push(obj);
  }

  const showAll = !filter;
  const sections: Array<[string, IDBObj[]]> = [];
  if (showAll || filter === "weapons" || filter === "armor") sections.push(["Equipped", buckets.equipped]);
  if (showAll || filter === "weapons") sections.push(["Weapons", buckets.weapons]);
  if (showAll || filter === "armor") sections.push(["Armor", buckets.armor]);
  if (showAll || filter === "gear") sections.push(["Gear", buckets.gear]);
  if (showAll || filter === "ammo") sections.push(["Ammo", buckets.ammo]);

  let slot = 0;
  for (const [name, items] of sections) {
    if (items.length === 0) continue;
    lines.push(`%ch${name}%cn`);
    for (const obj of items) {
      slot += 1;
      const d = itemData(obj)!;
      const marks: string[] = [];
      if (state.equippedWeapon === obj.id) marks.push("equipped");
      if (state.equippedArmor === obj.id) marks.push("worn");
      const tag = marks.length ? ` (${marks.join(", ")})` : "";
      const ammoClip = typeof d.currentClip === "number" ? ` [ammo ${d.currentClip}]` : "";
      const note = d.note ? ` -- ${d.note}` : "";
      const struct = structuralTag(d);
      let label2 = displayName(obj);
      if (d.kind === "ammo") {
        const count = d.count ?? 1;
        label2 = `${label2} x${count}`;
      }
      const concealed = d.kind === "ammo" && obj.flags.has("dark") ? " [concealed]" : "";
      lines.push(
        `  ${String(slot).padStart(2)}. ${label2}${ammoClip}${tag}${struct}${concealed}${note}`,
      );
    }
  }
  u.send(lines.join("\n"));
}

// ----- Split ---------------------------------------------------------

async function gearSplit(u: IUrsamuSDK, rest: string) {
  const { body, target: targetName } = splitForTarget(rest);
  const eq = body.indexOf("=");
  if (eq < 0) { u.send("Usage: +gear/split <#>=<n> [for <player>]"); return; }
  const idxStr = body.slice(0, eq).trim();
  const nStr = body.slice(eq + 1).trim();
  const idx = parseInt(idxStr, 10);
  const n = parseInt(nStr, 10);
  if (!Number.isInteger(idx) || idx < 1) { u.send("Usage: +gear/split <#>=<n> [for <player>]"); return; }
  if (!Number.isInteger(n) || n < 1) { u.send("Split count must be >= 1."); return; }
  const ctx = await resolveTarget(u, targetName);
  if (!ctx) return;
  const inv = await inventoryItems(u, ctx.target.id);
  if (idx > inv.length) { u.send(`No inventory slot ${idx}.`); return; }
  const item = inv[idx - 1];
  const d = itemData(item);
  if (!d || d.kind !== "ammo") { u.send(`${displayName(item)} is not an ammo stack.`); return; }
  const result = await splitStack(u, item.id, n);
  if (typeof result === "object" && "error" in result) {
    u.send(result.error);
    return;
  }
  const who = ctx.sameTarget ? "You" : u.util.displayName(ctx.target, u.me);
  u.send(`${who} split %ch${displayName(item)}%cn into a stack of ${n}.`);
}

// ----- Damage / repair ----------------------------------------------

/**
 * Parse "<ref>[=<n>]" with strict n >= 1 validation.
 * Returns either {ref, n} or {error}. Missing "=" implies n = 1.
 */
function parseRefAndAmount(
  body: string,
): { ref: string; n: number; error?: undefined } | { error: string } {
  const eq = body.lastIndexOf("=");
  if (eq < 0) return { ref: body.trim(), n: 1 };
  const ref = body.slice(0, eq).trim();
  const rawN = body.slice(eq + 1).trim();
  const n = parseInt(rawN, 10);
  if (!Number.isInteger(n) || n < 1) {
    return { error: `Amount must be an integer >= 1 (got '${rawN}').` };
  }
  return { ref, n };
}

/** Search carried items for a name fallback, returning ambiguous shape on >1. */
async function fallbackCarriedMatch(
  u: IUrsamuSDK,
  ownerId: string,
  ref: string,
): Promise<IDBObj | { ambiguous: true; matches: IDBObj[] } | null> {
  const carried = await carriedItems(u, ownerId);
  const lower = ref.toLowerCase();
  const matches = carried.filter((o) =>
    displayName(o).toLowerCase().includes(lower),
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  return { ambiguous: true, matches };
}

async function gearDamage(u: IUrsamuSDK, rest: string) {
  const { body, target: targetName } = splitForTarget(rest);
  if (!body) { u.send("Usage: +gear/damage <#|name>[=<n>] [for <player>]"); return; }
  // Builder+ gate -- /damage requires staff even for self.
  if (!isStaff(u.me)) {
    u.send("Permission denied. Builder or higher required.");
    return;
  }
  const ctx = await resolveTarget(u, targetName);
  if (!ctx) return;
  const parsed = parseRefAndAmount(body);
  if ("error" in parsed && parsed.error) { u.send(parsed.error); return; }
  const { ref, n } = parsed as { ref: string; n: number };
  const resolved = await resolveItemRef(u, ctx.target.id, ref);
  if (isAmbiguousMatch(resolved)) {
    const inv = await inventoryItems(u, ctx.target.id);
    u.send(formatAmbiguous(ref, resolved.matches, inv));
    return;
  }
  if (!resolved) {
    // Fallback: equipped items aren't returned by inventoryItems; search all
    // carried items by name with the same ambiguity rules.
    const fb = await fallbackCarriedMatch(u, ctx.target.id, ref);
    if (!fb) { u.send(`No item matching '${ref}'.`); return; }
    if (isAmbiguousMatch(fb)) {
      const inv = await inventoryItems(u, ctx.target.id);
      u.send(formatAmbiguous(ref, fb.matches, inv));
      return;
    }
    return await applyDamage(u, ctx, fb, n);
  }
  await applyDamage(u, ctx, resolved, n);
}

async function applyDamage(
  u: IUrsamuSDK,
  ctx: { target: IDBObj; sameTarget: boolean },
  item: IDBObj,
  n: number,
) {
  const before = itemData(item)!;
  const dur = before.durability ?? 0;
  const raw = Math.max(0, n - dur);
  const result = await damageItem(u, item.id, raw);
  const who = ctx.sameTarget ? "You" : u.util.displayName(ctx.target, u.me);
  const max = before.maxStructure ?? before.structure ?? 1;
  if (result.broken) {
    u.send(`${who} damage %ch${displayName(item)}%cn. %cr[broken]%cn`);
  } else {
    u.send(`${who} damage %ch${displayName(item)}%cn (hp ${result.newStructure}/${max}).`);
  }
  if (result.autoUnequipped && u.here?.broadcast) {
    const subj = ctx.sameTarget
      ? u.util.displayName(u.me, u.me)
      : u.util.displayName(ctx.target, u.me);
    u.here.broadcast(`${subj}'s ${displayName(item)} breaks and falls from their grasp.`);
  }
}

async function gearRepair(u: IUrsamuSDK, rest: string) {
  const { body, target: targetName } = splitForTarget(rest);
  if (!body) { u.send("Usage: +gear/repair <#|name>[=<n>] [for <player>]"); return; }
  // Builder+ gate -- /repair requires staff even for self.
  if (!isStaff(u.me)) {
    u.send("Permission denied. Builder or higher required.");
    return;
  }
  const ctx = await resolveTarget(u, targetName);
  if (!ctx) return;
  const parsed = parseRefAndAmount(body);
  if ("error" in parsed && parsed.error) { u.send(parsed.error); return; }
  const { ref, n } = parsed as { ref: string; n: number };
  let item: IDBObj | null = null;
  const resolved = await resolveItemRef(u, ctx.target.id, ref);
  if (isAmbiguousMatch(resolved)) {
    const inv = await inventoryItems(u, ctx.target.id);
    u.send(formatAmbiguous(ref, resolved.matches, inv));
    return;
  }
  if (resolved) {
    item = resolved;
  } else {
    const fb = await fallbackCarriedMatch(u, ctx.target.id, ref);
    if (!fb) { u.send(`No item matching '${ref}'.`); return; }
    if (isAmbiguousMatch(fb)) {
      const inv = await inventoryItems(u, ctx.target.id);
      u.send(formatAmbiguous(ref, fb.matches, inv));
      return;
    }
    item = fb;
  }
  const before = itemData(item)!;
  const max = before.maxStructure ?? before.structure ?? 1;
  const result = await repairItem(u, item.id, n);
  const who = ctx.sameTarget ? "You" : u.util.displayName(ctx.target, u.me);
  u.send(`${who} repair %ch${displayName(item)}%cn (hp ${result.newStructure}/${max}).`);
}

// ----- Dispatcher ----------------------------------------------------

export async function gearExec(u: IUrsamuSDK) {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  if (!sw) { await gearView(u, rest); return; }
  switch (sw) {
    case "view":   await gearView(u, rest);   return;
    case "list":   await gearList(u, rest);   return;
    case "show":   await gearShow(u, rest);   return;
    case "add":    await gearAdd(u, rest);    return;
    case "remove": case "rem": await gearRemove(u, rest); return;
    case "equip":  await gearEquip(u, rest);  return;
    case "unequip": await gearUnequip(u, rest); return;
    case "reload": await gearReload(u, rest); return;
    case "split":  await gearSplit(u, rest);  return;
    case "damage": await gearDamage(u, rest); return;
    case "repair": await gearRepair(u, rest); return;
    default:
      u.send(
        `Unknown +gear switch '/${sw}'. Use /list, /show, /add, /remove, /equip, /unequip, /reload, /split, /damage, /repair.`,
      );
  }
}
