/**
 * D&D inventory display (web layout + telnet) and inventory:show hook.
 */
import {
  gameHooks,
  type IUrsamuSDK,
  type IDBObj,
  header,
  divider,
  footer,
} from "@ursamu/ursamu";
import {
  gearByName,
  gearToDndState,
} from "../data/equipment.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

export function dndOf(item: IDBObj): Any {
  return (item.state as Any)?.dnd ?? {};
}

/** Prefer state.dnd.type; fall back to equipment catalog by name. */
export function itemKind(item: IDBObj): string {
  const t = String(dndOf(item).type || "").toLowerCase();
  if (t === "weapon" || t === "armor" || t === "shield" ||
    t === "general") {
    return t;
  }
  const g = gearByName(String(item.name || ""));
  if (g) return g.type === "shield" ? "shield" : g.type;
  return "general";
}

/** Fill missing dnd blob from catalog so equip/combat work. */
export async function healItemDnd(
  u: IUrsamuSDK,
  item: IDBObj,
): Promise<void> {
  const d = dndOf(item);
  if (d.type === "weapon" || d.type === "armor" ||
    d.type === "shield" || d.type === "general") {
    return;
  }
  const g = gearByName(String(item.name || ""));
  if (!g) return;
  const next = gearToDndState(g, d.valueGp);
  if (d.equipped) next.equipped = true;
  await u.db.modify(item.id, "$set", { "data.dnd": next });
  if (item.state) (item.state as Any).dnd = next;
}

