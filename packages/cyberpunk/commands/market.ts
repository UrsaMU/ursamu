/**
 * +market -- Fixer Night Market and Trading Commands
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter, IMarket, IListing, IGearItem } from "../db/schemas.ts";
import {
  canOpenNightMarket, canOpenMidnightMarket, resolveHaggle,
  createListing, canAfford, deductEB, MARKET_DURATION_MS, rollStartingStock,
} from "../engine/market.ts";
import { emitMarketOpened, emitMarketTransaction, emitMarketHaggle } from "../engine/emitters.ts";
import { val, acc, dim, ARR, ERR, OK, row } from "./chargen.ts";
import { fixerMarketCapacity, marketTierCost } from "../engine/roleCapacity.ts";
import { marketDB, listingDB, consignDB, browseMarket, compareMarkets } from "./market-browse.ts";
import { notifyWantAds } from "./market-want.ts";

addCmd({
  name: "+market",
  pattern: /^\+market(?:\/(open|close|list|sell|buy|haggle|browse|all|lock))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+market[/<switch>] [<argument>]  -- The gray market (Fixer Operators).

Switches:
  /open [midnight] [name]  Open a market stall here (Fixer Rank 5+).
                           Stall is permanent if you own/can edit the room.
                           Staff may add /dur Xh or /dur Xd to set duration.
  /close                   Shut down your market.
  /browse [name]           Browse stalls in area, or enter one by name.
  /all                     All listings across every stall — sorted by name.
  /sell <item>=<eb>=<cat>  Post an item to your open stall.
  /buy <listing_id>        Purchase a listing from any stall here.
  /haggle <listing_id>     Haggle on price (Fixer ability).
  /list                    Show your own active listings.
  /lock <expression>       Restrict who can see/enter your stall.
  /lock open               Remove the lock (public again).

Lock expressions use standard UrsaMU syntax.
  connected fixer+         Fixers only.
  wizard|admin             Staff only.
  #42                      Only object #42.
  open                     No restriction (default).

Staff always bypass locks; dark stalls show <dark> in browse.

Price categories: cheap everyday costly premium expensive very_expensive

Examples:
  +market/open                       Open an unnamed stall (Rank 5 req).
  +market/open Rogue's Stand         Open a named stall.
  +market/open midnight Black Site   Open a named Midnight Market (Rank 9).
  +market/browse                     List all open stalls in this area.
  +market/browse Rogue's Stand       Enter a specific stall.
  +market/all                        Compare prices across all stalls.
  +market/sell Pistol=500=costly     Post a pistol for 500 eb.
  +market/buy abc123                 Buy listing abc123 from any stall.
  +market/haggle abc123              Haggle on listing abc123.
  +market/lock connected fixer+      Only Fixers can see this stall.
  +market/lock open                  Remove lock, stall is public.`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "browse").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    if (sw === "open")              { await openMarket(u, cpr, arg); return; }
    if (sw === "close")             { await closeMarket(u); return; }
    if (sw === "browse" || !sw)     { await browseMarket(u, arg); return; }
    if (sw === "sell")              { await sellItem(u, cpr, arg); return; }
    if (sw === "buy")               { await buyItem(u, cpr, arg); return; }
    if (sw === "haggle")            { await haggleItem(u, cpr, arg); return; }
    if (sw === "list")              { await listMyItems(u); return; }
    if (sw === "all")               { await compareMarkets(u, arg); return; }
    if (sw === "lock")              { await lockMarket(u, arg); return; }
    u.send(`${ERR}Unknown switch ${val('"/' + sw + '"')}.`);
  },
});

/** Format milliseconds as a human-readable duration string. */
function formatDuration(ms: number): string {
  if (ms <= 0) return "expired";
  const h = Math.ceil(ms / (60 * 60 * 1000));
  if (h < 24) return `${h}h`;
  const d = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return `${d}d`;
}

/** Parse /dur Xh|Xd from the open arg string. Returns ms or null. Staff-only. */
function parseDuration(arg: string): { ms: number | null; stripped: string } {
  const match = arg.match(/\/dur\s+(\d+)(h|d)/i);
  if (!match) return { ms: null, stripped: arg };
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const ms = unit === "d" ? n * 24 * 60 * 60 * 1000 : n * 60 * 60 * 1000;
  return { ms, stripped: arg.replace(match[0], "").trim() };
}

