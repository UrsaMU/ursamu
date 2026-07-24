// Builder +market create/stock/open/destroy.

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  createMarket,
  destroyMarket,
  findMarketById,
  findMarketByRoom,
  findMarketGood,
  getListing,
  listMarkets,
  saveMarket,
} from "../market/index.ts";
import {
  isBuilder,
  marketHere,
  marketLabel,
} from "./market_helpers.ts";

export async function marketCreate(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isBuilder(u.me)) {
    u.send("Permission denied.");
    return;
  }
  const roomId = u.here?.id;
  if (!roomId) {
    u.send("No current room.");
    return;
  }
  const existing = await findMarketByRoom(roomId);
  if (existing) {
    u.send(
      `Room already has market %cy${existing.name}%cn ` +
        `(${existing.id}).`,
    );
    return;
  }
  const name = rest.trim() || "Goblin Market";
  const m = await createMarket(name, roomId, u.me.id);
  u.send(
    `Opened %cy${m.name}%cn here (${m.id}). ` +
      "Use +market/stock to restock.",
  );
}

export async function marketDestroy(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isBuilder(u.me)) {
    u.send("Permission denied.");
    return;
  }
  const key = rest.trim();
  let m = key
    ? await findMarketById(key)
    : await marketHere(u);
  if (!m && key) {
    const all = await listMarkets();
    m = all.find(
      (x) =>
        x.name.toLowerCase() === key.toLowerCase(),
    ) ?? null;
  }
  if (!m) {
    u.send("No market found.");
    return;
  }
  await destroyMarket(m.id);
  u.send(`Destroyed market ${m.name} (${m.id}).`);
}

export async function marketOpen(
  u: IUrsamuSDK,
  rest: string,
  open: boolean,
): Promise<void> {
  if (!isBuilder(u.me)) {
    u.send("Permission denied.");
    return;
  }
  void rest;
  const m = await marketHere(u);
  if (!m) {
    u.send("No market in this room.");
    return;
  }
  m.open = open;
  await saveMarket(m);
  u.send(
    `Market %cy${marketLabel(u.me, m)}%cn is now ` +
      (open ? "open" : "closed") + ".",
  );
}

export async function marketStock(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isBuilder(u.me)) {
    u.send("Permission denied.");
    return;
  }
  const m = await marketHere(u);
  if (!m) {
    u.send("No market in this room.");
    return;
  }
  const parts = rest.trim().split(/\s+/);
  const slug = parts[0] ?? "";
  const n = parseInt(parts[1] ?? "1", 10);
  if (!slug || !Number.isFinite(n)) {
    u.send("Usage: +market/stock <slug> <qty|-1>");
    return;
  }
  const good = findMarketGood(slug);
  if (!good) {
    u.send(`Unknown good '${slug}'. +market/catalog`);
    return;
  }
  const stock = n < 0 ? -1 : Math.floor(n);
  const cur = getListing(m, good.slug);
  if (cur) {
    m.listings = m.listings.map((l) =>
      l.slug === good.slug ? { ...l, stock } : l
    );
  } else {
    m.listings = [
      ...m.listings,
      {
        slug: good.slug,
        stock,
        seller: "A grinning vendor",
      },
    ];
  }
  await saveMarket(m);
  u.send(
    `Stocked %cy${good.name}%cn ×` +
      (stock < 0 ? "∞" : String(stock)) + ".",
  );
}

export async function marketListAll(
  u: IUrsamuSDK,
): Promise<void> {
  if (!isBuilder(u.me)) {
    u.send("Permission denied. Use +market here.");
    return;
  }
  const all = await listMarkets();
  const lines = [await divider("A L L  M A R K E T S")];
  if (all.length === 0) {
    lines.push("  (none)  +market/create <name>");
  } else {
    for (const m of all) {
      lines.push(
        `  ${m.open ? "%cgopen%cn" : "%crclosed%cn"} ` +
          `%cy${m.name}%cn  room ${m.roomId}  ` +
          `(${m.id})`,
      );
    }
  }
  u.send(lines.join("\n"));
}
