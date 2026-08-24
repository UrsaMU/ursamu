/**
 * Catalog format, annotate (proficiency), and spawn for vendors.
 */
import {
  canUseGear,
  gearByName,
  gearToDndState,
  resolveGear,
  type GearEntry,
} from "../data/equipment.ts";
import { migrateSheet } from "../stats/dnd_sheet.ts";
import { syncGoldField } from "../stats/currency.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

function sheetFrom(obj: Any) {
  const raw = obj?.state?.dnd ?? obj?.data?.dnd;
  if (!raw) return null;
  return syncGoldField(migrateSheet(raw));
}

export function onFormatItem(data: Any): void {
  const gear = resolveGear(
    String(data.itemName || data.name || ""),
    String(data.spec || ""),
  );
  if (!gear) {
    data.desc = data.desc || "";
    return;
  }
  if (gear.type === "weapon") {
    const props = (gear.properties || []).join(", ");
    data.desc = `Weapon: ${gear.damage} ${gear.damageType}` +
      (props ? ` (${props})` : "");
    return;
  }
  if (gear.type === "armor") {
    data.desc = `Armor: AC ${gear.ac} (${gear.armorType})`;
    return;
  }
  if (gear.type === "shield") {
    data.desc = `Shield: AC +${gear.ac ?? 2}`;
    return;
  }
  const labels: Record<string, string> = {
    food: "Food & drink",
    tool: "Tool",
    kit: "Kit",
    focus: "Spell focus",
    gear: "Adventuring gear",
    ammo: "Ammunition",
  };
  data.desc = labels[gear.category] ||
    labels[gear.subtype || ""] ||
    "Adventuring gear";
}

export async function onAnnotateWares(data: Any): Promise<void> {
  const rows = await data.db?.search?.({ id: data.actorId });
  const actor = rows?.[0];
  const sheet = actor ? sheetFrom(actor) : null;
  const wares = Array.isArray(data.wares) ? data.wares : [];
  for (const w of wares) {
    const gear = resolveGear(
      String(w.name || ""),
      String(w.spec || ""),
    );
    if (!gear) {
      w.hide = true;
      continue;
    }
    w.name = gear.name;
    if (!w.price || w.price <= 0) w.price = gear.priceGp;
    w.spec = `slug:${gear.slug}`;
    if (!w.desc) {
      const fmt = { spec: w.spec, itemName: gear.name, desc: "" };
      onFormatItem(fmt);
      w.desc = fmt.desc;
    }
    if (gear.type === "general") {
      w.usable = undefined;
      w.usableHint = undefined;
      continue;
    }
    const ok = canUseGear(sheet, gear);
    w.usable = ok;
    w.usableHint = ok ? "proficient" : "not proficient";
  }
  data.wares = wares;
}

export async function onSpawnItem(data: Any): Promise<void> {
  // Claim before any await so default economy never double-spawns
  data._dnd = true;
  const name = String(data.itemName || "").trim();
  const spec = String(data.spec || "");
  let gear: GearEntry | undefined = resolveGear(name, spec);
  if (!gear) gear = gearByName(name);
  if (!gear) {
    data.success = false;
    return;
  }
  // Probe from +buy before deduct — catalog OK, no create
  if (data.dryRun) {
    data.success = true;
    data.itemName = gear.name;
    return;
  }
  const listed = Number(data.price);
  const price = Number.isFinite(listed) && listed > 0
    ? listed
    : gear.priceGp;
  const dndData = gearToDndState(gear, price);

  await data.db.create({
    flags: new Set(["thing"]),
    location: data.actorId,
    name: gear.name,
    state: {
      name: gear.name,
      dnd: dndData,
      owner: data.actorId,
    },
  });
  data.itemName = gear.name;
  data.success = true;
}
