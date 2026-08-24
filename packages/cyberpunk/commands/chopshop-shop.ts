/**
 * Chopshop Shop Commands — open/close/list/buy/sell
 * Handlers for the persistent chopshop room feature.
 */
import { DBO } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { bar, div, hdr, lbl, val, acc, dim, bad, ARR, ERR, OK, row, tbl, wrap } from "./chargen.ts";
import type { ICPRCharacter, IChopshop, IExtractedChrome } from "../db/schemas.ts";
import { getCyberware } from "../data/cyberware.ts";
import { rollVariableHL, applyHumanityLoss } from "../engine/cyberpsychosis.ts";
import { recalcDerived } from "../engine/character.ts";

export const shopDB   = new DBO<IChopshop>("cpr.shops");
export const chromeDB = new DBO<IExtractedChrome>("cpr.extracted_chrome");

const tierLabel = (t: IChopshop["tierCap"]) =>
  t === "mall" ? "STREET DOC" : t === "clinic" ? "RIPPERDOC" : "TRAUMA SURGEON";

const tierDV = (t: IChopshop["tierCap"]) =>
  t === "mall" ? 13 : t === "clinic" ? 15 : 17;

const installCost = (t: string) => t === "mall" ? 200 : t === "clinic" ? 500 : 1500;

const tierFromSkill = (skill: number): IChopshop["tierCap"] => {
  if (skill <= 3) return "mall";
  if (skill <= 6) return "clinic";
  return "hospital";
};

const rc = (label: string, width: number) =>
  ({ label, width, align: "right" as const });
const rv = (n: number | string) => val(String(n));

function buildStallDesc(shop: IChopshop, surgerySkill: number): string {
  const label = tierLabel(shop.tierCap);
  const tierCap = tierFromSkill(surgerySkill);
  const lines = [
    `${shop.shopName} -- ${label}`,
    `Operated by ${shop.medtechName}.`,
    "",
    `INSTALL:  mall 300eb  clinic 750eb  hospital 2250eb`,
    tierCap === "hospital"
      ? `HARVEST:  mall 500eb  clinic 1000eb  hospital 2000eb`
      : `HARVEST:  mall 500eb  clinic 1000eb`,
    "",
    `+chopshop/buy <cyberware> to install. +chopshop/list for details.`,
  ];
  return lines.join("\n");
}

// ─── /open ───────────────────────────────────────────────────────────────────

export async function openShop(u: IUrsamuSDK, arg: string): Promise<void> {
  const cpr = u.me.state.cpr as ICPRCharacter | undefined;
  if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }
  if (cpr.role !== "medtech") { u.send(`${ERR}Only a Medtech can open a chopshop.`); return; }

  const surgerySkill = cpr.skills["surgery"] ?? 0;
  if (surgerySkill < 1) { u.send(`${ERR}You need Surgery skill 1+ to open a shop.`); return; }

  const existing = await shopDB.find({ roomId: u.here.id, active: true });
  if (existing.length > 0) {
    u.send(`${ERR}A chopshop is already open here.`); return;
  }

  const myOpen = await shopDB.find({ medtechId: u.me.id, active: true });
  if (myOpen.length > 0) {
    u.send(`${ERR}You already have an active chopshop. Use ${val("+chopshop/close")} first.`); return;
  }

  const shopName = arg.trim() || `${u.util.displayName(u.me, u.me)}'s Clinic`;
  const tierCap  = tierFromSkill(surgerySkill);
  const shop: IChopshop = {
    id:           crypto.randomUUID(),
    medtechId:    u.me.id,
    medtechName:  u.util.displayName(u.me, u.me),
    roomId:       u.here.id,
    shopName,
    surgerySkill,
    rollBonus:    (cpr.stats.tech ?? 0) + surgerySkill,
    tierCap,
    openedAt:     Date.now(),
    active:       true,
  };
  await shopDB.create(shop);

  const stallDesc = buildStallDesc(shop, surgerySkill);
  const stallObj = await u.db.create({
    name: shopName,
    flags: new Set(["thing"]),
    location: u.here.id,
    state: {
      desc: stallDesc,
      chopshopId: shop.id,
    },
    contents: [],
  });
  await shopDB.update({ id: shop.id }, { ...shop, shopObjId: stallObj.id });

  const label = tierLabel(tierCap);
  u.send([
    bar(),
    hdr("CHOPSHOP OPEN"),
    bar(),
    row("SHOP",  val(shopName)),
    row("TIER",  val(label)),
    row("CAP",   dim(`up to ${tierCap} procedures`)),
    bar(),
  ].join("\r\n"));

  const broadcast = `${dim(u.util.displayName(u.me, u.me))} sets up shop: ${val(shopName)} -- ${dim(label)}. Cyberware available.`;
  u.here.broadcast?.(broadcast);
}

