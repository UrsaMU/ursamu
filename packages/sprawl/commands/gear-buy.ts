/**
 * Shared street purchase — +gear/buy and +market/buy.
 */
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { ARR, ERR, OK, dim, val } from "./chrome.ts";
import type { IAugItem, ISprawlChar } from "../db/schemas.ts";
import { saveChar } from "../engine/sheet-io.ts";
import {
  createItem,
  displayName,
} from "../engine/items.ts";
import {
  AMMO,
  AUGS,
  BELONGINGS,
  FIREARMS,
  MARKET,
  MELEE,
  HEAVY,
  ARMOR,
  SHARDS,
  allGearRows,
  find,
  findByName,
  type Row,
} from "../engine/catalog.ts";
import {
  resolveStock,
  stockKind,
} from "../engine/market-stock.ts";
import { equipConsole, installSoftware } from "../engine/net.ts";

export type BuyResult =
  | { ok: true; msg: string; char: ISprawlChar }
  | { ok: false; msg: string };

function resolveRow(arg: string): Row | undefined {
  return resolveStock(arg) ??
    find("firearm", arg) ??
    find("melee", arg) ??
    find("armor", arg) ??
    find("heavy", arg) ??
    find("ammo", arg) ??
    find("mod", arg) ??
    find("drone", arg) ??
    find("aug", arg) ??
    find("shard", arg) ??
    find("market", arg) ??
    findByName(
      [...allGearRows(), ...MARKET, ...AUGS, ...SHARDS],
      arg,
    );
}

/**
 * Market rows lack combat fields. Match firearms/melee/armor
 * catalogs by name tokens so +attack gets bonus/range/mag.
 */
