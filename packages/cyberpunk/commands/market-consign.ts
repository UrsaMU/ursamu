/**
 * +consign -- Consignment system for Fixer Night Markets
 * Players submit gear for a Fixer to sell; Fixer approves/declines.
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter, IGearItem, IConsignRequest } from "../db/schemas.ts";
import { bar, hdr, val, acc, dim, ARR, ERR, OK, row, tbl } from "./chargen.ts";
import { marketDB, listingDB, consignDB } from "./market-browse.ts";
import { createListing } from "../engine/market.ts";

const isStaff = (u: IUrsamuSDK) =>
  u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");

addCmd({
  name: "+consign",
  pattern: /^\+consign(?:\/(submit|approve|decline|list|pending))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+consign[/<switch>] [<argument>]  -- Consign gear through a Fixer stall.

Switches:
  /submit <item>=<price>=<cat>  Submit a gear item to the stall here.
  /approve <request_id>         (Fixer) Approve and list a consign request.
  /decline <request_id>         (Fixer) Decline; item returned to owner.
  /list                         Show your own pending/approved consignments.
  /pending                      (Fixer) List all pending requests for your stall.

Examples:
  +consign/submit Militech Pistol=800=costly  Submit a pistol at 800 eb.
  +consign/pending                            See all pending requests.
  +consign/approve abc123                     Approve request abc123.
  +consign/decline abc123                     Decline and return the item.`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    if (sw === "submit")              { await submitConsign(u, cpr, arg); return; }
    if (sw === "approve")             { await approveConsign(u, cpr, arg); return; }
    if (sw === "decline")             { await declineConsign(u, cpr, arg); return; }
    if (sw === "list")                { await listMyConsign(u); return; }
    if (sw === "pending")             { await listPending(u, cpr); return; }
    u.send(`${ERR}Usage: ${val("+consign/submit|approve|decline|list|pending")}`);
  },
});

async function submitConsign(
  u: IUrsamuSDK, cpr: ICPRCharacter, arg: string,
): Promise<void> {
  const parts = arg.split("=");
  if (parts.length < 3) {
    u.send(`${ERR}Usage: ${val("+consign/submit <item>=<price>=<category>")}`); return;
  }
  const [rawName, priceStr, catRaw] = parts;
  const itemName = rawName.trim();
  const price    = parseInt(priceStr, 10);
  const category = catRaw.trim().toLowerCase();

  if (!itemName) { u.send(`${ERR}Item name is required.`); return; }
  if (isNaN(price) || price < 1) { u.send(`${ERR}Price must be a positive number.`); return; }

  const market = (await marketDB.find({ roomId: u.here.id, active: true }))[0];
  if (!market) { u.send(`${ERR}No active market stall in this area.`); return; }

  const gear: IGearItem[] = Array.isArray(cpr.gear) ? cpr.gear : [];
  const itemIdx = gear.findIndex(
    (g) => g.name.toLowerCase() === itemName.toLowerCase(),
  );
  if (itemIdx === -1) {
    u.send(`${ERR}You don't have ${val('"' + itemName + '"')} in your gear.`); return;
  }
  if (market.maxConsign !== undefined && price > market.maxConsign) {
    u.send(`${ERR}This stall's max consign price is ${val(market.maxConsign.toLocaleString())} ${dim("eb")}.`); return;
  }

  const gearItem = gear[itemIdx];
  const updatedGear = gear.filter((_, i) => i !== itemIdx);
  await u.db.modify(u.me.id, "$set", { "state.cpr.gear": updatedGear });

  const req: IConsignRequest = {
    id: crypto.randomUUID(),
    marketId:         market.id,
    fixerId:          market.fixerId,
    consignorId:      u.me.id,
    consignorName:    u.util.displayName(u.me, u.me),
    gearItemId:       gearItem.id,
    gearItemName:     gearItem.name,
    gearItemSnapshot: gearItem,
    askingPrice:      price,
    priceCategory:    category,
    requestedAt:      Date.now(),
    status:           "pending",
  };
  await consignDB.create(req);

  u.send([
    `${OK}Consignment submitted.`,
    row("ITEM",     acc(gearItem.name)),
    row("PRICE",    `${val(price.toLocaleString())} ${dim("eb")}`),
    row("CATEGORY", dim(category)),
    row("STALL",    val(market.marketName ?? market.fixerName)),
    `  ${ARR}Await Fixer approval. Item held until approved or declined.`,
  ].join("\r\n"));

  const fixerObj = await u.util.target(u.me, market.fixerId, true);
  if (fixerObj) {
    u.send(
      `${ARR}${acc(u.util.displayName(u.me, fixerObj))} wants to consign ` +
      `${val(gearItem.name)} at ${val(price.toLocaleString())} ${dim("eb")}.  ` +
      `${dim("req:")} ${val(req.id.slice(0, 8))}`,
      fixerObj.id,
    );
  }
}

async function approveConsign(
  u: IUrsamuSDK, cpr: ICPRCharacter, idPrefix: string,
): Promise<void> {
  if (!idPrefix) { u.send(`${ARR}Usage: ${val("+consign/approve <req_id>")}`); return; }

  const market = (await marketDB.find({ fixerId: u.me.id, active: true }))[0];
  if (!market) { u.send(`${ERR}You have no open stall.`); return; }
  if (cpr.role !== "fixer" && !isStaff(u)) {
    u.send(`${ERR}Only Fixers can approve consignments.`); return;
  }

  const all = await consignDB.find({ marketId: market.id, status: "pending" });
  const req = all.find((r: IConsignRequest) => r.id.startsWith(idPrefix));
  if (!req) {
    u.send(`${ERR}No pending request ${val('"' + idPrefix + '"')} in your stall.`); return;
  }

  const listing = createListing(
    market.id, u.me.id, u.util.displayName(u.me, u.me),
    req.gearItemName, "", req.askingPrice, req.priceCategory,
  );
  listing.consignedBy   = req.consignorId;
  listing.consignorCut  = 85;   // consignor keeps 85%; fixer earns 15%

  await listingDB.create(listing);
  await consignDB.update({ id: req.id }, { ...req, status: "approved" });

  u.send([
    `${OK}Consignment approved and listed.`,
    row("ITEM",    acc(req.gearItemName)),
    row("PRICE",   `${val(req.askingPrice.toLocaleString())} ${dim("eb")}`),
    row("LISTING", val(listing.id.slice(0, 8))),
    row("CUT",     `${val("85%")} ${dim("to consignor / 15% to you")}`),
  ].join("\r\n"));

  u.send(
    `${OK}Your ${val(req.gearItemName)} was approved by ` +
    `${acc(u.util.displayName(u.me, u.me))} and is now listed.`,
    req.consignorId,
  );
}

async function declineConsign(
  u: IUrsamuSDK, cpr: ICPRCharacter, idPrefix: string,
): Promise<void> {
  if (!idPrefix) { u.send(`${ARR}Usage: ${val("+consign/decline <req_id>")}`); return; }

  const market = (await marketDB.find({ fixerId: u.me.id, active: true }))[0];
  if (!market) { u.send(`${ERR}You have no open stall.`); return; }
  if (cpr.role !== "fixer" && !isStaff(u)) {
    u.send(`${ERR}Only Fixers can decline consignments.`); return;
  }

  const all = await consignDB.find({ marketId: market.id, status: "pending" });
  const req = all.find((r: IConsignRequest) => r.id.startsWith(idPrefix));
  if (!req) {
    u.send(`${ERR}No pending request ${val('"' + idPrefix + '"')} in your stall.`); return;
  }

  const consignorObj = await u.util.target(u.me, req.consignorId, true);
  if (consignorObj) {
    const ownerCpr = consignorObj.state?.cpr as { gear?: IGearItem[] } | undefined;
    const ownerGear: IGearItem[] = Array.isArray(ownerCpr?.gear) ? (ownerCpr!.gear as IGearItem[]) : [];
    await u.db.modify(req.consignorId, "$set", {
      "state.cpr.gear": [...ownerGear, req.gearItemSnapshot],
    });
    u.send(
      `${ERR}Your ${val(req.gearItemName)} consignment was declined by ` +
      `${acc(u.util.displayName(u.me, consignorObj))} — item returned.`,
      req.consignorId,
    );
  }
  await consignDB.update({ id: req.id }, { ...req, status: "declined" });
  u.send(`${OK}Consignment ${val(req.id.slice(0, 8))} declined. Item returned to owner.`);
}

async function listMyConsign(u: IUrsamuSDK): Promise<void> {
  const all = await consignDB.find({ consignorId: u.me.id });
  const active = all.filter(
    (r: IConsignRequest) => r.status === "pending" || r.status === "approved",
  );
  if (active.length === 0) {
    u.send(`${ARR}You have no active consignments.`); return;
  }

  const rc = (label: string, width: number) => ({ label, width, align: "right" as const });
  const lc = (label: string, width: number) => ({ label, width });
  const rows = active.map((r: IConsignRequest) => [
    dim(r.id.slice(0, 8)),
    acc(r.gearItemName),
    val(r.askingPrice.toLocaleString()),
    r.status === "approved" ? acc(r.status) : dim(r.status),
  ]);

  u.send([
    bar(),
    hdr("MY CONSIGNMENTS"),
    bar(),
    ...tbl(
      [lc("ID", 8), lc("ITEM", 24), rc("PRICE", 8), lc("STATUS", 10)],
      rows,
    ),
    bar(),
  ].join("\r\n"));
}

async function listPending(u: IUrsamuSDK, cpr: ICPRCharacter): Promise<void> {
  if (cpr.role !== "fixer" && !isStaff(u)) {
    u.send(`${ERR}Only Fixers can view pending consignments.`); return;
  }
  const market = (await marketDB.find({ fixerId: u.me.id, active: true }))[0];
  if (!market) { u.send(`${ERR}You have no open stall.`); return; }

  const pending = await consignDB.find({ marketId: market.id, status: "pending" });
  if (pending.length === 0) {
    u.send(`${ARR}No pending consignment requests.`); return;
  }

  const rc = (label: string, width: number) => ({ label, width, align: "right" as const });
  const lc = (label: string, width: number) => ({ label, width });
  const rows = pending.map((r: IConsignRequest) => [
    dim(r.id.slice(0, 8)),
    acc(r.gearItemName),
    val(r.askingPrice.toLocaleString()),
    dim(r.consignorName),
  ]);

  u.send([
    bar(),
    hdr("PENDING CONSIGNMENTS"),
    bar(),
    ...tbl(
      [lc("ID", 8), lc("ITEM", 20), rc("PRICE", 8), lc("FROM", 16)],
      rows,
    ),
    bar(),
    `  ${ARR}${val("+consign/approve <id>")}  ${dim("|")}  ${val("+consign/decline <id>")}`,
  ].join("\r\n"));
}
