/**
 * +market/want, +market/wants, +market/cancelwant — Buy Order / Wanted List
 */
import { addCmd, DBO } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter, IWantAd, IListing } from "../db/schemas.ts";
import { bar, hdr, val, acc, dim, ARR, ERR, OK, tbl } from "./chargen.ts";

const wantDB = new DBO<IWantAd>("cpr.want_ads");

const WANT_MAX       = 5;
const WANT_EXPIRE_MS = 72 * 60 * 60 * 1000; // 72 hours

function fmtRemaining(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "expired";
  const totalH = Math.floor(ms / (60 * 60 * 1000));
  const d = Math.floor(totalH / 24);
  const h = totalH % 24;
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h`;
}

addCmd({
  name: "+market/want",
  pattern: /^\+market\/(want|wants|cancelwant)\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+market/<switch> [<arg>]  -- Buy orders / wanted ads.

Switches:
  /want <item>=<max price>  Post a buy order (max 5 active per player).
  /wants [<player>]         List your own or another player's active want ads.
  /cancelwant <id>          Cancel one of your own want ads.

Examples:
  +market/want Trauma Rippers=800   Post a want ad up to 800 eb.
  +market/wants                     List your own active want ads.
  +market/wants Rogue               List Rogue's active want ads.
  +market/cancelwant a1b2c3d4       Cancel want ad a1b2c3d4.`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    if (sw === "want")       { await postWantAd(u, arg); return; }
    if (sw === "wants")      { await listWantAds(u, arg); return; }
    if (sw === "cancelwant") { await cancelWantAd(u, arg); return; }
    u.send(`${ERR}Unknown switch ${val('"/' + sw + '"')}.`);
  },
});

async function postWantAd(u: IUrsamuSDK, arg: string): Promise<void> {
  const eqIdx = arg.lastIndexOf("=");
  if (eqIdx < 1) {
    u.send(`${ERR}Usage: ${val("+market/want <item>=<max price>")}`); return;
  }
  const itemName = arg.slice(0, eqIdx).trim();
  const priceStr = arg.slice(eqIdx + 1).trim();
  const maxPrice = parseInt(priceStr, 10);
  if (!itemName) { u.send(`${ERR}Item name cannot be empty.`); return; }
  if (isNaN(maxPrice) || maxPrice < 1) {
    u.send(`${ERR}Max price must be a positive number.`); return;
  }

  const active = await wantDB.find({ buyerId: u.me.id, fulfilled: false });
  const live   = active.filter((w) => w.expiresAt > Date.now());
  if (live.length >= WANT_MAX) {
    u.send(`${ERR}You already have ${val(String(WANT_MAX))} active want ads.`);
    u.send(`  ${ARR}${val("+market/cancelwant <id>")} ${dim("to remove one first.")}`);
    return;
  }

  const now = Date.now();
  const ad: IWantAd = {
    id: crypto.randomUUID(),
    buyerId:   u.me.id,
    buyerName: u.util.displayName(u.me, u.me),
    itemName,
    maxPrice,
    createdAt: now,
    expiresAt: now + WANT_EXPIRE_MS,
    fulfilled: false,
  };
  await wantDB.create(ad);

  u.send([
    `${OK}Want ad posted.`,
    `  ${dim("ID:")}     ${val(ad.id.slice(0, 8))}`,
    `  ${dim("ITEM:")}   ${acc(itemName)}`,
    `  ${dim("MAX:")}    ${val(maxPrice.toLocaleString())} ${dim("eb")}`,
    `  ${dim("EXPIRES:")} ${dim(fmtRemaining(ad.expiresAt))}`,
  ].join("\r\n"));
}

async function listWantAds(u: IUrsamuSDK, arg: string): Promise<void> {
  let targetId   = u.me.id;
  let targetName = u.util.displayName(u.me, u.me);

  if (arg) {
    const t = await u.util.target(u.me, arg, true);
    if (!t) { u.send(`${ERR}Player ${val('"' + arg + '"')} not found.`); return; }
    targetId   = t.id;
    targetName = u.util.displayName(t, u.me);
  }

  const all  = await wantDB.find({ buyerId: targetId, fulfilled: false });
  const live = all.filter((w) => w.expiresAt > Date.now());

  const title = `WANT ADS -- ${targetName.replace(/%c[a-z]|%[rtnb]/gi, "").toUpperCase()}`;
  const lines: string[] = [bar(), hdr(title), bar()];

  if (live.length === 0) {
    lines.push(`  ${dim("No active want ads.")}`);
  } else {
    lines.push(
      ...tbl(
        [
          { label: "ID",        width: 8  },
          { label: "ITEM",      width: 22 },
          { label: "MAX PRICE", width: 10, align: "right" as const },
          { label: "EXPIRES",   width: 8  },
        ],
        live.map((w) => [
          dim(w.id.slice(0, 8)),
          acc(w.itemName),
          val(w.maxPrice.toLocaleString() + " eb"),
          dim(fmtRemaining(w.expiresAt)),
        ]),
      ),
    );
  }

  lines.push(bar());
  lines.push(
    `  ${ARR}${val("+market/want <item>=<price>")}` +
    `  ${dim("--")}  ${val("+market/cancelwant <id>")}`,
  );
  u.send(lines.join("\r\n"));
}

async function cancelWantAd(u: IUrsamuSDK, arg: string): Promise<void> {
  if (!arg) {
    u.send(`${ERR}Usage: ${val("+market/cancelwant <id>")}`); return;
  }
  const all = await wantDB.find({ buyerId: u.me.id, fulfilled: false });
  const ad  = all.find((w) => w.id.startsWith(arg));
  if (!ad) {
    u.send(`${ERR}No active want ad with ID ${val('"' + arg + '"')}.`); return;
  }
  await wantDB.delete({ id: ad.id });
  u.send(`${OK}Want ad for ${acc(ad.itemName)} cancelled.`);
}

/**
 * Called after a new listing is created in +market/sell.
 * Notifies buyers whose want ads match the new listing.
 */
export async function notifyWantAds(
  u: IUrsamuSDK,
  listing: IListing,
): Promise<void> {
  const now  = Date.now();
  const all  = await wantDB.find({ fulfilled: false });
  const live = all.filter((w) => w.expiresAt > now);
  const roomName = u.here.name ?? "somewhere";

  for (const ad of live) {
    const nameMatch = listing.itemName.toLowerCase().includes(ad.itemName.toLowerCase());
    const priceOk   = listing.price <= ad.maxPrice;
    if (!nameMatch || !priceOk) continue;
    u.send(
      `${ARR}${val("WANTED AD MATCH:")} ${acc(listing.itemName)} ` +
      `posted at ${val(listing.price.toLocaleString() + " eb")} ` +
      `in ${dim(roomName)} -- ${val("+market/browse")} to check it out.`,
      ad.buyerId,
    );
  }
}
