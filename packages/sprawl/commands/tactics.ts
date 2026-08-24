/** +grenade +suppress +reload — combat tactics from the book. */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  ARR,
  ERR,
  OK,
  bad,
  dim,
  panelClose,
  panelOpen,
  good,
  scan,
  val,
  ylw,
} from "./chrome.ts";
import {
  formatDice,
  gatherBonuses,
  resolveAction,
  applyResilience,
} from "../engine/action.ts";
import { woundGlitch } from "../engine/damage.ts";
import {
  getInventory,
  requireChar,
  saveChar,
} from "../engine/sheet-io.ts";
import {
  displayName,
  itemData,
  writeItemData,
} from "../engine/items.ts";
import {
  magLabel,
  reloadMag,
  spendMag,
} from "../engine/mags.ts";
import { COMBAT_RULES } from "../engine/catalog.ts";

addCmd({
  name: "+grenade",
  pattern: /^\+grenade\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+grenade [open|confined] [+glitch|+upgrade]
  — Throw grenade (Reaction vs Moderate DS10).
  Open +3 dmg / confined +6; blast 5m. Dodge DS12.

Examples:
  +grenade open
  +grenade confined +upgrade`,

  exec: async (u: IUrsamuSDK) => {
    const raw = u.util.stripSubs(u.cmd.args[0] ?? "").trim()
      .toLowerCase();
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    const confined = raw.includes("confined") ||
      raw.includes("inside");
    const dmg = confined ? 6 : 3;
    let glitch = woundGlitch(c);
    let upgrade = 0;
    for (const t of raw.split(/\s+/)) {
      if (t === "+glitch" || t === "glitch") glitch++;
      if (t === "+upgrade" || t === "upgrade") upgrade++;
    }
    const { items, load } = await getInventory(u, u.me);
    const gath = gatherBonuses(
      c,
      "reaction",
      0,
      [],
      load,
      items,
    );
    const throwRoll = resolveAction({
      stat: "reaction",
      statValue: c.stats.reaction,
      bonuses: gath.total,
      ds: 10,
      glitch,
      upgrade,
      dangerous: false,
    });
    const outcome = throwRoll.success
      ? good("ON TARGET")
      : bad("MISS / FUMBLE");
    u.send(
      [
        panelOpen("GRENADE", confined ? "CONFINED" : "OPEN"),
        scan(),
        `  Throw total ${val(throwRoll.total)} vs DS10` +
        ` → ${outcome}`,
        `  Dice ${dim(formatDice(throwRoll.dice))}`,
        throwRoll.success
          ? `  Blast damage ${val("+" + dmg)}` +
            ` to all in 5m` +
            (confined ? " (confined)" : " (open)")
          : `  ${dim("GM places scatter / calamity")}`,
        `  Targets dodge: Reaction vs DS12` +
        ` (${val("+roll reaction/12")})`,
        panelClose("FRAG"),
      ].join("\r\n"),
    );
  },
});

addCmd({
  name: "+suppress",
  pattern: /^\+suppress\s+(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+suppress <zone-m> <ds>[,ds…] [+glitch|+upgrade]
  — Full-auto suppressive fire (mag empty).
  Zone width sets bonus: <1m Upgrade; 2m +4; 3m +2;
  4m +1; 5m+ +0+Glitch.

Examples:
  +suppress 2 10,12
  +suppress 5 14`,

  exec: async (u: IUrsamuSDK) => {
    const raw = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const parts = raw.split(/\s+/);
    if (parts.length < 2) {
      u.send(
        `${ERR}Usage: ${val("+suppress <zone-m> <ds>[,ds…]")}`,
      );
      return;
    }
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    const zone = Number(parts[0]);
    if (!Number.isFinite(zone) || zone <= 0) {
      u.send(`${ERR}Zone width in metres required.`);
      return;
    }
    let bonus = 4;
    let upgrade = 0;
    let glitch = woundGlitch(c);
    let note = "full auto +4";
    if (zone < 1) {
      upgrade = 1;
      note = "zone <1m: full auto + Upgrade";
    } else if (zone <= 2) {
      bonus = 4;
      note = "zone ≤2m: full auto +4";
    } else if (zone <= 3) {
      bonus = 2;
      note = "zone ≤3m: +2 (mag empty)";
    } else if (zone <= 4) {
      bonus = 1;
      note = "zone ≤4m: +1 (mag empty)";
    } else {
      bonus = 0;
      glitch += 1;
      note = "zone ≥5m: +0 + Glitch (mag empty)";
    }
    for (const t of parts.slice(2)) {
      if (t === "+glitch" || t === "glitch") glitch++;
      if (t === "+upgrade" || t === "upgrade") upgrade++;
    }
    const dsList = parts[1].split(",").map(Number).filter((n) =>
      Number.isFinite(n)
    );
    if (!dsList.length) {
      u.send(`${ERR}Need at least one target DS.`);
      return;
    }
    const { items, load } = await getInventory(u, u.me);
    const gun = items.find((o) => {
      const d = itemData(o);
      return d &&
        (d.kind === "firearm" || d.kind === "heavy") &&
        d.slot === "wielded";
    }) ?? items.find((o) => {
      const d = itemData(o);
      return d &&
        (d.kind === "firearm" || d.kind === "heavy");
    });
    if (gun) {
      const gd = itemData(gun)!;
      const spent = spendMag(gd, "suppress");
      if (!spent.ok) {
        u.send(
          `${ERR}Magazine empty — ${val("+reload")}.`,
        );
        return;
      }
      await writeItemData(u, gun, spent.data);
    }
    const gath = gatherBonuses(
      c,
      "reaction",
      bonus,
      [note],
      load,
      items,
    );
    const lines = [
      panelOpen("SUPPRESS", `${zone}m`),
      scan(),
      `  ${ylw(note)} — magazine empty`,
    ];
    if (gun) {
      const gd = itemData(gun)!;
      lines.push(`  Mag ${val(magLabel(gd))} ${bad("EMPTY")}`);
    }
    for (const ds of dsList) {
      const r = resolveAction({
        stat: "reaction",
        statValue: c.stats.reaction,
        bonuses: gath.total,
        ds,
        glitch,
        upgrade,
        dangerous: true,
      });
      if (r.success) {
        lines.push(
          `  vs DS${val(ds)} ${good("HIT")}` +
            ` dmg ${val(r.damageToTarget)}` +
            ` (${dim(formatDice(r.dice))} → ${r.total})`,
        );
      } else {
        lines.push(
          `  vs DS${val(ds)} ${ylw("PINNED")}` +
            ` (no dmg; cannot shoot back)` +
            ` total ${val(r.total)}`,
        );
      }
    }
    lines.push(
      `  PC under suppress: Equilibrium vs DS10` +
        ` (or DS12+Glitch if multi)`,
    );
    lines.push(panelClose("FA"));
    u.send(lines.join("\r\n"));
    void COMBAT_RULES;
  },
});

