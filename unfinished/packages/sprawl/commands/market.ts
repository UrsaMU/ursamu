/**
 * +market — street price browser + buy.
 * Lists are fixed-column tables; buy accepts # from last list.
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import {
  ARR,
  ERR,
  OK,
  dim,
  divider,
  panelClose,
  panelOpen,
  plain,
  val,
  ylw,
} from "./chrome.ts";
import { getChar, requireChar } from "../engine/sheet-io.ts";
import {
  findByName,
  type Row,
} from "../engine/catalog.ts";
import {
  filterStock,
  marketStock,
  resolveStock,
  stockInCat,
} from "../engine/market-stock.ts";
import { buyStreetItem } from "./gear-buy.ts";

const PAGE = 16;
const W = 76;

/** Last browsed page per player — enables +market/buy 3. */
const lastList = new Map<string, string[]>();

const CATS: {
  key: string;
  label: string;
  aliases: string[];
}[] = [
  {
    key: "firearm",
    label: "Firearms",
    aliases: ["firearms", "guns", "gun"],
  },
  {
    key: "melee",
    label: "Melee",
    aliases: ["melee-weapons"],
  },
  {
    key: "armor",
    label: "Armor",
    aliases: ["armour"],
  },
  {
    key: "heavy",
    label: "Heavy",
    aliases: ["heavy-weapons"],
  },
  {
    key: "ammo",
    label: "Ammo",
    aliases: ["ammunition"],
  },
  {
    key: "mod",
    label: "Mods",
    aliases: ["mods", "weapon-mods"],
  },
  {
    key: "augmentation",
    label: "Augs",
    aliases: ["augs", "aug", "chrome", "cyber"],
  },
  {
    key: "shardware",
    label: "Shards",
    aliases: ["shards", "shard"],
  },
  {
    key: "general",
    label: "General",
    aliases: ["gear", "stuff", "misc", "tools"],
  },
  {
    key: "console",
    label: "Consoles",
    aliases: ["consoles", "deck", "decks", "net"],
  },
  {
    key: "software",
    label: "Software",
    aliases: ["soft", "programs", "apps", "ware"],
  },
  {
    key: "net-hw",
    label: "Net HW",
    aliases: [
      "net-hardware",
      "hardware",
      "nodejacker",
      "dongle",
    ],
  },
];

function walletLine(bityuan: number | undefined): string {
  if (bityuan == null) {
    return `  ${dim("Wallet")} ${dim("— no sheet")}` +
      `  ${dim("+chargen first")}`;
  }
  return `  ${dim("Wallet")} ${val(bityuan)} b¥`;
}

function matchCat(raw: string): string | undefined {
  const q = raw.toLowerCase().trim();
  if (!q) return undefined;
  const hit = CATS.find((c) =>
    c.key === q ||
    c.label.toLowerCase() === q ||
    c.aliases.includes(q) ||
    c.key.startsWith(q) ||
    c.aliases.some((a) => a.startsWith(q))
  );
  return hit?.key;
}

function rowsInCat(cat: string): Row[] {
  return stockInCat(cat);
}

function filterRows(rows: Row[], q: string): Row[] {
  return filterStock(rows, q);
}

function sortCost(rows: Row[]): Row[] {
  return [...rows].sort((a, b) =>
    Number(a.cost ?? 0) - Number(b.cost ?? 0)
  );
}

function clipPlain(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 1) return "…";
  return s.slice(0, max - 1) + "…";
}

/**
 * Drop brand prefix: "Charon® PKD-45 …" → "PKD-45 …"
 * Falls back to full name when no ® mark.
 */
export function shortLabel(name: string): string {
  const raw = String(name ?? "").trim();
  const after = raw.match(/®\s*(.+)$/);
  if (after?.[1]) return after[1].trim();
  return raw.replace(/®/g, "").trim();
}

function pad(s: string, w: number): string {
  const p = plain(s);
  if (p.length >= w) return clipPlain(p, w);
  return s + " ".repeat(w - p.length);
}

function padLeft(s: string, w: number): string {
  const p = plain(s);
  if (p.length >= w) return clipPlain(p, w);
  return " ".repeat(w - p.length) + s;
}

/** Table header: # | b¥ | Name | Key (short slug tail). */
function tableHeader(): string {
  return (
    `  ${dim("#".padStart(2))} ` +
    `${dim("b¥".padStart(6))}  ` +
    `${dim(pad("Name", 36))} ` +
    `${dim("Key")}`
  );
}

