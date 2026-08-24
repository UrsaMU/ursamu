/** +range — set engagement range for auto attack mods. */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  ARR,
  ERR,
  OK,
  dim,
  footer,
  header,
  val,
  ylw,
} from "./chrome.ts";
import {
  guideRows,
  weaponRangeM,
} from "../engine/range.ts";
import {
  getInventory,
  requireChar,
  saveChar,
} from "../engine/sheet-io.ts";
import { itemData } from "../engine/items.ts";

addCmd({
  name: "+range",
  pattern: /^\+range(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+range[/<switch>] [m]  — Engagement range (metres).

Attack auto-applies PB (≤1m +3), close (≤5m), and
out-of-range Glitch when beyond the weapon envelope.

Switches:
  (none)|/show   Current range + guide.
  /set <m>       Set engagement metres.
  /clear         Unset (manual modes only).
  /guide         Weapon range bands from the book.

Examples:
  +range 25
  +range/set 1
  +range/clear
  +range/guide`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }

    const setM = async (m: number) => {
      const next = { ...c, engageRangeM: m };
      await saveChar(u, next);
      u.send(
        `${OK}Engagement range ${val(m)}m` +
          ` ${dim("(auto PB / OOR on +attack)")}.`,
      );
    };

    if (sw === "clear" || sw === "off" || arg === "clear") {
      const next = { ...c };
      delete next.engageRangeM;
      await saveChar(u, next);
      u.send(`${OK}Range cleared — modes are manual.`);
      return;
    }

    if (sw === "guide" || sw === "table") {
      const lines = [header("RANGE GUIDE")];
      for (const r of guideRows()) {
        lines.push(
          `  ${val(String(r.rangeM).padStart(4))}m  ` +
            `${dim(String(r.weapons))}`,
        );
      }
      lines.push(
        `  ${dim("PB ≤1m +3 · close ≤5m · OOR = Glitch")}`,
      );
      lines.push(footer("SPRAWL"));
      u.send(lines.join("\r\n"));
      return;
    }

    const raw = sw === "set" || sw === "to" ? arg : (sw || arg);
    if (raw && /^\d+(\.\d+)?m?$/i.test(raw)) {
      const m = Number(raw.replace(/m$/i, ""));
      if (!Number.isFinite(m) || m < 0 || m > 5000) {
        u.send(`${ERR}Metres 0–5000.`);
        return;
      }
      await setM(Math.floor(m));
      return;
    }

    // show
    const { items } = await getInventory(u, u.me);
    const gun = items.find((o) =>
      itemData(o)?.slot === "wielded"
    ) ?? items.find((o) => {
      const d = itemData(o);
      return d &&
        (d.kind === "firearm" || d.kind === "heavy");
    });
    const wd = gun ? itemData(gun) : null;
    const wMax = wd ? weaponRangeM(wd) : null;
    const lines = [
      header("RANGE"),
      `  Engage ${c.engageRangeM != null
        ? val(c.engageRangeM + "m")
        : dim("unset")}`,
      gun
        ? `  Weapon ${val(gun.name ?? wd?.slug ?? "?")}` +
          ` eff ${val(wMax != null ? wMax + "m" : "—")}`
        : `  Weapon ${dim("none wielded")}`,
      `  ${ylw("+range <m>")} set · ` +
      `${val("+range/guide")} table`,
      footer("SPRAWL"),
    ];
    u.send(lines.join("\r\n"));
  },
});