addCmd({
  name: "+reload",
  pattern: /^\+reload\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+reload [snap]  — Top off wielded/carried firearm mag.

Snap: same round, next shot takes Glitch (book).

Examples:
  +reload
  +reload snap`,

  exec: async (u: IUrsamuSDK) => {
    const raw = u.util.stripSubs(u.cmd.args[0] ?? "").trim()
      .toLowerCase();
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    const { items } = await getInventory(u, u.me);
    const gun = items.find((o) => {
      const d = itemData(o);
      return d &&
        (d.kind === "firearm" || d.kind === "heavy") &&
        d.slot === "wielded";
    }) ?? items.find((o) => {
      const d = itemData(o);
      return d &&
        (d.kind === "firearm" || d.kind === "heavy") &&
        d.magMax != null;
    });
    if (!gun) {
      u.send(`${ERR}No firearm to reload. ${val("inv")}`);
      return;
    }
    const d = itemData(gun)!;
    const next = reloadMag(d);
    await writeItemData(u, gun, next);
    if (raw === "snap") {
      u.send(
        `${OK}${val(displayName(gun))} mag ` +
          `${val(magLabel(next))} — snap: next attack` +
          ` add ${bad("+glitch")}.`,
      );
      return;
    }
    u.send(
      `${OK}Reloaded ${val(displayName(gun))}` +
        ` → mag ${val(magLabel(next))}` +
        ` ${dim("(one combat round)")}.`,
    );
  },
});
