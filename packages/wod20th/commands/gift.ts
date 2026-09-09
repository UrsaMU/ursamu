// commands/gift.ts -- +gift for WtA gift list / info / use (v1 stub).
//
// v1 scope: list known gifts, browse the catalog, show info, and a stub
// /use that pays Gnosis (= gift level), poses the room, and fires
// `wod20th:gift-used`. Per-gift mechanics land when the action-data table
// exists.
//
// Hardening:
//   - Frenzy-gated (composure required).
//   - WtA-only.
//   - All persistence flows through saveChar().

import { addCmd, gameHooks } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import "../hooks.ts"; // augments GameHookMap with wod20th:* event keys
import { findByPlayer, saveChar } from "../db/charDb.ts";
import { findPackById, type IPack } from "../db/packDb.ts";
import { activateGift, lookupGift } from "../core/giftAction.ts";
import { spendPool } from "../core/pools.ts";
import { findBoon, tryUseTotemBoon } from "./giftBoon.ts";
import { WTA_GIFTS } from "../splats/wta/data/gifts.ts";
import type { IGiftDef } from "../core/types.ts";
import { frenzyBlockMessage } from "../core/frenzyGate.ts";
import { poseRoom } from "../core/poseRoom.ts";
import { shiftedDisplayName } from "../core/displayName.ts";
import { header, footer } from "../core/format.ts";

const ROW_WIDTH = 78;

function visLen(s: string): number {
  return s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, "").length;
}

/**
 * Format a gift row, wrapping the source list onto continuation lines
 * (hang-indented under the source-list column) so every emitted line fits
 * within 78 visible chars.
 */
function fmtGiftRow(slug: string, def: IGiftDef): string {
  const head = `  L${def.level} %ch${def.name}%cn  %cw[${slug}]%cn  `;
  const headVis = visLen(head);
  const indent = " ".repeat(headVis);
  const budget = Math.max(8, ROW_WIDTH - headVis - 2); // room for "(" and ")"

  // Greedy-pack source tokens into chunks no wider than `budget`.
  const chunks: string[] = [];
  let cur = "";
  for (let i = 0; i < def.source.length; i++) {
    const sep = cur ? ", " : "";
    const tok = sep + def.source[i];
    if (cur && cur.length + tok.length > budget) {
      chunks.push(cur);
      cur = def.source[i];
    } else {
      cur += tok;
    }
  }
  if (cur) chunks.push(cur);
  if (chunks.length === 0) chunks.push("");

  const out: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const prefix = i === 0 ? head : indent;
    const open   = i === 0 ? "(" : " ";
    const close  = i === chunks.length - 1 ? ")" : ",";
    out.push(`${prefix}%cy${open}${chunks[i]}${close}%cn`);
  }
  return out.join("%r");
}

async function renderCatalog(filterLevel?: number): Promise<string> {
  const title = filterLevel
    ? `Gifts -- Level ${filterLevel}`
    : "Gifts -- Catalog";
  const lines: string[] = [header(title)];
  const entries = Object.entries(WTA_GIFTS)
    .filter(([, d]) => !filterLevel || d.level === filterLevel)
    .sort(([, a], [, b]) =>
      a.level - b.level || a.name.localeCompare(b.name)
    );
  if (entries.length === 0) {
    lines.push("  (No gifts match.)");
  } else {
    for (const [slug, def] of entries) lines.push(fmtGiftRow(slug, def));
  }
  lines.push(footer());
  return lines.join("%r");
}