async function openMarket(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  const staff = isStaff(u);
  const { ms: staffDur, stripped } = staff ? parseDuration(arg) : { ms: null, stripped: arg };

  const words      = stripped.trim().split(/\s+/);
  const isMidnight = words[0]?.toLowerCase() === "midnight";
  const rawName    = (isMidnight ? words.slice(1) : words).join(" ");
  const marketName = rawName.slice(0, 40) || undefined;

  if (isMidnight && !canOpenMidnightMarket(cpr)) {
    u.send(`${ERR}Midnight Market requires Fixer Rank ${val("9")}.`); return;
  }
  if (!isMidnight && !canOpenNightMarket(cpr)) {
    u.send(`${ERR}Night Market requires Fixer Rank ${val("5")}.`); return;
  }
  const activeMarkets = await marketDB.find({ fixerId: u.me.id, active: true });
  const tier: "night" | "midnight" = isMidnight ? "midnight" : "night";
  const newCost = marketTierCost(tier);
  const usedPoints = activeMarkets.reduce((sum: number, m: IMarket) => sum + marketTierCost(m.tier), 0);
  const capacity = fixerMarketCapacity(cpr.roleRank);
  if (usedPoints + newCost > capacity) {
    u.send([
      `${ERR}Stall capacity reached.`,
      row("RANK",     val(String(cpr.roleRank))),
      row("CAPACITY", `${val(String(usedPoints))} / ${val(String(capacity))} ${dim("points used")}`),
      `  ${ARR}${val("+market/list")} ${dim("to see your active stalls.")}`,
    ].join("\r\n")); return;
  }

  const established = await u.canEdit(u.me, u.here);
  const expiresAt = established
    ? Number.MAX_SAFE_INTEGER
    : Date.now() + (staffDur ?? MARKET_DURATION_MS);

  const marketId = crypto.randomUUID();
  const stallName = marketName
    ?? `${u.util.displayName(u.me, u.me)}'s ${isMidnight ? "Midnight Market" : "Night Market"}`;

  const stall = await u.db.create({
    name: stallName,
    flags: new Set(["thing", "cpr-market-stall"]),
    location: u.here.id,
    state: { cpr: { marketId } },
    contents: [],
  });

  const market: IMarket = {
    id: marketId, stallId: stall.id,
    roomId: u.here.id, fixerId: u.me.id,
    fixerName: u.util.displayName(u.me, u.me), fixerRank: cpr.roleRank,
    tier: isMidnight ? "midnight" : "night", marketName,
    openedAt: Date.now(), expiresAt, active: true, established,
  };

  await marketDB.create(market);

  const stock = rollStartingStock(market.id, u.me.id, market.fixerName, market.tier);
  for (const listing of stock) await listingDB.create(listing);

  await emitMarketOpened(market.id, u.here.id, u.me.id, market.fixerName, market.tier, market.fixerRank);

  const openForStr = established ? acc("established") : dim(formatDuration(expiresAt - Date.now()));
  u.send([
    `${OK}${val(stallName)} is open for business.`,
    row("TIER",     market.tier === "midnight" ? acc("MIDNIGHT") : val("NIGHT")),
    row("STATUS",   established
      ? `${acc("ESTABLISHED")} ${dim("— permanent until closed")}`
      : `${dim("temporary —")} ${openForStr} ${dim("remaining")}`),
    row("CAPACITY", `${val(String(usedPoints + newCost))} / ${val(String(capacity))} ${dim("points")}`),
    row("STOCKED",  stock.length > 0 ? `${val(String(stock.length))} ${dim("items auto-stocked")}` : dim("empty")),
    `  ${ARR}${val("+market/sell <item>=<price>=<category>")}`,
  ].join("\r\n"));
  u.here.broadcast?.(`${ARR}${acc(stallName)} opens up. ${dim("+market/browse")} to see listings.`);
}

async function closeMarket(u: IUrsamuSDK): Promise<void> {
  const market = (await marketDB.find({ fixerId: u.me.id, active: true }))[0];
  if (!market) { u.send(`${ERR}You have no open stall.`); return; }
  await returnUnsoldConsignments(u, market.id);
  if (market.stallId) await u.db.destroy(market.stallId);
  await marketDB.update({ id: market.id }, { ...market, active: false });
  const stallName = market.marketName ?? `${market.fixerName}'s stall`;
  u.send(`${OK}${val(stallName)} is closed. The fixer packs up.`);
  u.here.broadcast?.(`${dim("[MARKET]")} ${acc(stallName)} has closed.`);
}