export function uniqueById(items: IDBObj[]): IDBObj[] {
  const seen = new Set<string>();
  const out: IDBObj[] = [];
  for (const it of items) {
    const id = String(it.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(it);
  }
  return out;
}

export async function carried(u: IUrsamuSDK): Promise<IDBObj[]> {
  let raw: IDBObj[] = [];
  try {
    raw = await u.db.search({ location: u.me.id });
  } catch {
    raw = ((u.me.contents || []) as IDBObj[]);
  }
  if (!raw.length && u.me.contents?.length) {
    raw = u.me.contents as IDBObj[];
  }
  return uniqueById(
    raw.filter((o) =>
      o.flags?.has?.("thing") &&
      !o.flags?.has?.("exit") &&
      !o.flags?.has?.("player") &&
      !o.flags?.has?.("room")
    ),
  );
}

export function weaponDesc(d: Any): string {
  const damage = d.damage || "1d6";
  const damageType = d.damageType || "slashing";
  const props = Array.isArray(d.properties)
    ? d.properties.join(", ")
    : "";
  return `${damage} ${damageType}` +
    (props ? ` (${props})` : "");
}

export function armorDesc(d: Any): string {
  return `AC ${d.ac || 10} (${d.armorType || "light"})`;
}

function prefersWeb(u: IUrsamuSDK): boolean {
  return u.clientType === "web" &&
    typeof (u as Any).ui?.layout === "function";
}

/** Stack identical gear (same name + kind + stats) for display. */
type GearStack = {
  name: string;
  count: number;
  ids: string[];
  equippedIds: string[];
  rep: IDBObj;
  desc: string;
};

function stackKey(item: IDBObj, kind: string, desc: string): string {
  return [
    kind,
    String(item.name || "").toLowerCase(),
    desc.toLowerCase(),
  ].join("|");
}

function stackItems(
  items: IDBObj[],
  kind: "weapon" | "armor" | "general",
): GearStack[] {
  const map = new Map<string, GearStack>();
  for (const it of items) {
    const d = dndOf(it);
    const desc = kind === "weapon"
      ? weaponDesc(d)
      : kind === "armor"
      ? armorDesc(d)
      : String(d.subtype || "gear");
    const k = stackKey(it, kind, desc);
    let s = map.get(k);
    if (!s) {
      s = {
        name: String(it.name || "Item"),
        count: 0,
        ids: [],
        equippedIds: [],
        rep: it,
        desc,
      };
      map.set(k, s);
    }
    s.count++;
    s.ids.push(String(it.id));
    if (d.equipped) s.equippedIds.push(String(it.id));
  }
  return [...map.values()];
}

function stackLabel(s: GearStack): string {
  return s.count > 1 ? `${s.name} ×${s.count}` : s.name;
}

/** Primary id for toggle: unwield equipped, else equip first. */
function stackToggleId(s: GearStack): string {
  if (s.equippedIds.length) return s.equippedIds[0];
  return s.ids[0];
}

function sendWebInventory(
  u: IUrsamuSDK,
  name: string,
  weapons: IDBObj[],
  armors: IDBObj[],
  general: IDBObj[],
): void {
  const components: unknown[] = [
    { type: "header", title: `${name}'s Inventory` },
    {
      type: "text",
      content:
        "Tap a row to wield/wear or unequip. " +
        "Identical items stack (×N).",
    },
  ];

  const wStacks = stackItems(weapons, "weapon");
  if (wStacks.length) {
    components.push({
      type: "entity-list",
      title: "Weapons",
      items: wStacks.map((s) => {
        const on = s.equippedIds.length > 0;
        const id = stackToggleId(s);
        const eqN = s.equippedIds.length;
        return {
          id,
          label: stackLabel(s),
          meta: on
            ? (eqN > 1 ? `${eqN} wielded` : "wielded")
            : "tap · wield",
          sublabel: s.desc,
          usable: on ? true : undefined,
          action: {
            cmd: on ? `+unwield #${id}` : `+wield #${id}`,
          },
        };
      }),
    });
  } else {
    components.push({
      type: "text",
      content: "Weapons: (none)",
    });
  }

  const aStacks = stackItems(armors, "armor");
  if (aStacks.length) {
    components.push({
      type: "entity-list",
      title: "Armor & shields",
      items: aStacks.map((s) => {
        const on = s.equippedIds.length > 0;
        const id = stackToggleId(s);
        return {
          id,
          label: stackLabel(s),
          meta: on ? "worn" : "tap · wear",
          sublabel: s.desc,
          usable: on ? true : undefined,
          action: {
            cmd: on ? `+remove #${id}` : `+wear #${id}`,
          },
        };
      }),
    });
  } else {
    components.push({
      type: "text",
      content: "Armor & shields: (none)",
    });
  }

  const gStacks = stackItems(general, "general");
  if (gStacks.length) {
    components.push({
      type: "entity-list",
      title: "Other items",
      items: gStacks.map((s) => ({
        id: s.ids[0],
        label: stackLabel(s),
        sublabel: s.desc,
        action: { cmd: `look #${s.ids[0]}` },
      })),
    });
  }

  const n = weapons.length + armors.length + general.length;
  const lines = wStacks.length + aStacks.length + gStacks.length;
  components.push({
    type: "text",
    content: lines === n
      ? `${n} item${n === 1 ? "" : "s"}.`
      : `${n} items · ${lines} stack${lines === 1 ? "" : "s"}.`,
  });

  (u as Any).ui.layout({
    components,
    meta: { type: "dnd-inventory", system: "dnd" },
  });
}

function sendTelnetInventory(
  u: IUrsamuSDK,
  name: string,
  weapons: IDBObj[],
  armors: IDBObj[],
  general: IDBObj[],
): void {
  const lines: string[] = [
    header(`${name.toUpperCase()}'S INVENTORY`),
  ];
  lines.push(divider("W E A P O N S"));
  const wStacks = stackItems(weapons, "weapon");
  if (!wStacks.length) lines.push("  (none)");
  else {
    for (const s of wStacks) {
      const on = s.equippedIds.length > 0;
      const id = stackToggleId(s);
      const eq = on ? " %cg[Wielded]%cn" : "";
      lines.push(
        `  ${u.util.ljust(stackLabel(s), 22)}` +
          `${u.util.ljust(s.desc, 28)}${eq}`,
      );
      lines.push(
        on
          ? `      %cx+unwield #${id}%cn`
          : `      %cx+wield #${id}%cn`,
      );
    }
  }
  lines.push(divider("A R M O R   &   S H I E L D S"));
  const aStacks = stackItems(armors, "armor");
  if (!aStacks.length) lines.push("  (none)");
  else {
    for (const s of aStacks) {
      const on = s.equippedIds.length > 0;
      const id = stackToggleId(s);
      const eq = on ? " %cg[Equipped]%cn" : "";
      lines.push(
        `  ${u.util.ljust(stackLabel(s), 22)}` +
          `${u.util.ljust(s.desc, 28)}${eq}`,
      );
      lines.push(
        on
          ? `      %cx+remove #${id}%cn`
          : `      %cx+wear #${id}%cn`,
      );
    }
  }
  lines.push(divider("O T H E R   I T E M S"));
  const gStacks = stackItems(general, "general");
  if (!gStacks.length) lines.push("  (none)");
  else {
    for (const s of gStacks) {
      lines.push(`  * ${stackLabel(s)}`);
    }
  }
  lines.push(footer());
  u.send(lines.join("\n"));
}

export async function showDndInventory(
  u: IUrsamuSDK,
): Promise<void> {
  if (!(u.me.state as Any)?.dnd) return;
  const items = await carried(u);
  // Repair legacy buys missing state.dnd.type
  for (const it of items) {
    await healItemDnd(u, it);
  }
  const name = u.util.displayName(u.me, u.me);
  const weapons = items.filter((i) => itemKind(i) === "weapon");
  const armors = items.filter((i) => {
    const t = itemKind(i);
    return t === "armor" || t === "shield";
  });
  const general = items.filter((i) => {
    const t = itemKind(i);
    return t !== "weapon" && t !== "armor" && t !== "shield";
  });
  if (prefersWeb(u)) {
    sendWebInventory(u, name, weapons, armors, general);
  } else {
    sendTelnetInventory(u, name, weapons, armors, general);
  }
}

export function prefersWebInv(u: IUrsamuSDK): boolean {
  return prefersWeb(u);
}

async function onInventoryShow(
  ctx: { u: IUrsamuSDK; handled: boolean },
): Promise<void> {
  if (!(ctx.u.me.state as Any)?.dnd) return;
  await showDndInventory(ctx.u);
  ctx.handled = true;
}

export function initInventoryHook(): void {
  // deno-lint-ignore no-explicit-any
  (gameHooks as any).on?.("inventory:show", onInventoryShow);
}

export function removeInventoryHook(): void {
  // deno-lint-ignore no-explicit-any
  (gameHooks as any).off?.("inventory:show", onInventoryShow);
}