function enrichFromCombatCatalog(
  row: Row,
  kind: string,
): Row {
  const cat = String(row.category ?? kind ?? "").toLowerCase();
  let table: Row[] = [];
  if (cat === "firearm" || kind === "firearm") table = FIREARMS;
  else if (cat === "melee" || kind === "melee") table = MELEE;
  else if (cat === "heavy" || kind === "heavy") table = HEAVY;
  else if (cat === "armor" || kind === "armor") table = ARMOR;
  else return row;

  // Prefer catalog slug if market slug already matches
  const bySlug = table.find((t) => t.slug === row.slug);
  if (bySlug) return { ...bySlug, ...row, ...bySlug };

  const name = String(row.name ?? "").toLowerCase();
  // Token overlap: "orchard machine link" ↔ catalog names
  const tokens = name
    .replace(/®/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
  let best: Row | undefined;
  let bestScore = 0;
  for (const t of table) {
    const blob = `${t.slug} ${t.name}`.toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (blob.includes(tok)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (best && bestScore >= 2) {
    // Catalog wins combat fields; keep market name/slug for display
    return {
      ...best,
      slug: row.slug,
      name: row.name,
      cost: row.cost ?? best.cost,
      category: row.category ?? best.category,
      book: row.book ?? best.book,
    };
  }
  return row;
}

/** Match market general goods to belongings (lazarus, drugs). */
function enrichFromBelongings(row: Row): Row {
  if (row.useEffect || row.uses != null || row.usesDice) {
    return row;
  }
  const slug = String(row.slug ?? "").toLowerCase();
  const name = String(row.name ?? "").toLowerCase();
  const hit = BELONGINGS.find((b) => {
    const bs = String(b.slug).toLowerCase();
    const bn = String(b.name ?? "").toLowerCase();
    if (slug.includes(bs) || bs.includes(slug)) return true;
    if (name.includes(bn) || bn.includes(name)) return true;
    // token: lazarus, hyperdex, yeheyuan, destress
    const keys = bs.split("-").filter((t) => t.length >= 4);
    return keys.some((k) => slug.includes(k) || name.includes(k));
  });
  if (!hit) return row;
  return {
    ...hit,
    ...row,
    slug: row.slug,
    name: row.name,
    cost: row.cost ?? hit.cost,
    useEffect: hit.useEffect ?? row.useEffect,
    uses: hit.uses ?? row.uses,
    usesDice: hit.usesDice ?? row.usesDice,
    unit: hit.unit ?? row.unit,
    kind: hit.kind ?? row.kind,
    load: hit.load ?? row.load ?? 1,
  };
}

function gearKind(row: Row): string {
  if (find("firearm", row.slug)) return "firearm";
  if (find("melee", row.slug)) return "melee";
  if (find("armor", row.slug)) return "armor";
  if (find("heavy", row.slug)) return "heavy";
  if (find("drone", row.slug)) return "drone";
  if (find("ammo", row.slug)) return "ammo";
  if (find("mod", row.slug)) return "mod";
  if (find("aug", row.slug)) return "aug";
  if (find("shard", row.slug)) return "shard";
  const cat = String(row.category ?? "").toLowerCase();
  if (cat === "augmentation") return "aug-market";
  if (cat === "shardware") return "shard-market";
  if (cat === "firearm") return "firearm";
  if (cat === "melee") return "melee";
  if (cat === "armor") return "armor";
  if (cat === "heavy") return "heavy";
  if (cat === "ammo") return "ammo";
  if (cat === "mod") return "mod";
  return "gear";
}

/** Specialty ammo boxes: kind + charges for load tracking. */
function enrichAmmoBox(row: Row, kind: string): Row {
  if (kind !== "ammo" && String(row.category) !== "ammo") {
    return row;
  }
  const cat = find("ammo", String(row.slug)) ??
    findByName(AMMO, String(row.name ?? ""));
  return {
    ...(cat ?? {}),
    ...row,
    kind: "ammo",
    slug: String(row.slug),
    name: String(row.name ?? cat?.name ?? row.slug),
    // One "use" = one specialty load into a gun
    uses: row.uses ?? cat?.uses ?? 1,
    unit: row.unit ?? "box",
    load: row.load ?? 1,
  };
}

/** Spend b¥ and mint gear / install aug / jack shard. */
export async function buyStreetItem(
  u: IUrsamuSDK,
  c: ISprawlChar,
  rawArg: string,
): Promise<BuyResult> {
  const arg = rawArg.trim();
  if (!arg) {
    return {
      ok: false,
      msg: `${ERR}Usage: ${val("+market/buy <slug>")}` +
        `  ${dim("or +gear/buy <slug>")}`,
    };
  }
  const row = resolveRow(arg);
  if (!row) {
    return {
      ok: false,
      msg: `${ERR}Unknown stock. ` +
        `${val("+market")} or ${val("+market/info <q>")}`,
    };
  }
  const cost = Number(row.cost ?? 0);
  if (c.bityuan < cost) {
    return {
      ok: false,
      msg: `${ERR}Need ${val(cost)} b¥` +
        ` (have ${val(c.bityuan)}).`,
    };
  }
  const netK = stockKind(row);
  // Cyberspace console — pay and equip hull.
  if (netK === "console") {
    const eq = equipConsole(c, row.slug);
    if ("error" in eq) {
      return { ok: false, msg: `${ERR}${eq.error}` };
    }
    const next = {
      ...eq,
      bityuan: c.bityuan - cost,
    };
    await saveChar(u, next);
    return {
      ok: true,
      char: next,
      msg: `${OK}Bought & equipped ` +
        `${val(String(row.name))}` +
        ` (−${val(cost)} b¥ · ${val(next.bityuan)} left)` +
        ` ${dim("+console")}`,
    };
  }
  // Software — pay and load into equipped console.
  if (netK === "software") {
    const inst = installSoftware(c, row.slug);
    if ("error" in inst) {
      return { ok: false, msg: `${ERR}${inst.error}` };
    }
    const next = {
      ...inst,
      bityuan: c.bityuan - cost,
    };
    await saveChar(u, next);
    const n = (next.software ?? []).length;
    return {
      ok: true,
      char: next,
      msg: `${OK}Bought & loaded ` +
        `${val(String(row.name))}` +
        ` (−${val(cost)} b¥ · ${val(next.bityuan)} left)` +
        ` ${dim(n + " programs")}`,
    };
  }

  const kind = gearKind(row);

  // Sheet augs (catalog) — not carried Things.
  if (kind === "aug" || kind === "aug-market") {
    const augRow = find("aug", row.slug) ??
      findByName(AUGS, String(row.name)) ??
      (kind === "aug" ? row : undefined);
    if (augRow && find("aug", augRow.slug)) {
      if (c.augs.some((a) => a.slug === augRow.slug)) {
        return {
          ok: false,
          msg: `${ARR}Already installed.`,
        };
      }
      const item: IAugItem = {
        slug: augRow.slug,
        name: String(augRow.name),
        modStat: augRow.modStat
          ? String(augRow.modStat)
          : undefined,
        mod: augRow.mod != null
          ? Number(augRow.mod)
          : undefined,
      };
      const next = {
        ...c,
        bityuan: c.bityuan - cost,
        augs: [...c.augs, item],
      };
      await saveChar(u, next);
      return {
        ok: true,
        char: next,
        msg: `${OK}Installed ${val(item.name)}` +
          ` (−${val(cost)} b¥ · ${val(next.bityuan)} left)` +
          ` ${dim("sheet aug, not inv")}`,
      };
    }
    // Market-only chrome brand → carried Thing + tip.
  }

  if (kind === "shard" || kind === "shard-market") {
    const sh = find("shard", row.slug) ??
      findByName(SHARDS, String(row.name)) ??
      (kind === "shard" ? row : undefined);
    if (sh && find("shard", sh.slug)) {
      const hasJack = c.augs.some((a) =>
        a.slug === "savvy-jack" ||
        /savvy jack/i.test(a.name)
      );
      if (!hasJack) {
        return {
          ok: false,
          msg: `${ERR}Need Savvy Jack first` +
            ` (${val("+aug/install savvy-jack")}).`,
        };
      }
      if (c.shards.includes(sh.slug)) {
        return { ok: false, msg: `${ARR}Already jacked.` };
      }
      const next = {
        ...c,
        bityuan: c.bityuan - cost,
        shards: [...c.shards, sh.slug],
      };
      await saveChar(u, next);
      return {
        ok: true,
        char: next,
        msg: `${OK}Jacked ${val(String(sh.name))}` +
          ` (−${val(cost)} b¥ · ${val(next.bityuan)} left)`,
      };
    }
  }

  const itemKind = kind === "aug-market" || kind === "shard-market"
    ? "gear"
    : kind === "aug" || kind === "shard"
    ? "gear"
    : kind;
  // Enrich market rows from combat + belongings (consumables).
  let enriched = enrichFromCombatCatalog(row, itemKind);
  enriched = enrichFromBelongings(enriched);
  enriched = enrichAmmoBox(enriched, itemKind);
  const mintKind = String(enriched.kind ?? itemKind);
  const bonus = Number(
    enriched.bonus ??
      (mintKind === "gear" || mintKind === "ammo" ||
          mintKind === "mod"
        ? 0
        : 1),
  );
  const obj = await createItem(u, u.me.id, {
    slug: String(enriched.slug ?? row.slug),
    name: String(enriched.name ?? row.name),
    kind: mintKind,
    load: Number(
      enriched.load ?? row.load ?? (mintKind === "mod" ? 0 : 1),
    ),
    bonus,
    uses: enriched.uses ?? row.uses,
    usesDice: enriched.usesDice ?? row.usesDice,
    unit: enriched.unit ?? row.unit,
    useEffect: enriched.useEffect ?? row.useEffect,
    notes: mintKind === "mod" && (enriched.effect ?? row.effect)
      ? String(enriched.effect ?? row.effect)
      : enriched.notes != null
      ? String(enriched.notes)
      : row.notes != null
      ? String(row.notes)
      : undefined,
    tags: enriched.tags ?? row.tags,
    hostKinds: mintKind === "mod"
      ? (enriched.host ?? row.host)
      : undefined,
    category: enriched.category ?? row.category,
    ammoSlug: enriched.ammoSlug ?? row.ammoSlug,
    rangeM: enriched.rangeM ?? row.rangeM,
    statMods: enriched.statMods ?? row.statMods,
    modStat: enriched.modStat ?? row.modStat,
    mod: enriched.mod ?? row.mod,
    loadoutMult: enriched.loadoutMult ?? row.loadoutMult,
    loadoutBonus: enriched.loadoutBonus ?? row.loadoutBonus,
    bonusWhen: enriched.bonusWhen ?? row.bonusWhen ??
      (mintKind === "armor" ? "worn" : undefined),
  });
  if (!obj) {
    return { ok: false, msg: `${ERR}Could not mint item.` };
  }
  const next = {
    ...c,
    bityuan: c.bityuan - cost,
    loadout: [],
  };
  await saveChar(u, next);
  const tip = itemKind === "mod"
    ? ` — ${val("+gear/mod <gun>=")}slug`
    : itemKind === "armor"
    ? ` — ${val("wear " + row.slug)} or ${val("inv")}`
    : itemKind === "firearm" || itemKind === "melee" ||
        itemKind === "heavy"
    ? ` — ${val("wield " + row.slug)} or ${val("inv")}`
    : ` — ${val("inv")}`;
  return {
    ok: true,
    char: next,
    msg: `${OK}Bought ${val(displayName(obj))}` +
      ` for ${val(cost)} b¥` +
      ` (${val(next.bityuan)} left)${tip}`,
  };
}
