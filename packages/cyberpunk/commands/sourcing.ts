/**
 * +source -- Fixer Operator Sourcing Roll (CPR p.159)
 *
 * Allows Fixers to privately source items not on any active market.
 * Rolls COOL + Streetwise + black_market_contacts + 1d10 vs tier DV.
 */
import { addCmd, DBO } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter, PriceCategory, ISourcingListing } from "../db/schemas.ts";
import { skillCheck } from "../engine/dice.ts";
import {
  bar, div, hdr, val, acc, bad, dim, lbl, row, tbl, wrap, ARR, ERR, OK,
} from "./chargen.ts";

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCING_DV: Record<PriceCategory, number> = {
  cheap: 9,
  everyday: 9,
  costly: 13,
  premium: 15,
  expensive: 17,
  very_expensive: 19,
  luxury: 21,
  super_luxury: 29,
};

const SOURCING_PRICE: Record<PriceCategory, number> = {
  cheap: 10,
  everyday: 50,
  costly: 100,
  premium: 500,
  expensive: 1000,
  very_expensive: 5000,
  luxury: 10000,
  super_luxury: 50000,
};

const RANK_TIER_CAP: PriceCategory[] = [
  "costly",       // rank 1 (index 0)
  "costly",       // rank 2
  "costly",       // rank 3
  "costly",       // rank 4
  "expensive",    // rank 5
  "expensive",    // rank 6
  "expensive",    // rank 7
  "super_luxury", // rank 8
  "super_luxury", // rank 9
  "super_luxury", // rank 10
];

const TIER_ORDER: PriceCategory[] = [
  "cheap", "everyday", "costly", "premium",
  "expensive", "very_expensive", "luxury", "super_luxury",
];

const MAX_ACTIVE_LISTINGS = 3;
const COOLDOWN_MS = 60 * 60 * 1000;       // 1 hour
const LISTING_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const sourcingDB = new DBO<ISourcingListing>("cpr.sourcing");

// ── Helpers ───────────────────────────────────────────────────────────────────

const tierIndex = (t: PriceCategory): number => TIER_ORDER.indexOf(t);

const rankCap = (rank: number): PriceCategory =>
  RANK_TIER_CAP[Math.max(0, Math.min(rank - 1, 9))];

const isValidTier = (s: string): s is PriceCategory =>
  TIER_ORDER.includes(s as PriceCategory);

const activeListings = async (fixerId: string): Promise<ISourcingListing[]> => {
  const now = Date.now();
  const all = await sourcingDB.find({ fixerId });
  return all.filter((l) => !l.purchased && l.expiresAt > now);
};

// ── Roll display ──────────────────────────────────────────────────────────────

const rv = (n: number | string) => val(String(n));
const rc = (label: string, width: number) =>
  ({ label, width, align: "right" as const });

function showRoll(opts: {
  fixerName: string;
  itemName: string;
  tierLabel: string;
  roll: number;
  total: number;
  dv: number;
  success: boolean;
}): string {
  const resultCell = opts.success ? acc("SOURCED!") : bad("NO CONTACT");
  const lines = [
    div(),
    `  ${lbl("OPERATOR")}  ${val(opts.fixerName)} ${lbl(">>")} sourcing ${val(opts.itemName)} (${dim(opts.tierLabel)})`,
    ...tbl(
      [rc("ROLL", 6), rc("TOTAL", 6), rc("DV", 4), rc("RESULT", 12)],
      [[rv(opts.roll), rv(opts.total), rv(opts.dv), resultCell]],
    ),
    div(),
  ];
  return lines.join("\r\n");
}

// ── Switch handlers ───────────────────────────────────────────────────────────

