/** +sheet — Sprawl Goons character sheet (engine layout chrome). */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK, IDBObj } from "@ursamu/ursamu";
import {
  footer,
  ARR,
  ERR,
  header,
  dim,
  panelClose,
  panelOpen,
  gauge,
  divider,
  nameHdr,
  plain,
  row,
  val,
  ylw,
} from "./chrome.ts";
import {
  type ISprawlChar,
  overloadFrom,
  readSprawl,
} from "../db/schemas.ts";
import { getInventory } from "../engine/sheet-io.ts";
import {
  displayName,
  itemDisplayLines,
} from "../engine/items.ts";
import { effectiveLoadoutMax } from "../engine/worn-gear.ts";
import {
  buildSheetPayload,
  emitSprawl,
  sheetGear,
} from "./frame.ts";

function sheetOf(obj: IDBObj): ISprawlChar | null {
  return readSprawl(
    obj.state as Record<string, unknown> | undefined,
  );
}

function renderFullSheet(
  target: IDBObj,
  moniker: string,
  c: ISprawlChar,
  items: IDBObj[],
  load: number,
): string {
  const s = c.stats;
  const max = effectiveLoadoutMax(c.loadoutMax, items);
  const over = overloadFrom(load, max);
  // Count with sheet/db name; paint with @moniker / gradient.
  const countName = plain(
    String(c.name || target.name || "Goon"),
  ).trim() || "Goon";
  const showName = moniker.trim() || countName;
  const lines = [
    panelOpen("SHEET", c.chargenComplete ? "LIVE" : "DRAFT"),
    nameHdr(showName, c.backgroundName || "GOON", countName),
    divider("STATS"),
    row("Morphology", val(s.morphology)),
    row("Equilibrium", val(s.equilibrium)),
    row("Reaction", val(s.reaction)),
    row("Cognition", val(s.cognition)),
    row("Affinity", val(s.affinity)),
    divider("CONDITION"),
    `  Resilience  ${gauge(c.resilience, c.resilienceMax)}` +
    `  ${val(c.resilience)}/${val(c.resilienceMax)}`,
    row(
      "Loadout",
      `${val(load)}/${val(max)}` +
        (max !== c.loadoutMax
          ? ` ${dim("(base " + c.loadoutMax + ")")}`
          : "") +
        (over ? ` ${ylw("OVER -" + over)}` : ""),
    ),
    row("bityuan", `${val(c.bityuan)} b¥`),
    row(
      "AP / Lv",
      `${val(c.ap)} pool · life ${val(c.apTotal ?? 0)}` +
        ` · Lv${val(c.level)}`,
    ),
  ];
  if (c.edgeName) {
    lines.push(divider("EDGE"));
    lines.push(row("Edge", val(c.edgeName)));
  }
  if (c.affectations.length) {
    lines.push(divider("LOOK"));
    for (const a of c.affectations) {
      lines.push(`  ${dim(a)}`);
    }
  }
  if (c.quirks.length) {
    lines.push(divider("QUIRKS"));
    for (const q of c.quirks) {
      lines.push(`  ${dim(q)}`);
    }
  }
  if (items.length) {
    lines.push(divider("LOADOUT"));
    for (const o of items) {
      for (const row of itemDisplayLines(o)) {
        lines.push(`  ${row}`);
      }
    }
  }
  if (c.augs.length) {
    lines.push(divider("AUGMENTATIONS"));
    for (const a of c.augs) {
      lines.push(`  ${a.name}`);
    }
  }
  if (c.critical) {
    const cr = c.critical;
    lines.push(divider("CRITICAL"));
    lines.push(
      `  ${ylw(cr.location)} sev${val(cr.severity)}` +
        ` (${cr.severityName})`,
    );
    lines.push(`  ${cr.effect}`);
    const bits = ["Glitch"];
    if (cr.penalty) bits.push(`−${cr.penalty} loc stats`);
    if (cr.bleed) bits.push(`bleed ${cr.bleed}`);
    if (cr.dieRounds != null) {
      bits.push(`dying ${cr.dieRounds}rd`);
    }
    if (cr.flags?.includes("no-wield")) bits.push("no-wield");
    if (cr.flags?.includes("no-run")) bits.push("no-run");
    lines.push(`  ${dim(bits.join(" · "))}`);
  }
  lines.push(panelClose("SPRAWL GOONS"));
  return lines.join("\r\n");
}

