/**
 * Night Market — browse logic (multi-stall + single-stall views)
 */
import { DBO } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { IMarket, IListing, IConsignRequest } from "../db/schemas.ts";
import { bar, div, hdr, val, acc, dim, ylw, ARR, ERR, row, wrap, tbl } from "./chargen.ts";

interface IFilters {
  category?: string; under?: number; over?: number;
  search?: string; sort?: string;
}

function parseFilters(arg: string): { name: string; filters: IFilters } {
  const tokens = arg.trim().split(/\s+/).filter(Boolean);
  const filters: IFilters = {};
  const nameTokens: string[] = [];
  for (const t of tokens) {
    const m = t.match(/^(category|under|over|search|sort)=(.+)$/i);
    if (m) {
      const k = m[1].toLowerCase(); const v = m[2];
      if (k === "under") filters.under = parseInt(v, 10);
      else if (k === "over") filters.over = parseInt(v, 10);
      else if (k === "category") filters.category = v.toLowerCase();
      else if (k === "search") filters.search = v.toLowerCase();
      else if (k === "sort") filters.sort = v.toLowerCase();
    } else { nameTokens.push(t); }
  }
  return { name: nameTokens.join(" "), filters };
}

const CATEGORY_ORDER = ["cheap","everyday","costly","premium","expensive","very_expensive","luxury","super_luxury"];

function sortListings(listings: IListing[], sort?: string): IListing[] {
  const r = [...listings];
  if (sort === "price") return r.sort((a, b) => a.price - b.price);
  if (sort === "price_desc") return r.sort((a, b) => b.price - a.price);
  if (sort === "category") return r.sort((a, b) =>
    CATEGORY_ORDER.indexOf(a.priceCategory) - CATEGORY_ORDER.indexOf(b.priceCategory));
  return r.sort((a, b) => a.itemName.localeCompare(b.itemName));
}

function applyFilters<T extends IListing>(listings: T[], f: IFilters): T[] {
  let r = listings;
  if (f.category) r = r.filter((l) => l.priceCategory === f.category);
  if (f.under !== undefined) r = r.filter((l) => l.price <= f.under!);
  if (f.over !== undefined) r = r.filter((l) => l.price >= f.over!);
  if (f.search) r = r.filter((l) => l.itemName.toLowerCase().includes(f.search!));
  const sorted = [...r];
  if (f.sort === "price") sorted.sort((a, b) => a.price - b.price);
  else if (f.sort === "price_desc") sorted.sort((a, b) => b.price - a.price);
  else if (f.sort === "category") sorted.sort((a, b) =>
    CATEGORY_ORDER.indexOf(a.priceCategory) - CATEGORY_ORDER.indexOf(b.priceCategory));
  else sorted.sort((a, b) => a.itemName.localeCompare(b.itemName));
  return sorted;
}

function filterSummary(f: IFilters): string {
  const parts: string[] = [];
  if (f.category) parts.push(`category=${f.category}`);
  if (f.under !== undefined) parts.push(`under=${f.under}`);
  if (f.over !== undefined) parts.push(`over=${f.over}`);
  if (f.search) parts.push(`search=${f.search}`);
  if (f.sort) parts.push(`sort=${f.sort}`);
  return parts.join(" ");
}

export const marketDB  = new DBO<IMarket>("cpr.markets");
export const listingDB = new DBO<IListing>("cpr.listings");
export const consignDB = new DBO<IConsignRequest>("cpr.consign_requests");

const rc = (label: string, width: number) => ({ label, width, align: "right" as const });
const lc = (label: string, width: number) => ({ label, width });
const rv = (s: string) => val(s);

const isStaff = (u: IUrsamuSDK) =>
  u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");

async function passesLock(u: IUrsamuSDK, market: IMarket): Promise<boolean> {
  if (!market.lock || market.lock === "open") return true;
  if (market.fixerId === u.me.id) return true;
  if (isStaff(u)) return true;
  return await u.checkLock(u.me, market.lock);
}

export async function browseMarket(u: IUrsamuSDK, arg: string): Promise<void> {
  const { name, filters } = parseFilters(arg);
  const all = await marketDB.find({ roomId: u.here.id, active: true });

  // Resolve visibility: staff see all (with dark tag), others see only accessible
  const visible: IMarket[] = [];
  for (const mkt of all) {
    const passes = await passesLock(u, mkt);
    if (passes || isStaff(u)) visible.push(mkt);
  }

  if (visible.length === 0) {
    u.send(`${ERR}No markets are open in this area.`); return;
  }

  if (!name) {
    if (visible.length === 1) {
      if (!(await passesLock(u, visible[0]))) {
        u.send(`${ERR}That stall isn't open to you.`); return;
      }
      await browseStall(u, visible[0], filters); return;
    }
    await browseArea(u, visible); return;
  }

  const q = name.toLowerCase();
  const match = visible.find((m) =>
    (m.marketName ?? "").toLowerCase().includes(q) ||
    m.fixerName.toLowerCase().includes(q)
  );
  if (!match) {
    u.send(`${ERR}No market named ${val('"' + name + '"')} here. Use ${val("+market/browse")} to list all.`); return;
  }
  if (!(await passesLock(u, match))) {
    u.send(`${ERR}That stall isn't open to you.`); return;
  }
  await browseStall(u, match, filters);
}