async function handleSource(u: IUrsamuSDK): Promise<void> {
  const raw  = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const eqIdx = raw.indexOf("=");
  if (eqIdx < 0) {
    u.send(`${ERR}Usage: +source <item name>=<price category>`);
    return;
  }
  const itemName  = raw.slice(0, eqIdx).trim();
  const tierInput = raw.slice(eqIdx + 1).trim().toLowerCase();

  if (!itemName) { u.send(`${ERR}Item name cannot be empty.`); return; }
  if (!isValidTier(tierInput)) {
    u.send(`${ERR}Unknown price category. Valid: cheap, everyday, costly, premium, expensive, very_expensive, luxury, super_luxury`);
    return;
  }

  const cpr = u.me.state?.cpr as ICPRCharacter | undefined;
  if (!cpr || cpr.role !== "fixer") {
    u.send(`${ERR}Only Fixers can use the sourcing system.`);
    return;
  }

  const cap = rankCap(cpr.roleRank);
  if (tierIndex(tierInput) > tierIndex(cap)) {
    u.send(`${ERR}Your Operator rank (${cpr.roleRank}) can only source up to ${val(cap)}.`);
    return;
  }

  const lastAttempt = (cpr.roleData?.lastSourceAttempt as number | undefined) ?? 0;
  const elapsed = Date.now() - lastAttempt;
  if (elapsed < COOLDOWN_MS) {
    const minLeft = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
    u.send(`${ERR}Cooldown active. Try again in ${val(String(minLeft))} minute(s).`);
    return;
  }

  const active = await activeListings(u.me.id);
  if (active.length >= MAX_ACTIVE_LISTINGS) {
    u.send(`${ERR}You already have ${MAX_ACTIVE_LISTINGS} active sourcing listings. Buy or wait for them to expire.`);
    return;
  }

  const cool   = cpr.stats.cool;
  const sw     = cpr.skills["streetwise"] ?? 0;
  const bmc    = cpr.skills["black_market_contacts"] ?? 0;
  const dv     = SOURCING_DV[tierInput];
  const result = skillCheck(cool, sw + bmc, dv);

  await u.db.modify(u.me.id, "$set", { "state.cpr.roleData.lastSourceAttempt": Date.now() });

  const rollDisplay = showRoll({
    fixerName: u.util.displayName(u.me, u.me),
    itemName,
    tierLabel: tierInput,
    roll: result.roll,
    total: result.total,
    dv,
    success: result.success === true,
  });

  if (!result.success) {
    u.send(rollDisplay);
    u.send(`${ERR}No contacts came through. Better luck next time, choom.`);
    return;
  }

  const now = Date.now();
  const listing: ISourcingListing = {
    id: crypto.randomUUID(),
    fixerId: u.me.id,
    fixerName: u.util.displayName(u.me, u.me),
    itemName,
    itemDescription: `Sourced item: ${itemName}`,
    price: SOURCING_PRICE[tierInput],
    priceCategory: tierInput,
    createdAt: now,
    expiresAt: now + LISTING_TTL_MS,
    purchased: false,
  };
  await sourcingDB.create(listing);

  u.send([
    rollDisplay,
    bar(),
    hdr("SOURCING SUCCESS"),
    bar(),
    row("ITEM",       val(itemName)),
    row("TIER",       val(tierInput)),
    row("PRICE",      val(`${listing.price.toLocaleString()} eb`)),
    row("LISTING ID", dim(listing.id)),
    row("EXPIRES",    dim("24 hours")),
    div(),
    ...wrap("Use +source/buy <id> to purchase this sourced item.", 74),
    bar(),
  ].join("\r\n"));
}

async function handleList(u: IUrsamuSDK): Promise<void> {
  const active = await activeListings(u.me.id);
  if (!active.length) {
    u.send(`${ARR}You have no active sourcing listings.`);
    return;
  }
  const now = Date.now();
  const lines = [
    bar(),
    hdr("YOUR SOURCED LISTINGS"),
    bar(),
  ];
  for (const l of active) {
    const hoursLeft = Math.ceil((l.expiresAt - now) / 3600000);
    lines.push(row("ITEM",    val(l.itemName)));
    lines.push(row("PRICE",   val(`${l.price.toLocaleString()} eb`)));
    lines.push(row("TIER",    dim(l.priceCategory)));
    lines.push(row("EXPIRES", dim(`${hoursLeft}h`)));
    lines.push(row("ID",      dim(l.id)));
    lines.push(div());
  }
  lines.push(`  ${ARR}${val("+source/buy <id>")}  ${dim("-- purchase a listing")}`);
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

async function handleBuy(u: IUrsamuSDK): Promise<void> {
  const id = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  if (!id) { u.send(`${ERR}Usage: +source/buy <listing id>`); return; }

  const results = await sourcingDB.find({ id, fixerId: u.me.id });
  const listing = results[0];
  if (!listing) {
    u.send(`${ERR}Listing not found or does not belong to you.`);
    return;
  }
  if (listing.purchased) { u.send(`${ERR}That listing was already purchased.`); return; }
  if (listing.expiresAt <= Date.now()) { u.send(`${ERR}That listing has expired.`); return; }

  const cpr = u.me.state?.cpr as ICPRCharacter | undefined;
  if (!cpr) { u.send(`${ERR}No character found.`); return; }
  if (cpr.eurodollars < listing.price) {
    u.send(`${ERR}Insufficient funds. You need ${val(`${listing.price.toLocaleString()} eb`)}.`);
    return;
  }

  await sourcingDB.update({ id }, { ...listing, purchased: true });
  await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": -listing.price });

  u.send([
    `${OK}Purchase complete.`,
    `  ${lbl("ITEM")}   ${val(listing.itemName)}`,
    `  ${lbl("PRICE")}  ${val(`${listing.price.toLocaleString()} eb`)}`,
    `  ${dim("Coordinate with staff/GM to receive your item.")}`,
  ].join("\r\n"));
}

// ── Command registration ──────────────────────────────────────────────────────

addCmd({
  name: "+source",
  pattern: /^\+source(?:\/(buy|list))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+source[/buy|/list] <item>=<tier>  — Fixer Operator sourcing roll.

Attempt to source an item privately using your black market contacts.
Rolls COOL + Streetwise + black_market_contacts + 1d10 vs tier DV.
Success creates a private listing only you can see and buy (24h expiry).
Max 3 active listings. 1-hour cooldown between attempts.

Rank gates: rank 1-4 = costly max; rank 5-7 = expensive max; rank 8-10 = all.

Switches:
  /list   Show your active sourced listings.
  /buy    Purchase a sourced listing by ID.

Examples:
  +source Trauma Rippers=costly          Attempt to source costly item.
  +source Militech Apogee=very_expensive Source a high-tier item (rank 8+).
  +source/list                           View your active listings.
  +source/buy a1b2c3d4-...              Purchase the listing with that ID.`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    if (sw === "list") return await handleList(u);
    if (sw === "buy")  return await handleBuy(u);
    return await handleSource(u);
  },
});