addCmd({
  name: "+sheet",
  pattern: /^\+sheet(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+sheet[/<switch>] [<player>]  — Character sheet.

Switches:
  /stats     Stats only.
  /loadout   Carried gear (Things — also inv).
  /augs      Cybernetic augmentations.
  /combat    Resilience and criticals.
  /edge      Background edge.

Examples:
  +sheet
  +sheet Alice
  +sheet/combat
  inv`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    let target: IDBObj = u.me;
    if (arg) {
      const found = await u.util.target(u.me, arg, true);
      if (!found) {
        u.send(`${ERR}No such goon on the grid.`);
        return;
      }
      target = found;
    }

    const c = sheetOf(target);
    if (!c || c.chargenStatus === "none") {
      const me = target.id === u.me.id;
      u.send(
        me
          ? `${ARR}No sheet. Type ${val("+chargen")} to jack in.`
          : `${ERR}They have no Sprawl sheet.`,
      );
      return;
    }

    // Moniker/gradient for paint; sheet name for layout math.
    const moniker = u.util.displayName(target, u.me);

    if (!sw || sw === "full") {
      const { items, load } = await getInventory(u, target);
      const max = effectiveLoadoutMax(c.loadoutMax, items);
      const countName = plain(
        String(c.name || target.name || "Goon"),
      ).trim() || "Goon";
      const showName = moniker.trim() || countName;
      const text = renderFullSheet(target, moniker, c, items, load);
      emitSprawl(
        u,
        "sheet",
        buildSheetPayload(c, {
          name: showName,
          load,
          loadMax: max,
          gear: sheetGear(items),
        }) as unknown as Record<string, unknown>,
        text,
      );
      return;
    }
    if (sw === "stats") {
      const s = c.stats;
      u.send(
        [
          header("STATS"),
          `  MOR ${val(s.morphology)} EQU ${val(s.equilibrium)}` +
          ` REA ${val(s.reaction)} COG ${val(s.cognition)}` +
          ` AFF ${val(s.affinity)}`,
          footer()
        ].join("\r\n"),
      );
      return;
    }
    if (sw === "loadout") {
      const { items } = await getInventory(u, target);
      const lines = [header("LOADOUT")];
      if (!items.length) {
        lines.push(`  ${dim("empty pockets")}`);
      }
      for (const o of items) {
        lines.push(`  ${displayName(o)}`);
      }
      lines.push(
        `  ${dim("inv · use <item>")}`,
      );
      lines.push(footer());
      u.send(lines.join("\r\n"));
      return;
    }
    if (sw === "augs") {
      const lines = [header("AUGMENTATIONS")];
      if (!c.augs.length) {
        lines.push(`  ${dim("still meat")}`);
      }
      for (const a of c.augs) {
        lines.push(`  ${a.name}`);
      }
      lines.push(footer());
      u.send(lines.join("\r\n"));
      return;
    }
    if (sw === "combat") {
      u.send(
        [
          header("COMBAT"),
          `  Res ${gauge(c.resilience, c.resilienceMax)}` +
          ` ${val(c.resilience)}/${val(c.resilienceMax)}`,
          c.critical
            ? `  Critical: ${c.critical.location}` +
              ` — ${c.critical.effect}`
            : `  ${dim("No critical injury")}`,
          footer()
        ].join("\r\n"),
      );
      return;
    }
    if (sw === "edge") {
      u.send(
        [
          header("EDGE"),
          `  ${val(c.edgeName || "none")}`,
          `  Background ${dim(c.backgroundName || "—")}`,
          footer()
        ].join("\r\n"),
      );
      return;
    }
    u.send(
      `${ERR}Unknown switch. Valid: /stats /loadout` +
        ` /augs /combat /edge`,
    );
  },
});
