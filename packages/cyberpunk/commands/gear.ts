/**
 * +gear -- Inventory / Gear Management
 */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import type { ICPRCharacter, IGearItem, GearSlot } from "../db/schemas.ts";
import { bar, div, hdr, val, acc, dim, bad, ARR, ERR, OK, tbl, row } from "./chargen.ts";

const VALID_TYPES = new Set(["weapon", "armor", "gear", "ammo", "drug", "other"]);
const VALID_SLOTS = new Set<GearSlot>(["wielded", "worn", "carried"]);
const SLOT_ORDER: Record<GearSlot, number> = { wielded: 0, worn: 1, carried: 2 };

function getCpr(u: IUrsamuSDK): ICPRCharacter | null {
  return (u.me.state?.cpr as ICPRCharacter) ?? null;
}

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
}

function nameCell(item: IGearItem, staff: boolean): string {
  const base = item.concealed
    ? `${val(item.name)} ${bad("[C]")}`
    : val(item.name);
  return staff ? `${base} ${dim("#" + item.id.slice(0, 8))}` : base;
}

function slotColor(slot: GearSlot, name: string): string {
  if (slot === "wielded") return acc(name);
  if (slot === "worn")    return val(name);
  return dim(name);
}

function armorRows(cpr: ICPRCharacter): string[][] {
  const rows: string[][] = [];
  if (cpr.armorHead) {
    rows.push([val("worn"), val(cpr.armorHead.name), val("armor"), ""]);
  }
  if (cpr.armorBody) {
    rows.push([val("worn"), val(cpr.armorBody.name), val("armor"), ""]);
  }
  return rows;
}

function gearRows(gear: IGearItem[], staff: boolean): string[][] {
  const sorted = [...gear].sort(
    (a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot],
  );
  return sorted.map((item) => [
    slotColor(item.slot, item.slot),
    nameCell(item, staff),
    dim(item.type),
    item.concealed ? bad("[C]") : "",
  ]);
}

/** Renders the full gear list display. */
function renderGearList(u: IUrsamuSDK, cpr: ICPRCharacter): void {
  const staff = isStaff(u);
  const cols = [
    { label: "SLOT",  width: 8  },
    { label: "NAME",  width: 24 },
    { label: "TYPE",  width: 8  },
    { label: "FLAGS", width: 6  },
  ];
  const rows = [...armorRows(cpr), ...gearRows(cpr.gear ?? [], staff)];

  u.send([
    bar(),
    hdr("INVENTORY"),
    bar(),
    ...tbl(cols, rows),
    div(),
    `  ${ARR}${val("+gear/add <name>=<type>")}  ${dim("-- add item")}`,
    `  ${ARR}${val("+gear/equip <id>=<slot>")}  ${dim("-- change slot")}`,
    `  ${ARR}${val("+gear/conceal <id>")}       ${dim("-- toggle concealed")}`,
    `  ${ARR}${val("+gear/remove <id>")}        ${dim("-- remove item")}`,
    bar(),
  ].join("\r\n"));
}