// ─── /close ──────────────────────────────────────────────────────────────────

export async function closeShop(u: IUrsamuSDK): Promise<void> {
  const myOpen = await shopDB.find({ medtechId: u.me.id, active: true });
  if (myOpen.length === 0) {
    u.send(`${ERR}You have no active chopshop.`); return;
  }
  const shop = myOpen[0];
  await shopDB.update({ id: shop.id }, { ...shop, active: false, closedAt: Date.now() });

  if (shop.shopObjId) {
    await u.db.destroy(shop.shopObjId);
  }

  u.send(`${OK}${val(shop.shopName)} is now closed.`);
  u.here.broadcast?.(`${dim(u.util.displayName(u.me, u.me))} packs up ${val(shop.shopName)}. Chopshop closed.`);
}

// ─── /list ───────────────────────────────────────────────────────────────────

export async function listShop(u: IUrsamuSDK): Promise<void> {
  const shops = await shopDB.find({ roomId: u.here.id, active: true });
  if (shops.length === 0) {
    u.send(`${ARR}No chopshop is currently open here.`); return;
  }
  const shop = shops[0];
  const label = tierLabel(shop.tierCap);
  u.send([
    bar(),
    hdr("CHOPSHOP -- " + shop.shopName),
    bar(),
    row("OPERATOR", val(shop.medtechName)),
    row("RATING",   acc(label)),
    row("TIER CAP", dim(shop.tierCap)),
    div(),
    ...tbl(
      [{ label: "TIER", width: 10 }, rc("INSTALL", 8), rc("HARVEST", 8)],
      [
        ["mall",     rv(200), rv(500)],
        ["clinic",   rv(500), rv(1000)],
        ["hospital", rv(1500), rv(2000)],
      ],
    ),
    div(),
    ...wrap(`Use ${val("+chopshop/buy <cyberware>")} to purchase and install in one step.`, 74),
    bar(),
  ].join("\r\n"));
}

// ─── /buy ────────────────────────────────────────────────────────────────────