function tableRule(): string {
  return `  ${dim("-".repeat(72))}`;
}

/**
 * One stock row. Price always in a fixed column (never clipped).
 * Key = last meaningful slug segment(s) for +market/buy.
 */
export function tableRow(
  n: number,
  r: Row,
  bityuan?: number,
): string {
  const costN = Number(r.cost ?? 0);
  const costStr = r.cost != null ? String(r.cost) : "—";
  const can = bityuan == null || bityuan >= costN;
  const num = String(n).padStart(2);
  const price = padLeft(costStr, 6);
  const label = clipPlain(shortLabel(String(r.name ?? "")), 36);
  const key = clipPlain(buyKey(String(r.slug)), 24);
  const body =
    `  ${num} ${price}  ${pad(label, 36)} ${key}`;
  if (!can && bityuan != null) {
    return dim(plain(body));
  }
  // Highlight price when affordable
  return (
    `  ${dim(num)} ` +
    `${can ? val(price) : dim(price)}  ` +
    `${pad(label, 36)} ` +
    `${dim(key)}`
  );
}

/**
 * Short buy key from slug — model tokens, not full brand path.
 * charon-pkd-45-police-special-revolver → pkd-45-police-special
 * orchard-technologies-machine-link → machine-link
 */
export function buyKey(slug: string): string {
  const parts = slug.toLowerCase().split("-").filter(Boolean);
  if (parts.length <= 2) return parts.join("-");
  const di = parts.findIndex((p) => /\d/.test(p));
  if (di >= 0) {
    let start = di;
    // Keep short product code before the number (pkd, ak, …)
    if (di > 0 && parts[di - 1].length <= 5) start = di - 1;
    return parts.slice(start, start + 4).join("-");
  }
  // No model digits — last two tokens are usually the product
  return parts.slice(-2).join("-");
}

function parsePage(parts: string[]): {
  filter: string;
  page: number;
} {
  if (!parts.length) return { filter: "", page: 1 };
  const last = parts[parts.length - 1] ?? "";
  if (/^\d+$/.test(last)) {
    const page = Math.max(1, Number(last));
    const filter = parts.slice(0, -1).join(" ");
    if (!filter) return { filter: "", page };
    return { filter, page };
  }
  return { filter: parts.join(" "), page: 1 };
}

export function renderMarketIndex(
  bityuan?: number,
): string[] {
  const lines = [
    panelOpen("STREET MARKET"),
    walletLine(bityuan),
    divider("CATEGORIES"),
  ];
  for (const c of CATS) {
    const n = rowsInCat(c.key).length;
    if (!n) continue;
    lines.push(
      `  ${val(c.key.padEnd(14))} ` +
        `${dim(c.label.padEnd(10))} ` +
        `${dim(String(n) + " items")}`,
    );
  }
  lines.push(divider("HOW"));
  lines.push(
    `  ${val("+market <category>")}  ` +
      `${dim("table · add page #")}`,
  );
  lines.push(
    `  ${val("+market <text>")}       ` +
      `${dim("search name/slug")}`,
  );
  lines.push(
    `  ${val("+market/info <#>")}     ` +
      `${dim("detail from last list")}`,
  );
  lines.push(
    `  ${val("+market/buy <#>")}      ` +
      `${dim("or key / slug")}`,
  );
  lines.push(
    `  ${dim("e.g.")} ${val("+market firearm")}` +
      `  ${val("+market/buy 2")}`,
  );
  lines.push(panelClose("SPRAWL"));
  return lines;
}

export type MarketListOpts = {
  query: string;
  bityuan?: number;
  /** When set, remember this page for +market/buy # */
  playerId?: string;
};

