/** +loadout +gear +market +aug +shard — catalog & street tech. */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  footer,
  ARR,
  ERR,
  OK,
  header,
  dim,
  divider,
  val,
  ylw,
} from "./chrome.ts";
import { overloadFrom } from "../db/schemas.ts";
import type { IAugItem } from "../db/schemas.ts";
import {
  getChar,
  getInventory,
  isStaff,
  requireChar,
  saveChar,
} from "../engine/sheet-io.ts";
import {
  createItem,
  destroyItem,
  displayName,
  itemDisplayLines,
  itemData,
  resolveItemRef,
  writeItemData,
} from "../engine/items.ts";
import { loadAmmoIntoGun } from "../engine/ammo-load.ts";
import {
  attachMod,
  detachMod,
  listHostMods,
  parseHostModArg,
} from "../engine/item-mods.ts";
import { effectiveLoadoutMax } from "../engine/worn-gear.ts";
import { isPersonalGear } from "../engine/vehicles.ts";
import {
  afterGearChange,
  setSlotSwitch,
} from "./gear-slots.ts";
import { buyStreetItem } from "./gear-buy.ts";
import {
  AMMO,
  ARMOR,
  AUGS,
  DRONES,
  FIREARMS,
  HEAVY,
  MELEE,
  SHARDS,
  WEAPON_MODS,
  allGearRows,
  find,
  findByName,
} from "../engine/catalog.ts";

function listCat(
  title: string,
  rows: { slug: string; name?: string; cost?: unknown }[],
  filter: string,
): string {
  const q = filter.toLowerCase();
  const hit = q
    ? rows.filter((r) =>
      r.slug.includes(q) ||
      String(r.name ?? "").toLowerCase().includes(q)
    )
    : rows;
  const lines = [header(title)];
  for (const r of hit.slice(0, 24)) {
    const cost = r.cost != null
      ? ` ${dim(String(r.cost) + " b¥")}`
      : "";
    lines.push(
      `  ${val(r.slug)} ${dim(String(r.name))}${cost}`,
    );
  }
  if (hit.length > 24) {
    lines.push(`  ${dim("… filter to narrow")}`);
  }
  lines.push(footer());
  return lines.join("\r\n");
}