addCmd({
  name: "+gear",
  pattern: /^\+gear(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+gear[/switch] [<args>]  -- Manage your carried gear and inventory.

Switches:
  /list              Show all gear (default).
  /add <name>=<type> Add a new item. Types: weapon, armor, gear, ammo, drug, other.
  /equip <id>=<slot> Move item to slot. Slots: wielded, worn, carried.
  /conceal <id>      Toggle concealed flag on item.
  /remove <id>       Remove item from inventory.

Examples:
  +gear                        List your gear.
  +gear/add Knife=weapon       Add a knife as a weapon.
  +gear/equip abc12345=wielded Equip the item starting with abc12345.
  +gear/conceal abc12345       Toggle concealed on that item.
  +gear/remove abc12345        Remove that item.`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    const cpr = getCpr(u);
    if (!cpr) { u.send(`${ERR}No character data found. Complete chargen first.`); return; }

    if (!sw || sw === "list") { renderGearList(u, cpr); return; }
    if (sw === "add")    { await gearAdd(u, cpr, arg);     return; }
    if (sw === "equip")  { await gearEquip(u, cpr, arg);   return; }
    if (sw === "conceal"){ await gearConceal(u, cpr, arg); return; }
    if (sw === "remove") { await gearRemove(u, cpr, arg);  return; }

    u.send(`${ERR}Unknown switch. See ${val("+help gear")}.`);
  },
});

async function gearAdd(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  const eqIdx = arg.indexOf("=");
  if (eqIdx < 1) { u.send(`${ERR}Usage: +gear/add <name>=<type>`); return; }
  const name = arg.slice(0, eqIdx).trim();
  const type = arg.slice(eqIdx + 1).trim().toLowerCase();
  if (!name) { u.send(`${ERR}Item name cannot be empty.`); return; }
  if (!VALID_TYPES.has(type)) {
    u.send(`${ERR}Invalid type. Use: weapon, armor, gear, ammo, drug, other.`);
    return;
  }
  const newItem: IGearItem = {
    id: crypto.randomUUID(),
    name,
    type: type as IGearItem["type"],
    slot: "carried",
    concealed: false,
  };
  const updated = [...(cpr.gear ?? []), newItem];
  await u.db.modify(u.me.id, "$set", { "state.cpr.gear": updated });
  u.send(`${OK}${val(name)} added to inventory as ${dim(type)}.`);
}

async function gearEquip(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  const eqIdx = arg.indexOf("=");
  if (eqIdx < 1) { u.send(`${ERR}Usage: +gear/equip <id>=<slot>`); return; }
  const partial = arg.slice(0, eqIdx).trim().toLowerCase();
  const slot    = arg.slice(eqIdx + 1).trim().toLowerCase() as GearSlot;
  if (!VALID_SLOTS.has(slot)) {
    u.send(`${ERR}Invalid slot. Use: wielded, worn, carried.`);
    return;
  }
  const gear = cpr.gear ?? [];
  const idx  = gear.findIndex((i) => i.id.startsWith(partial));
  if (idx < 0) { u.send(`${ERR}No item found matching that id.`); return; }
  const updated = gear.map((item, i) => i === idx ? { ...item, slot } : item);
  await u.db.modify(u.me.id, "$set", { "state.cpr.gear": updated });
  u.send(`${OK}${val(gear[idx].name)} moved to ${val(slot)}.`);
}

async function gearConceal(u: IUrsamuSDK, cpr: ICPRCharacter, partial: string): Promise<void> {
  const lower = partial.toLowerCase();
  const gear  = cpr.gear ?? [];
  const idx   = gear.findIndex((i) => i.id.startsWith(lower));
  if (idx < 0) { u.send(`${ERR}No item found matching that id.`); return; }
  const item    = gear[idx];
  const updated = gear.map((g, i) =>
    i === idx ? { ...g, concealed: !g.concealed } : g
  );
  await u.db.modify(u.me.id, "$set", { "state.cpr.gear": updated });
  const state = updated[idx].concealed ? bad("concealed") : dim("visible");
  u.send(`${OK}${val(item.name)} is now ${state}.`);
}

async function gearRemove(u: IUrsamuSDK, cpr: ICPRCharacter, partial: string): Promise<void> {
  const lower = partial.toLowerCase();
  const gear  = cpr.gear ?? [];
  const idx   = gear.findIndex((i) => i.id.startsWith(lower));
  if (idx < 0) { u.send(`${ERR}No item found matching that id.`); return; }
  const item    = gear[idx];
  const updated = gear.filter((_, i) => i !== idx);
  await u.db.modify(u.me.id, "$set", { "state.cpr.gear": updated });
  u.send(`${OK}${val(item.name)} removed from inventory.`);
}