export async function compareMarkets(u: IUrsamuSDK, filterArg = ""): Promise<void> {
  const { filters } = parseFilters(filterArg);
  const markets = await marketDB.find({ roomId: u.here.id, active: true });
  if (markets.length === 0) {
    u.send(`${ERR}No markets are open in this area.`); return;
  }

  const raw: Array<IListing & { stallName: string }> = [];
  for (const mkt of markets) {
    if (!(await passesLock(u, mkt))) continue;
    const stallName = mkt.marketName ?? `${mkt.fixerName}'s Stand`;
    const listings = await listingDB.find({ marketId: mkt.id });
    for (const l of listings) raw.push({ ...l, stallName });
  }

  if (raw.length === 0) {
    u.send(`${ERR}No listings posted in any stall here.`); return;
  }

  const allListings = applyFilters(raw, filters);

  if (allListings.length === 0) {
    u.send(`${ERR}No listings match those filters.`); return;
  }

  const summary = filterSummary(filters);
  const roomName = (u.here.name ?? "This Area").toUpperCase();
  const rows = allListings.map((l) => [
    dim(l.id.slice(0, 8)),
    acc(l.itemName),
    rv(l.price.toLocaleString()),
    dim(l.priceCategory),
    dim(l.stallName),
  ]);

  const lines: string[] = [
    bar(),
    hdr(`${roomName} -- ALL LISTINGS`),
    bar(),
  ];
  if (summary) lines.push(`  ${dim("filtered: " + summary)}`);
  lines.push(
    ...tbl(
      [
        lc("ID",       8),
        lc("ITEM",    20),
        rc("PRICE",    8),
        lc("CAT",     12),
        lc("STALL",   16),
      ],
      rows,
    ),
    bar(),
    `  ${ARR}${val("+market/buy <id>")}  ${dim("--")}  ${val("+market/haggle <id>")}`,
  );
  u.send(lines.join("\r\n"));
}

function fmtDur(ms: number): string {
  if (ms <= 0) return "expired";
  const h = Math.ceil(ms / (60 * 60 * 1000));
  if (h < 24) return `${h}h`;
  return `${Math.ceil(ms / (24 * 60 * 60 * 1000))}d`;
}

async function browseArea(u: IUrsamuSDK, markets: IMarket[]): Promise<void> {
  const areaRows: string[][] = [];
  for (const mkt of markets) {
    const listings = await listingDB.find({ marketId: mkt.id });
    const isDark = !!(mkt.lock && mkt.lock !== "open") && !(await passesLock(u, mkt));
    const rawName = mkt.marketName ?? `${mkt.fixerName}'s Stand`;
    const stallName = isDark ? `${acc(rawName)} ${dim("<dark>")}` : acc(rawName);
    const tierTag = mkt.tier === "midnight" ? acc("MIDNIGHT") : val("NIGHT");
    const status = mkt.established
      ? acc("EST")
      : dim(fmtDur(mkt.expiresAt - Date.now()));
    const count = isDark ? dim("?") : (listings.length > 0 ? val(String(listings.length)) : dim("0"));
    areaRows.push([stallName, dim(mkt.fixerName), tierTag, status, count]);
  }

  const roomName = (u.here.name ?? "This Area").toUpperCase();
  u.send([
    bar(),
    hdr(`${roomName} -- OPEN MARKETS`),
    bar(),
    ...tbl(
      [
        lc("STAND",  20),
        lc("FIXER",  14),
        lc("TIER",    8),
        lc("STATUS",  6),
        rc("ITEMS",   5),
      ],
      areaRows,
    ),
    bar(),
    `  ${ARR}${val("+market/browse <name>")}  ${dim("-- enter a stand")}  ${dim("|")}  ${val("+market/all")}  ${dim("-- compare all")}`,
  ].join("\r\n"));
}

async function browseStall(u: IUrsamuSDK, market: IMarket, filters: IFilters = {}): Promise<void> {
  const raw = await listingDB.find({ marketId: market.id });
  const listings = applyFilters(raw, filters);
  const summary = filterSummary(filters);
  const displayTitle = market.marketName
    ?? (market.tier === "midnight" ? "MIDNIGHT MARKET" : "NIGHT MARKET");

  const lines: string[] = [
    bar(),
    hdr(displayTitle.toUpperCase()),
    bar(),
    row("FIXER",    acc(market.fixerName)),
    row("TIER",     market.tier === "midnight" ? ylw("MIDNIGHT") : val("NIGHT")),
    row("STATUS",   market.established ? acc("ESTABLISHED") : dim(fmtDur(market.expiresAt - Date.now()) + " remaining")),
    row("LISTINGS", val(String(raw.length))),
    div(),
  ];

  if (summary) lines.push(`  ${dim("filtered: " + summary)}`);

  if (listings.length === 0) {
    const msg = raw.length === 0
      ? "Nothing posted yet. Check back soon."
      : "No listings match those filters.";
    lines.push(`  ${dim(msg)}`);
  } else {
    const stallRows = listings.map((l) => [
      dim(l.id.slice(0, 8)),
      acc(l.itemName),
      rv(l.price.toLocaleString()),
      dim(l.priceCategory),
      dim(l.sellerName),
    ]);
    lines.push(...tbl(
      [
        lc("ID",      8),
        lc("ITEM",   24),
        rc("PRICE",   8),
        lc("CAT",    14),
        lc("SELLER", 14),
      ],
      stallRows,
    ));
    for (const l of listings) {
      if (l.description) lines.push(...wrap(l.description, 74, "        "));
    }
  }
  lines.push(bar());
  lines.push(`  ${ARR}${val("+market/buy <id>")}  ${dim("--")}  ${val("+market/haggle <id>")}`);
  u.send(lines.join("\r\n"));
}