/** Shared carried-gear listing (also used by inventory:show). */
export async function renderLoadoutView(
  u: IUrsamuSDK,
): Promise<string> {
  const c = getChar(u.me);
  const { items, load } = await getInventory(u, u.me);
  const baseMax = c?.loadoutMax ?? 10;
  const max = effectiveLoadoutMax(baseMax, items);
  const over = overloadFrom(load, max);
  const lines = [
    header("LOADOUT"),
    `  ${val(load)}/${val(max)}` +
    (over
      ? ` ${ylw("OVERLOAD -" + over + " Morph/React")}`
      : ""),
  ];
  const gear = items.filter((o) => isPersonalGear(itemData(o)));
  let n = 0;
  for (const o of gear) {
    n++;
    const rows = itemDisplayLines(o, { index: n });
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Host row: dim the #n prefix; nested mods stay plain.
      if (i === 0) {
        const m = row.match(/^(#\d+)\s+(.*)$/);
        lines.push(
          m
            ? `  ${dim(m[1])} ${m[2]}`
            : `  ${row}`,
        );
      } else {
        lines.push(row);
      }
    }
  }
  if (!gear.length) lines.push(`  ${dim("empty")}`);
  const nVeh = items.length - gear.length;
  if (nVeh > 0) {
    lines.push(
      `  ${dim(nVeh + " vehicle(s) — +vehicle garage")}`,
    );
  }
  lines.push(divider("EQUIP"));
  lines.push(
    `  ${ylw("wear")} ${dim("<#n|name>")} armor` +
      `  ${ylw("wield")} ${dim("<#n|name>")} weapons`,
  );
  lines.push(
    `  ${ylw("stow")} ${dim("<#n|name>")} pack` +
      `  ${dim("e.g. wear #1 · wield #2")}`,
  );
  lines.push(
    `  ${dim("inv · use <item> · +market · +help wear")}`,
  );
  lines.push(footer());
  return lines.join("\r\n");
}

addCmd({
  name: "+loadout",
  pattern: /^\+loadout\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+loadout  — Carried gear vs Loadout score.

Same view as inv. Equip from the list:
  wear #1    armor
  wield #2   weapon
  stow #1    back to pack

Examples:
  +loadout
  inv
  wear #1`,

  exec: async (u: IUrsamuSDK) => {
    if (!getChar(u.me)) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    u.send(await renderLoadoutView(u));
  },
});

addCmd({
  name: "+gear",
  pattern: /^\+gear(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+gear[/<switch>] [args]  — Loadout, catalog, slots.

Equip with plain verbs (easiest):
  wear <item|#n>    armor / clothes
  wield <item|#n>   guns / blades
  stow <item|#n>    back to pack
  inv               list #n indices

Switches:
  /catalog [type|filter]  firearms melee armor…
  /buy <slug>             Same as +market/buy
  /wear|/wield|/stow <ref>
  /mod <host>=<mod>       Attach loose mod
  /load <gun>=<ammo>      Specialty ammo into gun
  /unload <gun>           Clear specialty ammo

Examples:
  +gear/load link=hellfires
  +gear/load #5 hellfires
  +gear/unload #5
  inv`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const c = requireChar(u);
    if (!c) {
      u.send(
        `${ARR}No sheet. ${val("+chargen")} first.`,
      );
      return;
    }

    if (!sw || sw === "list") {
      u.send(await renderLoadoutView(u));
      return;
    }

    if (sw === "catalog") {
      const cat = arg.split(/\s+/)[0]?.toLowerCase() ?? "";
      const rest = arg.split(/\s+/).slice(1).join(" ") || arg;
      const tables: Record<string, typeof FIREARMS> = {
        gun: FIREARMS,
        firearm: FIREARMS,
        firearms: FIREARMS,
        melee: MELEE,
        armor: ARMOR,
        armour: ARMOR,
        heavy: HEAVY,
        ammo: AMMO,
        mod: WEAPON_MODS,
        mods: WEAPON_MODS,
        drone: DRONES,
        drones: DRONES,
      };
      if (cat && tables[cat]) {
        u.send(
          listCat(
            cat.toUpperCase(),
            tables[cat],
            rest === cat ? "" : rest,
          ),
        );
        return;
      }
      u.send(listCat("GEAR CATALOG", allGearRows(), arg));
      return;
    }

    if (sw === "buy") {
      const res = await buyStreetItem(u, c, arg);
      u.send(res.msg);
      return;
    }

    if (sw === "add") {
      if (!isStaff(u)) {
        u.send(
          `${ERR}Staff only. ` +
            `${val("+market/buy")} or ` +
            `${val("+staff/gear <p>=slug")}`,
        );
        return;
      }
      if (!arg) {
        u.send(
          `${ERR}Need a name, or use ` +
            `${val("+staff/gear <player>=<slug>")}`,
        );
        return;
      }
      const slug = arg.toLowerCase().replace(/\s+/g, "-")
        .slice(0, 40);
      const obj = await createItem(u, u.me.id, {
        slug,
        name: arg.slice(0, 60),
        kind: "gear",
        load: 1,
      });
      if (!obj) {
        u.send(`${ERR}Could not mint item.`);
        return;
      }
      u.send(
        `${OK}Added ${val(displayName(obj))}. ` +
          `${dim("Prefer +staff/gear for catalog.")}`,
      );
      return;
    }

    if (sw === "remove") {
      const item = await resolveItemRef(u, u.me.id, arg);
      if (!item) {
        u.send(`${ERR}Not in loadout. Try ${val("inv")}.`);
        return;
      }
      const name = displayName(item);
      await destroyItem(u, item.id);
      u.send(`${OK}Destroyed ${val(name)}.`);
      await afterGearChange(u);
      return;
    }

    if (sw === "mod") {
      const parsed = parseHostModArg(arg);
      if (!parsed) {
        u.send(
          `${ERR}Usage: ${val("+gear/mod <host>=<mod>")}` +
            ` or ${val("+gear/mod <host>")}`,
        );
        return;
      }
      if (!parsed.mod) {
        const host = await resolveItemRef(u, u.me.id, parsed.host);
        if (!host) {
          u.send(`${ERR}Host not in loadout.`);
          return;
        }
        const mods = listHostMods(host);
        const lines = [
          header(`MODS — ${displayName(host)}`),
          ...(mods.length
            ? mods.map((m) => `  ${val(m)}`)
            : [`  ${dim("none")}`]),
          `  ${dim("+gear/mod host=mod · +gear/unmod host=mod")}`,
          header(),
        ];
        u.send(lines.join("\r\n"));
        return;
      }
      const r = await attachMod(
        u,
        u.me.id,
        parsed.host,
        parsed.mod,
      );
      if (!r.ok) {
        u.send(`${ERR}${r.error}`);
        return;
      }
      u.send(
        `${OK}Attached ${val(r.modName)}` +
          ` → ${val(displayName(r.host))}` +
          (itemData(r.host)?.mods?.length
            ? ` (${itemData(r.host)!.mods!.length} mods)`
            : ""),
      );
      await afterGearChange(u);
      return;
    }

    if (sw === "unmod") {
      const parsed = parseHostModArg(arg);
      if (!parsed?.mod) {
        u.send(
          `${ERR}Usage: ${val("+gear/unmod <host>=<mod>")}`,
        );
        return;
      }
      const r = await detachMod(
        u,
        u.me.id,
        parsed.host,
        parsed.mod,
      );
      if (!r.ok) {
        u.send(`${ERR}${r.error}`);
        return;
      }
      u.send(
        `${OK}Detached ${val(r.modName)}` +
          ` from ${val(displayName(r.host))}` +
          ` (loose in inv)`,
      );
      await afterGearChange(u);
      return;
    }

    if (sw === "load" || sw === "ammo" || sw === "chamber") {
      if (!arg) {
        u.send(
          `${ERR}Usage: ${val("+gear/load <gun>=<ammo>")}` +
            `\r\n  e.g. ${val("+gear/load link=hellfires")}` +
            ` · ${val("+gear/catalog ammo")}`,
        );
        return;
      }
      const r = await loadAmmoIntoGun(u, u.me.id, arg);
      if (!r.ok) {
        u.send(`${ERR}${r.error}`);
        return;
      }
      let extra = "";
      if (r.boxGone) {
        extra = ` ${dim("ammo box empty — tossed")}`;
      } else if (r.boxLeft != null && r.boxLeft >= 0) {
        extra = ` ${dim(`box ${r.boxLeft} left`)}`;
      }
      u.send(
        `${OK}Loaded ${val(r.ammoName)}` +
          ` into ${val(displayName(r.gun))}.` +
          extra +
          `\r\n  ${dim("inv shows ammo · +attack uses it")}`,
      );
      return;
    }

    if (sw === "unload" || sw === "unchamber") {
      if (!arg) {
        u.send(
          `${ERR}Usage: ${val("+gear/unload <gun>")}`,
        );
        return;
      }
      const gun = await resolveItemRef(u, u.me.id, arg);
      if (!gun) {
        u.send(`${ERR}Gun not found.`);
        return;
      }
      const d = itemData(gun);
      if (!d) {
        u.send(`${ERR}Not a Sprawl item.`);
        return;
      }
      if (!d.ammoSlug) {
        u.send(`${ARR}No specialty ammo loaded.`);
        return;
      }
      const was = d.ammoSlug;
      const clean = { ...d };
      delete clean.ammoSlug;
      await writeItemData(u, gun, clean);
      u.send(
        `${OK}Unloaded ${val(was)} from ` +
          `${val(displayName(gun))} (standard rounds).`,
      );
      return;
    }

    if (sw === "wear" || sw === "wield" || sw === "stow") {
      await setSlotSwitch(u, sw, arg);
      return;
    }

    u.send(`${ERR}Unknown switch.`);
  },
});
addCmd({
  name: "+aug",
  pattern: /^\+aug(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+aug[/<switch>] [slug]  — Cybernetic augmentations.

Switches:
  /catalog [filter]
  /install <slug>
  /remove <slug>

Examples:
  +aug/catalog
  +aug/install neurochem`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    if (!sw || sw === "list") {
      const lines = [header("AUGS")];
      for (const a of c.augs) {
        lines.push(`  ${a.name}`);
      }
      if (!c.augs.length) lines.push(`  ${dim("none")}`);
      lines.push(footer());
      u.send(lines.join("\r\n"));
      return;
    }
    if (sw === "catalog") {
      u.send(listCat("AUG CATALOG", AUGS, arg));
      return;
    }
    if (sw === "install") {
      const row = find("aug", arg) ?? findByName(AUGS, arg);
      if (!row) {
        u.send(`${ERR}Unknown aug.`);
        return;
      }
      if (c.augs.some((a) => a.slug === row.slug)) {
        u.send(`${ARR}Already installed.`);
        return;
      }
      const cost = Number(row.cost ?? 0);
      if (c.bityuan < cost) {
        u.send(`${ERR}Need ${val(cost)} b¥.`);
        return;
      }
      const item: IAugItem = {
        slug: row.slug,
        name: String(row.name),
        modStat: row.modStat ? String(row.modStat) : undefined,
        mod: row.mod != null ? Number(row.mod) : undefined,
      };
      await saveChar(u, {
        ...c,
        bityuan: c.bityuan - cost,
        augs: [...c.augs, item],
      });
      u.send(
        `${OK}Installed ${val(item.name)}` +
          ` (−${val(cost)} b¥). Not a carried Thing.`,
      );
      return;
    }
    if (sw === "remove") {
      const idx = c.augs.findIndex((a) =>
        a.slug === arg ||
        a.name.toLowerCase().includes(arg.toLowerCase())
      );
      if (idx < 0) {
        u.send(`${ERR}Not installed.`);
        return;
      }
      const augs = c.augs.slice();
      const gone = augs.splice(idx, 1)[0];
      await saveChar(u, { ...c, augs });
      u.send(`${OK}Removed ${val(gone.name)}.`);
      return;
    }
    u.send(`${ERR}Unknown switch.`);
  },
});

addCmd({
  name: "+shard",
  pattern: /^\+shard(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+shard[/<switch>] [slug]  — Savvy Jack skill shards.

Switches:
  /list /catalog /jack <slug> /eject <slug>

Examples:
  +shard/catalog
  +shard/jack kung-fu`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "list").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    const hasJack = c.augs.some((a) =>
      a.slug === "savvy-jack" || /savvy jack/i.test(a.name)
    );
    if (sw === "list") {
      u.send(
        [
          header("SHARDS"),
          ...c.shards.map((s) => `  ${val(s)}`),
          ...(c.shards.length
            ? []
            : [`  ${dim("none")}`]),
          footer()
        ].join("\r\n"),
      );
      return;
    }
    if (sw === "catalog") {
      u.send(listCat("SHARDWARE", SHARDS, arg));
      return;
    }
    if (sw === "jack") {
      if (!hasJack) {
        u.send(
          `${ERR}Need a Savvy Jack aug first` +
            ` (${val("+aug/install savvy-jack")}).`,
        );
        return;
      }
      const row = find("shard", arg) ?? findByName(SHARDS, arg);
      if (!row) {
        u.send(`${ERR}Unknown shard.`);
        return;
      }
      if (c.shards.includes(row.slug)) {
        u.send(`${ARR}Already jacked.`);
        return;
      }
      const cost = Number(row.cost ?? 0);
      if (c.bityuan < cost) {
        u.send(`${ERR}Need ${val(cost)} b¥.`);
        return;
      }
      await saveChar(u, {
        ...c,
        bityuan: c.bityuan - cost,
        shards: [...c.shards, row.slug],
      });
      u.send(`${OK}Jacked ${val(String(row.name))}.`);
      return;
    }
    if (sw === "eject") {
      const shards = c.shards.filter(
        (s) => s !== arg.toLowerCase(),
      );
      if (shards.length === c.shards.length) {
        u.send(`${ERR}Shard not loaded.`);
        return;
      }
      await saveChar(u, { ...c, shards });
      u.send(`${OK}Ejected ${val(arg)}.`);
      return;
    }
    u.send(`${ERR}Unknown switch.`);
  },
});


