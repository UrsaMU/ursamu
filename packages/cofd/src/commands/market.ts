// +market — Goblin Markets (CtL).

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  applyBuySideEffects,
  findMarketGood,
  listingPrices,
  listMarketGoods,
  resolveBuy,
} from "../market/index.ts";
import {
  getSheet,
  marketHere,
  marketLabel,
  persistSheet,
  requireChangeling,
} from "./market_helpers.ts";
import {
  marketCreate,
  marketDestroy,
  marketListAll,
  marketOpen,
  marketStock,
} from "./market_staff.ts";
import { debtExec } from "./debt.ts";

export async function marketExec(
  u: IUrsamuSDK,
): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  switch (sw) {
    case "":
    case "status":
    case "here":
      return await marketBrowse(u);
    case "catalog":
    case "goods":
      return await marketCatalog(u, rest);
    case "buy":
      return await marketBuy(u, rest, "glamour");
    case "credit":
      return await marketBuy(u, rest, "debt");
    case "create":
      return await marketCreate(u, rest);
    case "destroy":
      return await marketDestroy(u, rest);
    case "open":
      return await marketOpen(u, rest, true);
    case "close":
      return await marketOpen(u, rest, false);
    case "stock":
      return await marketStock(u, rest);
    case "list":
    case "all":
      return await marketListAll(u);
    case "debt":
      return await debtExec(u, rest);
    default:
      u.send(`Unknown +market switch: /${sw}`);
  }
}

async function marketBrowse(u: IUrsamuSDK): Promise<void> {
  const m = await marketHere(u);
  if (!m) {
    u.send(
      "No Goblin Market in this room. " +
        "(Builder: +market/create <name>)",
    );
    return;
  }
  const label = marketLabel(u.me, m);
  const lines = [
    await divider("G O B L I N  M A R K E T"),
    `  %cy${label}%cn  ` +
      (m.open ? "%cgOPEN%cn" : "%crCLOSED%cn"),
  ];
  if (m.flavor) lines.push(`  ${m.flavor}`);
  if (m.listings.length === 0) {
    lines.push("  (empty stalls)");
  } else {
    for (const l of m.listings) {
      const g = findMarketGood(l.slug);
      const p = listingPrices(m, l);
      const st = l.stock < 0 ? "∞" : String(l.stock);
      const nm = g?.name ?? l.slug;
      lines.push(
        `  %cy${l.slug}%cn  ${nm}  ` +
          `${p.glamour}G` +
          (p.debt > 0 ? ` / debt${p.debt}` : " cash") +
          `  ×${st}`,
      );
    }
  }
  lines.push("  +market/buy <slug>     pay Glamour");
  lines.push("  +market/credit <slug>  take Debt");
  lines.push("  +debt                  your debts");
  u.send(lines.join("\n"));
}

async function marketCatalog(
  u: IUrsamuSDK,
  filter: string,
): Promise<void> {
  const f = filter.toLowerCase().trim();
  let goods = [...listMarketGoods()];
  if (f && f !== "all") {
    goods = goods.filter(
      (g) =>
        g.kind === f ||
        g.slug.includes(f) ||
        g.name.toLowerCase().includes(f),
    );
  }
  const lines = [
    await divider("M A R K E T  C A T A L O G"),
  ];
  for (const g of goods) {
    lines.push(
      `  %cy${g.slug}%cn  ${g.name}  [${g.kind}]  ` +
        `${g.priceGlamour}G` +
        (g.priceDebt > 0 ? `/d${g.priceDebt}` : ""),
    );
    lines.push(`    ${g.description.slice(0, 60)}`);
  }
  lines.push("  +market  — stalls in this room");
  u.send(lines.join("\n"));
}

async function marketBuy(
  u: IUrsamuSDK,
  rest: string,
  mode: "glamour" | "debt",
): Promise<void> {
  const sheet = getSheet(u.me);
  const err = requireChangeling(sheet, "Goblin Markets");
  if (err) {
    u.send(err);
    return;
  }
  const m = await marketHere(u);
  if (!m) {
    u.send("No Goblin Market in this room.");
    return;
  }
  let slug = rest;
  let pay = mode;
  const parts = rest.toLowerCase().split(/\s+/);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (last === "debt" || last === "credit") {
      pay = "debt";
      slug = parts.slice(0, -1).join(" ");
    } else if (last === "glamour" || last === "cash") {
      pay = "glamour";
      slug = parts.slice(0, -1).join(" ");
    }
  }
  slug = slug.trim();
  if (!slug) {
    u.send(
      "Usage: +market/buy <slug> [debt]  or  " +
        "+market/credit <slug>",
    );
    return;
  }
  const r = resolveBuy(sheet!, m, slug, pay);
  if (!r.ok || !r.sheet) {
    u.send(r.reason ?? "Cannot buy.");
    return;
  }
  await applyBuySideEffects(u, r);
  await persistSheet(u, u.me.id, r.sheet);
  u.send(r.lines.join("\n"));
}