async function returnUnsoldConsignments(u: IUrsamuSDK, marketId: string): Promise<void> {
  const approved = await consignDB.find({ marketId, status: "approved" });
  for (const req of approved) {
    const listings = await listingDB.find({ marketId });
    const matched = listings.find((l: IListing) => l.consignedBy === req.consignorId && l.itemName === req.gearItemName);
    if (!matched) continue;
    const consignor = await u.util.target(u.me, req.consignorId, true);
    if (!consignor) continue;
    const cpr = consignor.state?.cpr as { gear?: IGearItem[] } | undefined;
    const gear: IGearItem[] = Array.isArray(cpr?.gear) ? (cpr.gear as IGearItem[]) : [];
    await u.db.modify(req.consignorId, "$set", { "state.cpr.gear": [...gear, req.gearItemSnapshot] });
    await listingDB.delete({ id: matched.id });
    await consignDB.update({ id: req.id }, { ...req, status: "returned" });
    u.send(`${OK}Your consigned ${val(req.gearItemName)} was returned — stall closed.`, req.consignorId);
  }
}

async function sellItem(u: IUrsamuSDK, _cpr: ICPRCharacter, arg: string): Promise<void> {
  const market = (await marketDB.find({ fixerId: u.me.id, active: true }))[0];
  if (!market) { u.send(`${ERR}You don't have an open stall. Use ${val("+market/open")} first.`); return; }

  const parts = arg.split("=");
  if (parts.length < 3) {
    u.send(`${ERR}Usage: ${val("+market/sell <item>=<price>=<category>")}`); return;
  }
  const [itemName, priceStr, priceCategory] = parts;
  const price = parseInt(priceStr, 10);
  if (isNaN(price) || price < 1) { u.send(`${ERR}Price must be a positive number.`); return; }

  const listing = createListing(market.id, u.me.id, u.util.displayName(u.me, u.me),
    itemName.trim(), "", price, priceCategory.trim().toLowerCase());
  await listingDB.create(listing);
  await notifyWantAds(u, listing);
  u.send([
    `  ${OK}${val(listing.itemName)} posted.`,
    row("PRICE",    `${val(price.toLocaleString())} ${dim("eb")}`),
    row("CATEGORY", dim(priceCategory.trim())),
    row("LISTING",  val(listing.id.slice(0, 8))),
  ].join("\r\n"));
}

const isStaff = (u: IUrsamuSDK) => u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");

async function passesLock(u: IUrsamuSDK, market: IMarket): Promise<boolean> {
  if (!market.lock || market.lock === "open") return true;
  if (market.fixerId === u.me.id) return true;
  if (isStaff(u)) return true;
  return await u.checkLock(u.me, market.lock);
}

async function lockMarket(u: IUrsamuSDK, arg: string): Promise<void> {
  const market = (await marketDB.find({ fixerId: u.me.id, active: true }))[0];
  if (!market) { u.send(`${ERR}You have no open stall.`); return; }
  const expr = arg.trim();
  if (!expr) { u.send(`${ARR}Usage: ${val("+market/lock <expression>")} or ${val("+market/lock open")}`); return; }
  const newLock = expr.toLowerCase() === "open" ? undefined : expr;
  await marketDB.update({ id: market.id }, { ...market, lock: newLock });
  const stallName = market.marketName ?? `${market.fixerName}'s stall`;
  if (newLock) {
    u.send(`${OK}${val(stallName)} locked. ${dim("Expression:")} ${val(newLock)}`);
  } else {
    u.send(`${OK}${val(stallName)} is now public.`);
  }
}

/** Find a listing by ID prefix — only across stalls the player can access. */
async function findListing(u: IUrsamuSDK, idPrefix: string): Promise<{ listing: IListing; market: IMarket } | null> {
  const markets = await marketDB.find({ roomId: u.here.id, active: true });
  for (const mkt of markets) {
    if (!(await passesLock(u, mkt))) continue;
    const found = (await listingDB.find({ marketId: mkt.id }))
      .find((l: IListing) => l.id.startsWith(idPrefix));
    if (found) return { listing: found, market: mkt };
  }
  return null;
}