export function renderMarketList(
  queryOrOpts: string | MarketListOpts,
  bityuan?: number,
): string[] {
  const opts: MarketListOpts = typeof queryOrOpts === "string"
    ? { query: queryOrOpts, bityuan }
    : queryOrOpts;
  const query = opts.query;
  const cash = opts.bityuan;

  const parts = query.trim().split(/\s+/).filter(Boolean);
  const { filter, page } = parsePage(parts);
  const first = filter.split(/\s+/)[0] ?? "";
  const cat = matchCat(first);
  let rows: Row[];
  let title: string;
  let listKey = filter;

  if (cat && matchCat(filter) === cat) {
    rows = rowsInCat(cat);
    title = cat.toUpperCase();
    listKey = cat;
  } else if (cat && filter.toLowerCase().startsWith(cat)) {
    const rest = filter.slice(cat.length).trim();
    rows = filterRows(rowsInCat(cat), rest);
    title = cat.toUpperCase() + (rest ? ` · ${rest}` : "");
    listKey = filter;
  } else {
    rows = filterRows(marketStock(), filter);
    title = filter ? `SEARCH · ${filter}` : "ALL";
  }

  rows = sortCost(rows);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const p = Math.min(page, pages);
  const slice = rows.slice((p - 1) * PAGE, p * PAGE);

  if (opts.playerId) {
    lastList.set(
      opts.playerId,
      slice.map((r) => String(r.slug)),
    );
  }

  const lines = [
    panelOpen("MARKET", title),
    walletLine(cash),
    `  ${dim(String(rows.length) + " hits")}` +
    `  ${dim("page " + p + "/" + pages)}` +
    (cash != null
      ? `  ${dim("dim = can't afford")}`
      : ""),
  ];
  if (!slice.length) {
    lines.push(`  ${dim("no matches")}`);
    lines.push(
      `  ${ARR}Try ${val("+market")} for categories.`,
    );
  } else {
    lines.push(tableHeader());
    lines.push(tableRule());
    slice.forEach((r, i) => {
      lines.push(tableRow(i + 1, r, cash));
    });
  }
  if (p < pages) {
    lines.push(
      `  ${dim("more:")} ` +
        `${val("+market " + listKey + " " + (p + 1))}`,
    );
  }
  lines.push(
    `  ${ylw("Buy:")} ${val("+market/buy <#>")}` +
      `  ${dim("info:")} ${val("+market/info <#>")}` +
      `  ${dim("or key")}`,
  );
  lines.push(panelClose("SPRAWL"));
  return lines;
}

/** Resolve # from last list, buy key, or slug/name. */
export function resolveMarketRef(
  playerId: string | undefined,
  raw: string,
): Row | undefined {
  const q = raw.trim();
  if (!q) return undefined;
  const stock = marketStock();
  if (/^\d+$/.test(q) && playerId) {
    const list = lastList.get(playerId) ?? [];
    const idx = Number(q) - 1;
    const slug = list[idx];
    if (slug) return resolveStock(slug);
  }
  const exact = resolveStock(q);
  if (exact) return exact;
  const ql = q.toLowerCase();
  const byKey = stock.find((r) => buyKey(r.slug) === ql);
  if (byKey) return byKey;
  const keyHits = stock.filter((r) => {
    const k = buyKey(r.slug);
    return k === ql || k.includes(ql) || r.slug.includes(ql);
  });
  if (keyHits.length === 1) return keyHits[0];
  return findByName(stock, q) ??
    stock.find((r) =>
      String(r.name).toLowerCase().includes(ql)
    );
}

export function renderMarketInfo(
  query: string,
  bityuan?: number,
  playerId?: string,
): string[] {
  const q = query.trim();
  if (!q) {
    return [
      panelOpen("MARKET INFO"),
      `  ${dim("Usage: +market/info <#>|key|slug")}`,
      `  ${dim("Example: +market/info 2")}`,
      panelClose("SPRAWL"),
    ];
  }
  const row = resolveMarketRef(playerId, q);
  if (!row) {
    const hits = filterRows(marketStock(), q);
    if (hits.length === 1) {
      return renderMarketInfo(hits[0].slug, bityuan, playerId);
    }
    if (hits.length > 1) {
      return renderMarketList({
        query: q,
        bityuan,
        playerId,
      });
    }
    return [
      panelOpen("MARKET INFO"),
      `  ${ERR}Nothing matched ${val(q)}.`,
      `  ${dim("Browse: +market console · software")}`,
      panelClose("SPRAWL"),
    ];
  }
  const cost = Number(row.cost ?? 0);
  const can = bityuan != null && bityuan >= cost;
  const label = shortLabel(String(row.name));
  const lines = [
    panelOpen("MARKET", label),
    walletLine(bityuan),
    divider("ITEM"),
    `  ${dim("Name")}  ${String(row.name)}`,
    `  ${dim("Key")}   ${val(buyKey(row.slug))}`,
    `  ${dim("Slug")}  ${dim(row.slug)}`,
    `  ${dim("Cost")}  ${val(cost)} b¥` +
    `  ${dim(String(row.category ?? "—"))}` +
    (row.book ? `  ${dim(String(row.book))}` : ""),
  ];
  if (row.ram != null) {
    lines.push(
      `  ${dim("Deck")}  RAM ${row.ram}` +
        ` · slots ${row.slots ?? "?"}` +
        ` · FW ${row.firewall ?? "?"}`,
    );
  }
  if (row.effect != null || row.blurb != null) {
    lines.push(
      `  ${dim("Note")}  ` +
        `${String(row.blurb ?? row.effect ?? "").slice(0, 60)}`,
    );
  }
  if (bityuan != null) {
    lines.push(
      can
        ? `  ${OK}Affordable (${val(bityuan - cost)} after)`
        : `  ${ERR}Need ${val(cost - bityuan)} more b¥`,
    );
  }
  const cat = String(row.category ?? "");
  if (cat === "console") {
    lines.push(
      `  ${dim("Buy equips deck:")} ${val("+console")}`,
    );
  }
  if (cat === "software") {
    lines.push(
      `  ${dim("Needs console + free slots")}` +
        ` · ${val("+console/load")} after`,
    );
  }
  if (cat === "augmentation") {
    lines.push(
      `  ${dim("Chrome tip:")} ` +
        `${val("+aug/catalog")} for sheet mods`,
    );
  }
  if (cat === "shardware") {
    lines.push(
      `  ${dim("Needs")} ${val("savvy-jack")}` +
        ` · ${val("+shard/jack")} or buy`,
    );
  }
  lines.push(
    `  ${ylw("Buy:")} ${val("+market/buy " + buyKey(row.slug))}` +
      `  ${dim("or full slug")}`,
  );
  lines.push(panelClose("SPRAWL"));
  return lines;
}