async function renderKnown(
  charGifts: string[],
  pack: IPack | null = null,
): Promise<string> {
  const lines: string[] = [header("Gifts Known")];
  if (charGifts.length === 0) {
    lines.push("  (You know no gifts.)");
  } else {
    // Resolve each known name to slug + def for sorting by level.
    const rows: Array<{ slug: string; def: IGiftDef }> = [];
    const unknown: string[] = [];
    for (const name of charGifts) {
      const want = name.toLowerCase();
      const match = Object.entries(WTA_GIFTS).find(
        ([, d]) => d.name.toLowerCase() === want,
      );
      if (match) rows.push({ slug: match[0], def: match[1] });
      else unknown.push(name);
    }
    rows.sort((a, b) =>
      a.def.level - b.def.level || a.def.name.localeCompare(b.def.name)
    );
    for (const { slug, def } of rows) lines.push(fmtGiftRow(slug, def));
    for (const u of unknown) lines.push(`  %cr??%cn ${u} (not in data file)`);
  }
  if (pack && pack.totemBoons && pack.totemBoons.length > 0) {
    lines.push(`  %cw-- Totem Boons (${pack.totem || "pack totem"}) --%cn`);
    for (const b of pack.totemBoons) {
      lines.push(`  %cy[totem boon]%cn ${b}  %cw[${boonSlugRender(b)}]%cn`);
    }
  }
  lines.push(footer());
  return lines.join("%r");
}

// Boon helpers live in commands/giftBoon.ts (imported above).

