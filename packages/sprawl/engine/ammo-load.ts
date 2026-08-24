/**
 * Load specialty ammo into a firearm Thing.
 * Resolves gun + ammo from inventory / catalog / market names.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  AMMO,
  MARKET,
  find,
  findByName,
  type Row,
} from "./catalog.ts";
import {
  carriedItems,
  displayName,
  itemData,
  itemDataRepaired,
  repairItemData,
  resolveItemRef,
  writeItemData,
  consumeUse,
} from "./items.ts";

const GUN_KINDS = new Set([
  "firearm",
  "heavy",
  "weapon",
]);

export type LoadAmmoResult =
  | {
    ok: true;
    gun: IDBObj;
    ammoSlug: string;
    ammoName: string;
    boxLeft?: number;
    boxGone?: boolean;
  }
  | { ok: false; error: string };

function isGunData(d: { kind?: string } | null): boolean {
  if (!d) return false;
  return GUN_KINDS.has(String(d.kind ?? ""));
}

/** Map free text / market slug → ammo catalog row. */
export function resolveAmmoRow(q: string): Row | undefined {
  const raw = q.toLowerCase().trim();
  if (!raw) return undefined;
  const bySlug = find("ammo", raw);
  if (bySlug) return bySlug;
  const byName = findByName(AMMO, raw);
  if (byName) return byName;
  // Market: "hellfires" category ammo or long names
  const mkt = MARKET.find((r) => {
    if (String(r.category ?? "").toLowerCase() !== "ammo") {
      return false;
    }
    const s = String(r.slug).toLowerCase();
    const n = String(r.name ?? "").toLowerCase();
    return s === raw || n === raw ||
      s.includes(raw) || n.includes(raw) ||
      raw.includes(s);
  });
  if (mkt) {
    const cat = find("ammo", String(mkt.slug)) ??
      findByName(AMMO, String(mkt.name ?? mkt.slug));
    if (cat) return cat;
    return {
      slug: String(mkt.slug),
      name: String(mkt.name ?? mkt.slug),
      effect: mkt.effect,
    };
  }
  // Partial ammo name
  const partial = AMMO.filter((a) => {
    const s = a.slug.toLowerCase();
    const n = String(a.name ?? "").toLowerCase();
    return s.includes(raw) || n.includes(raw) ||
      raw.includes(s);
  });
  if (partial.length === 1) return partial[0];
  return undefined;
}

/** Find carried ammo box matching slug/name. */
export async function findAmmoBox(
  u: IUrsamuSDK,
  ownerId: string,
  ammoSlug: string,
): Promise<IDBObj | null> {
  const items = await carriedItems(u, ownerId);
  const want = ammoSlug.toLowerCase();
  for (const o of items) {
    const d = itemData(o);
    if (!d) continue;
    const k = String(d.kind ?? "");
    const slug = (d.slug ?? "").toLowerCase();
    const nm = displayName(o).toLowerCase();
    const isAmmo = k === "ammo" || k === "consumable" ||
      /ammo|hellfire|shredder|hollow|round/i.test(slug + nm);
    if (!isAmmo) continue;
    if (
      slug === want ||
      slug.includes(want) ||
      want.includes(slug) ||
      nm.includes(want)
    ) {
      return o;
    }
  }
  return null;
}

/**
 * Load specialty ammo into gun.
 * arg forms: "gun=ammo" or "gun ammo"
 */
export async function loadAmmoIntoGun(
  u: IUrsamuSDK,
  ownerId: string,
  rawArg: string,
  opts: { requireBox?: boolean } = {},
): Promise<LoadAmmoResult> {
  let gunRef = "";
  let ammoRef = "";
  const arg = rawArg.trim();
  const eq = arg.indexOf("=");
  if (eq > 0) {
    gunRef = arg.slice(0, eq).trim();
    ammoRef = arg.slice(eq + 1).trim();
  } else {
    // "pkd hellfires" or "#3 hellfires"
    const parts = arg.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      gunRef = parts[0];
      ammoRef = parts.slice(1).join(" ");
    } else {
      return {
        ok: false,
        error: "Usage: +gear/load <gun>=<ammo> " +
          "(or +gear/load <gun> <ammo>)",
      };
    }
  }
  if (!gunRef || !ammoRef) {
    return {
      ok: false,
      error: "Usage: +gear/load <gun>=<ammo-slug>",
    };
  }

  const gun = await resolveItemRef(u, ownerId, gunRef);
  if (!gun) {
    return {
      ok: false,
      error: `Gun not found: ${gunRef}. Try inv #n or slug.`,
    };
  }

  let d = itemDataRepaired(gun) ?? itemData(gun);
  if (!d) {
    return { ok: false, error: "Not a Sprawl item." };
  }
  if (!isGunData(d)) {
    const fixed = repairItemData(d, {
      name: displayName(gun),
    });
    if (isGunData(fixed.data)) {
      d = fixed.data;
      await writeItemData(u, gun, d);
    }
  }
  if (!isGunData(d)) {
    return {
      ok: false,
      error:
        `${displayName(gun)} is not a firearm ` +
        `(kind ${d.kind}).`,
    };
  }

  // Ammo ref might be inventory #n box
  let box: IDBObj | null = null;
  let row: Row | undefined;
  if (/^#?\d+$/.test(ammoRef.trim())) {
    box = await resolveItemRef(u, ownerId, ammoRef);
    if (box) {
      const bd = itemData(box);
      row = resolveAmmoRow(bd?.slug ?? displayName(box)) ??
        resolveAmmoRow(displayName(box));
      if (!row && bd) {
        row = {
          slug: bd.slug,
          name: displayName(box),
        };
      }
    }
  }
  if (!row) {
    row = resolveAmmoRow(ammoRef);
  }
  if (!row) {
    // try inventory box by name
    box = box ?? await findAmmoBox(u, ownerId, ammoRef);
    if (box) {
      const bd = itemData(box);
      row = resolveAmmoRow(bd?.slug ?? "") ??
        resolveAmmoRow(displayName(box)) ?? {
        slug: bd?.slug ?? ammoRef.toLowerCase(),
        name: displayName(box),
      };
    }
  }
  if (!row) {
    return {
      ok: false,
      error:
        `Unknown ammo "${ammoRef}". ` +
        `Try +gear/catalog ammo or +market ammo.`,
    };
  }

  const ammoSlug = String(row.slug);
  const ammoName = String(row.name ?? ammoSlug);

  // Prefer consuming a carried box when present
  if (!box) {
    box = await findAmmoBox(u, ownerId, ammoSlug);
  }
  if (opts.requireBox && !box) {
    return {
      ok: false,
      error:
        `No ${ammoName} box in inv. ` +
        `Buy one: +market/buy ${ammoSlug}`,
    };
  }

  let boxLeft: number | undefined;
  let boxGone = false;
  if (box) {
    const bd = itemData(box);
    // Prefer spending uses on a carried box when present.
    if (bd?.uses != null) {
      const spent = await consumeUse(u, box);
      boxLeft = spent.destroyed ? 0 : spent.left;
      boxGone = spent.destroyed;
    }
  }

  const next = {
    ...d,
    ammoSlug,
    kind: d.kind === "gear" ? "firearm" : d.kind,
  };
  await writeItemData(u, gun, next);

  return {
    ok: true,
    gun,
    ammoSlug,
    ammoName,
    boxLeft,
    boxGone,
  };
}