addCmd({
  name: "+market",
  pattern: /^\+market(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+market[/<switch>] [args]  — Street prices & buy.

Bare +market shows categories and your b¥ wallet.
Lists are a table: # · b¥ · Name · Key.
Buy by number from the last list you browsed.

Switches:
  (none) <cat|filter> [page]  Browse table
  /info <#>|key|slug          One item + afford
  /buy <#>|key|slug           Spend b¥ → inventory

Categories:
  firearm melee armor heavy ammo mod
  augmentation shardware general
  console software net-hw

Examples:
  +market
  +market console
  +market/buy hyperion
  +market software
  +market/buy tunnel-rat`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const c = getChar(u.me);
    const cash = c?.bityuan;
    const pid = u.me.id;

    if (!sw || sw === "list" || sw === "browse") {
      if (!arg) {
        u.send(renderMarketIndex(cash).join("\r\n"));
        return;
      }
      // Exact unique hit → detail (not a category browse)
      const catOnly = matchCat(arg);
      if (
        !catOnly ||
        matchCat(arg) !==
          arg.toLowerCase().split(/\s+/)[0]
      ) {
        const exact = resolveStock(arg) ??
          findByName(marketStock(), arg);
        if (exact && !/\s+\d+$/.test(arg)) {
          const hits = filterRows(marketStock(), arg);
          if (
            hits.length === 1 ||
            exact.slug === arg.toLowerCase()
          ) {
            u.send(
              renderMarketInfo(exact.slug, cash, pid)
                .join("\r\n"),
            );
            return;
          }
        }
      }
      u.send(
        renderMarketList({
          query: arg,
          bityuan: cash,
          playerId: pid,
        }).join("\r\n"),
      );
      return;
    }

    if (sw === "info" || sw === "show") {
      u.send(
        renderMarketInfo(arg, cash, pid).join("\r\n"),
      );
      return;
    }

    if (sw === "buy") {
      const sheet = requireChar(u);
      if (!sheet) {
        u.send(
          `${ARR}No sheet. ${val("+chargen")} first.`,
        );
        return;
      }
      const row = resolveMarketRef(pid, arg);
      if (!row) {
        u.send(
          `${ERR}Unknown stock. Browse ` +
            `${val("+market firearm")} then ` +
            `${val("+market/buy 1")}.`,
        );
        return;
      }
      const res = await buyStreetItem(u, sheet, row.slug);
      u.send(res.msg);
      return;
    }

    if (sw === "help" || sw === "cats" ||
      sw === "categories") {
      u.send(renderMarketIndex(cash).join("\r\n"));
      return;
    }

    u.send(
      [
        `${ERR}Unknown switch ${val(sw)}.`,
        `  ${dim("+market · +market/info · +market/buy")}`,
      ].join("\r\n"),
    );
  },
});

// keep W referenced for layout intent
void W;