export async function buyFromShop(u: IUrsamuSDK, arg: string): Promise<void> {
  const cpr = u.me.state.cpr as ICPRCharacter | undefined;
  if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

  const cwName = arg.toLowerCase().replace(/ /g, "_");
  if (!cwName) { u.send(`${ARR}Usage: ${val("+chopshop/buy <cyberware>")}`); return; }

  const shops = await shopDB.find({ roomId: u.here.id, active: true });
  if (shops.length === 0) { u.send(`${ERR}No chopshop is open here.`); return; }
  const shop = shops[0];

  const def = getCyberware(cwName);
  if (!def) { u.send(`${ERR}Unknown chrome ${val(cwName)}.`); return; }

  const tierOrder: Record<string, number> = { mall: 1, clinic: 2, hospital: 3 };
  if ((tierOrder[def.installType] ?? 99) > (tierOrder[shop.tierCap] ?? 0)) {
    u.send(`${ERR}This shop (${val(shop.tierCap)}) can't install ${val(def.installType)}-tier chrome.`); return;
  }

  if (cpr.cyberware.some((cw) => cw.name === cwName)) {
    u.send(`${ERR}You already have ${val(cwName)} installed.`); return;
  }

  const baseCost  = installCost(def.installType);
  const totalCost = Math.round(baseCost * 1.5);
  if (cpr.eurodollars < totalCost) {
    u.send(`${ERR}This costs ${val(totalCost + " eb")} (street markup). You have ${dim(cpr.eurodollars + " eb")}.`); return;
  }

  // Roll: cached surgerySkill from shop record
  const roll  = Math.floor(Math.random() * 10) + 1;
  const total = shop.rollBonus + roll;
  const dv    = tierDV(def.installType as IChopshop["tierCap"]);
  const hit   = total >= dv;

  if (hit) {
    const hlAmount = def.hlRoll ? rollVariableHL(def.hlRoll) : def.hl;
    const { newHL, newEMP } = applyHumanityLoss(cpr, hlAmount);
    const newCW = {
      id: crypto.randomUUID(), name: cwName, category: def.category,
      hl: hlAmount, installType: def.installType,
      installedAt: Date.now(), installedBy: shop.medtechId,
      notes: `Installed at ${shop.shopName}`,
    };
    const updatedChar = { ...cpr, humanityLoss: newHL, stats: { ...cpr.stats, emp: newEMP } };
    const recalced = recalcDerived({ ...updatedChar, cyberware: [...cpr.cyberware, newCW] });
    await u.db.modify(u.me.id, "$set", {
      "state.cpr.cyberware":     recalced.cyberware,
      "state.cpr.humanityLoss":  recalced.humanityLoss,
      "state.cpr.stats":         recalced.stats,
    });
    await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": -totalCost });

    // Credit the Medtech
    const medtechs = await u.db.search({ flags: /player/i, id: shop.medtechId });
    if (medtechs.length > 0) {
      await u.db.modify(shop.medtechId, "$inc", { "state.cpr.eurodollars": totalCost });
    }

    const lines = [
      div(),
      ...tbl(
        [rc("ROLL", 6), rc("TOTAL", 6), rc("DV", 4), rc("RESULT", 10), rc("HL", 4)],
        [[rv(roll), rv(total), rv(dv), acc("INSTALLED"), rv(hlAmount)]],
      ),
      div(),
      row("CHROME",  val(def.name.replace(/_/g, " "))),
      row("COST",    val(totalCost + " eb")),
      div(),
    ];
    u.send(lines.join("\r\n"));
    u.here.broadcast?.(`${dim(u.util.displayName(u.me, u.me))} gets chrome installed at ${val(shop.shopName)}.`);
  } else {
    // Failed install: half fee, 1d6 damage
    const halfFee = Math.round(totalCost / 2);
    const dmg     = Math.floor(Math.random() * 6) + 1;
    const curHp   = cpr.hp.current - dmg;
    await u.db.modify(u.me.id, "$set",  { "state.cpr.hp.current": Math.max(0, curHp) });
    await u.db.modify(u.me.id, "$inc",  { "state.cpr.eurodollars": -halfFee });
    const lines = [
      div(),
      ...tbl(
        [rc("ROLL", 6), rc("TOTAL", 6), rc("DV", 4), rc("RESULT", 10), rc("DMG", 4)],
        [[rv(roll), rv(total), rv(dv), bad("BOTCHED"), rv(dmg)]],
      ),
      div(),
      row("HALF FEE", val(halfFee + " eb")),
      row("DAMAGE",   bad(dmg + " HP")),
      div(),
    ];
    u.send(lines.join("\r\n"));
    u.here.broadcast?.(`${dim(u.util.displayName(u.me, u.me))} grimaces as the install at ${val(shop.shopName)} goes wrong.`);
  }
}

// ─── /sell ───────────────────────────────────────────────────────────────────

export async function sellToShop(u: IUrsamuSDK, arg: string): Promise<void> {
  const cpr = u.me.state.cpr as ICPRCharacter | undefined;
  if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

  const cwName = arg.toLowerCase().replace(/ /g, "_");
  if (!cwName) { u.send(`${ARR}Usage: ${val("+chopshop/sell <cyberware>")}`); return; }

  const shops = await shopDB.find({ roomId: u.here.id, active: true });
  if (shops.length === 0) { u.send(`${ERR}No chopshop is open here.`); return; }
  const shop = shops[0];

  // Check extracted chrome inventory first
  const chromePile = await chromeDB.find({ ownerId: u.me.id });
  const extracted  = chromePile.find((c) => c.cyberwareName === cwName && !c.damaged);

  if (!extracted) {
    u.send(`${ERR}You don't have extracted ${val(cwName)} to sell.`); return;
  }

  const sellPrice = Math.round(installCost(extracted.installType) * 0.5);

  // Transfer ownership to Medtech
  await chromeDB.update({ id: extracted.id }, { ...extracted, ownerId: shop.medtechId, ownerName: shop.medtechName });

  // Debit Medtech, credit seller
  const medtechs = await u.db.search({ flags: /player/i, id: shop.medtechId });
  if (medtechs.length > 0) {
    await u.db.modify(shop.medtechId, "$inc", { "state.cpr.eurodollars": -sellPrice });
  }
  await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": sellPrice });

  u.send([
    div(),
    `  ${OK}${val(cwName.replace(/_/g, " "))} sold to ${val(shop.shopName)}.`,
    row("PAID", val(sellPrice + " eb")),
    div(),
  ].join("\r\n"));
}