async function buyItem(u: IUrsamuSDK, cpr: ICPRCharacter, idPrefix: string): Promise<void> {
  if (!idPrefix) { u.send(`${ARR}Specify listing ID: ${val("+market/buy <id>")}`); return; }
  const found = await findListing(u, idPrefix);
  if (!found) { u.send(`${ERR}No listing ${val('"' + idPrefix + '"')} in any stall here.`); return; }
  const { listing, market } = found;

  if (!canAfford(cpr, listing.price)) {
    u.send(`${ERR}Can't afford ${val(listing.price.toLocaleString())} ${dim("eb")}. Balance: ${val(cpr.eurodollars.toLocaleString())} ${dim("eb")}.`); return;
  }

  const newEB = deductEB(cpr.eurodollars, listing.price);
  await u.db.modify(u.me.id, "$set", { "state.cpr.eurodollars": newEB });
  if (listing.consignedBy && listing.consignorCut !== undefined) {
    const consignorShare = Math.round(listing.price * listing.consignorCut / 100);
    const fixerShare = listing.price - consignorShare;
    await u.db.modify(listing.consignedBy, "$inc", { "state.cpr.eurodollars": consignorShare });
    await u.db.modify(listing.sellerId, "$inc", { "state.cpr.eurodollars": fixerShare });
    u.send(
      `${OK}${acc(u.util.displayName(u.me, u.me))} bought your consigned ` +
      `${val(listing.itemName)} — ${val(consignorShare.toLocaleString())} ${dim("eb to you")}.`,
      listing.consignedBy,
    );
  } else {
    await u.db.modify(listing.sellerId, "$inc", { "state.cpr.eurodollars": listing.price });
  }
  await listingDB.delete({ id: listing.id });
  await emitMarketTransaction(market.id, u.me.id, u.util.displayName(u.me, u.me),
    listing.sellerId, listing.sellerName, listing.itemName, listing.price);

  u.send([
    `  ${OK}Transaction complete.`,
    row("ITEM",    acc(listing.itemName)),
    row("PAID",    `${val(listing.price.toLocaleString())} ${dim("eb")}`),
    row("BALANCE", `${val(newEB.toLocaleString())} ${dim("eb")}`),
  ].join("\r\n"));
  u.send(`${OK}${acc(u.util.displayName(u.me, u.me))} bought your ${val(listing.itemName)} for ${val(listing.price.toLocaleString())} ${dim("eb")}.`, listing.sellerId);
}

async function haggleItem(u: IUrsamuSDK, cpr: ICPRCharacter, idPrefix: string): Promise<void> {
  if (cpr.role !== "fixer") { u.send(`${ERR}Only Fixers can haggle.`); return; }
  if (!idPrefix) { u.send(`${ARR}Specify listing ID: ${val("+market/haggle <id>")}`); return; }

  const found = await findListing(u, idPrefix);
  if (!found) { u.send(`${ERR}No listing ${val('"' + idPrefix + '"')} in any stall here.`); return; }
  const { listing, market } = found;

  const result = resolveHaggle(cpr, listing.price);
  await emitMarketHaggle(market.id, u.me.id, u.util.displayName(u.me, u.me),
    listing.id, result.roll, result.defenseTotal, result.success, result.discount);

  const lines = [
    row("HAGGLE", acc(listing.itemName)),
    row("ROLL",   `${val(String(result.roll))} ${dim("vs")} ${val(String(result.defenseTotal))}`),
  ];
  if (result.success) {
    lines.push(
      row("RESULT",    `${OK}${dim("Price dropped")}`),
      row("NEW PRICE", `${val(result.newPrice.toLocaleString())} ${dim("eb")}  ${dim("(" + result.discount + "% off)")}`),
    );
    await listingDB.update({ id: listing.id }, { ...listing, price: result.newPrice });
  } else {
    lines.push(row("RESULT", `${ERR}${dim("No deal.")}`));
  }
  u.send(lines.join("\r\n"));
}

async function listMyItems(u: IUrsamuSDK): Promise<void> {
  const allListings = await listingDB.find({ sellerId: u.me.id });
  if (allListings.length === 0) {
    u.send(`${ARR}You have no active listings on the gray market.`); return;
  }
  const lines = allListings.map((l: IListing) =>
    row(dim(l.id.slice(0, 8)), `${acc(l.itemName)}  ${val(l.price.toLocaleString())} ${dim("eb")}`),
  );
  u.send(lines.join("\r\n"));
}