/** Lowercase-hyphenated slug used in the boon list rendering. */
function boonSlugRender(boon: string): string {
  return boon.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function renderInfo(slug: string, def: IGiftDef): Promise<string> {
  return [
    header(def.name),
    `  Slug:    ${slug}`,
    `  Level:   ${def.level}`,
    `  Source:  ${def.source.join(", ")}`,
    footer(),
  ].join("%r");
}

addCmd({
  name: "+gift",
  pattern: /^\+gift(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+gift[/switch] [<arg>]  -- Werewolf gifts: list, info, use.

SYNTAX
  +gift                       List gifts your character knows.
  +gift/list [<level>]        List the catalog; optional level filter (1-5).
  +gift/info <slug>           Details for a single gift.
  +gift/use <slug>            Activate a known gift (spends Gnosis = level).

EXAMPLES
  +gift/list 1
  +gift/info mothers-touch
  +gift/use mothers-touch

SEE ALSO: +help gift, +help gnosis, +help rage, +help frenzy`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // /list [level]
    if (sw === "list") {
      let level: number | undefined;
      if (arg) {
        const n = Number.parseInt(arg, 10);
        if (!Number.isInteger(n) || n < 1 || n > 5) {
          u.send("Level filter must be an integer 1..5.");
          return;
        }
        level = n;
      }
      u.send(await renderCatalog(level));
      return;
    }

    // /info <slug>
    if (sw === "info") {
      if (!arg) { u.send("Usage: +gift/info <slug>"); return; }
      const hit = lookupGift(arg);
      if (!hit) { u.send(`Unknown gift: ${arg}`); return; }
      u.send(await renderInfo(hit.key, hit.def));
      return;
    }

    // From here on the actor's own character is required.
    const char = await findByPlayer(u.me.id);
    if (!char) { u.send("You have no character on file."); return; }

    // Resolve pack (if any) -- used for totem-boon listing AND boon use.
    // Totem boons via +gift/use are available to any pack member (including
    // kinfolk); the WtA gate below applies only to the gift catalog path.
    const pack = char.packId ? await findPackById(char.packId) : null;

    // Non-WtA may still invoke totem boons via +gift/use IF they are in a
    // pack with a totem; otherwise gifts are WtA-only.
    if (char.splat !== "wta") {
      const isBoonAttempt = sw === "use" && !!arg && !!findBoon(pack, arg);
      if (!isBoonAttempt) {
        u.send("Only Garou (WtA) characters can use gifts.");
        return;
      }
    }

    // /use <slug>
    if (sw === "use") {
      if (!arg) { u.send("Usage: +gift/use <slug>"); return; }

      // Totem-boon path (open to all pack members, kinfolk included).
      // Helper lives in commands/giftBoon.ts so audit guards on this file
      // remain stable. Returns true when handled.
      if (await tryUseTotemBoon(u, char, pack, arg)) return;

      const block = frenzyBlockMessage(char, "activate a gift");
      if (block) { u.send(block); return; }

      const result = activateGift(char, arg);
      if (!result.ok) { u.send(result.message); return; }

      // Resolve the structured cost (action path) or legacy single-Gnosis.
      const breakdown = result.costBreakdown ??
        { gnosis: result.cost ?? result.level ?? 1 };

      // Fail-closed pre-check across ALL pools BEFORE spending any.
      const spends: Array<{ pool: "gnosis" | "willpower" | "rage"; amt: number }> = [];
      if (breakdown.gnosis)    spends.push({ pool: "gnosis",    amt: breakdown.gnosis });
      if (breakdown.willpower) spends.push({ pool: "willpower", amt: breakdown.willpower });
      if (breakdown.rage)      spends.push({ pool: "rage",      amt: breakdown.rage });

      for (const s of spends) {
        const spend = spendPool(char, s.pool, s.amt);
        if (!spend.ok) { u.send(spend.message); return; }
      }

      // Commit each spend.
      const spent: string[] = [];
      for (const s of spends) {
        const spend = spendPool(char, s.pool, s.amt);
        if (!spend.ok) { u.send(spend.message); return; }
        if (s.pool === "gnosis")    char.gnosisCurrent    = spend.remaining;
        if (s.pool === "willpower") char.willpowerCurrent = spend.remaining;
        if (s.pool === "rage")      char.rageCurrent      = spend.remaining;
        spent.push(`-${s.amt} ${s.pool[0].toUpperCase() + s.pool.slice(1)}`);
      }

      // Per-gift on-activation effects. Kept small; if this grows past
      // a handful, lift into a giftEffects registry.
      if (result.slug === "resist-pain" || result.slug === "resist pain") {
        // W20 Philodox L2: ignore wound penalties for the remainder of
        // the scene. 30 minutes is the conventional MUSH "scene" length.
        const SCENE_MS = 30 * 60 * 1000;
        char.ignoreWoundsUntil = Date.now() + SCENE_MS;
      }

      await saveChar(char);

      gameHooks.emit("wod20th:gift-used", {
        playerId: u.me.id,
        charId: char.id,
        slug: result.slug,
        cost: result.cost ?? 0,
        costBreakdown: breakdown,
        poolSize: result.poolSize,
        netSuccesses: result.roll?.netSuccesses,
        botch: result.roll?.botch,
      });

      const loginName = u.util.displayName(u.me, u.me);
      const seenAs = shiftedDisplayName(char, loginName);
      const costStr = spent.length ? spent.join(", ") : `-${result.level ?? 0} Gnosis`;
      u.send(
        `%cgYou activate %ch${result.name}%cn%cg ` +
        `(level %cy${result.level}%cn%cg, ${costStr}).%cn`,
      );
      if (result.roll && result.poolLabel) {
        const r = result.roll;
        const outcome = r.botch
          ? "%crBOTCH%cn"
          : r.exceptional
            ? `%cgexceptional (${r.netSuccesses})%cn`
            : r.netSuccesses > 0
              ? `%cg${r.netSuccesses} success${r.netSuccesses === 1 ? "" : "es"}%cn`
              : "%cyfailure%cn";
        u.send(
          `  Roll: %cw${result.poolLabel}%cn (${r.pool}d, diff ${r.difficulty}) ` +
          `[${r.dice.join(",")}] -> ${outcome}`,
        );
      }
      if (result.action?.description) {
        u.send(`  %cwEffect:%cn ${result.action.description}`);
      }
      poseRoom(
        u,
        `%cy${seenAs}%cn invokes the gift %ch${result.name}%cn.`,
      );
      return;
    }

    if (sw) {
      u.send(`Unknown switch: /${sw}. See +help gift.`);
      return;
    }

    // No switch -- list known gifts (and totem boons, if packed).
    u.send(await renderKnown(char.gifts ?? [], pack));
  },
});
