/** +drug — narcotics use, addiction, withdrawal. */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  footer,
  ARR,
  ERR,
  OK,
  bad,
  header,
  dim,
  divider,
  val,
  ylw,
} from "./chrome.ts";
import {
  requireChar,
} from "../engine/sheet-io.ts";
import {
  NARCOTICS,
  WITHDRAWAL,
  roll2d6Key,
  pickByRoll,
} from "../engine/catalog.ts";
import {
  carriedItems,
  itemData,
  resolveItemRef,
} from "../engine/items.ts";
import {
  applyUseEffect,
  doseNarcotic,
} from "../engine/use-effect.ts";

addCmd({
  name: "+drug",
  pattern: /^\+drug(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+drug[/<switch>] [slug]  — Street narcotics (book p.55).

Switches:
  /catalog           List narcotics + addiction DS
  /use <ref|slug>    Prefer inventory Thing; else catalog dose
  /comedown          Glitch window after use (2d6 hours)
  /withdraw          Roll withdrawal table

Prefer: use <pack> (builtin) on a carried dose pack.

Examples:
  +drug/catalog
  +drug/use hyperdex
  use brazilian-hyperdex
  +drug/withdraw`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "catalog").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "catalog" || sw === "list") {
      const lines = [header("NARCOTICS")];
      for (const n of NARCOTICS) {
        lines.push(
          `  ${val(n.slug)} DS${val(n.addictionDs as number)}` +
            ` ${dim(String(n.name))}`,
        );
        lines.push(
          `     ${dim(String(n.effect))} (${n.duration})`,
        );
      }
      lines.push(
        `  ${ylw("Note:")} comedown = Glitch 2d6 hours` +
          ` after use (p.56)`,
      );
      lines.push(footer());
      u.send(lines.join("\r\n"));
      return;
    }

    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }

    if (sw === "use") {
      if (!arg) {
        u.send(
          `${ERR}Usage: ${val("+drug/use <slug|item>")}` +
            ` or ${val("use <pack>")}`,
        );
        return;
      }
      // Prefer carried Thing (by ref or drug useEffect)
      let thing = await resolveItemRef(u, u.me.id, arg);
      if (!thing) {
        const all = await carriedItems(u, u.me.id);
        const lc = arg.toLowerCase();
        thing = all.find((o) => {
          const d = itemData(o);
          if (!d) return false;
          if (d.slug === lc) return true;
          const ef = (d.useEffect ?? "").toLowerCase();
          return ef === `drug:${lc}` || ef.endsWith(lc);
        }) ?? null;
      }
      if (thing && itemData(thing)?.useEffect?.startsWith("drug:")) {
        const r = await applyUseEffect(u, u.me, thing);
        if (r.message) u.send(r.message);
        return;
      }
      // Catalog one-shot (no inventory pack)
      const r = await doseNarcotic(u, u.me, arg);
      if (r.message) u.send(r.message);
      return;
    }

    if (sw === "withdraw" || sw === "withdrawal") {
      const key = roll2d6Key();
      const row = pickByRoll(WITHDRAWAL, key) ??
        WITHDRAWAL[0];
      u.send(
        [
          header("WITHDRAWAL"),
          `  Roll ${val(key)} — ${ylw(String(row.name))}`,
          row.notes
            ? `  ${dim(String(row.notes))}`
            : "",
          `  ${dim("Be kind. Keep it fun. (p.56)")}`,
          footer()
        ].filter(Boolean).join("\r\n"),
      );
      return;
    }

    if (sw === "comedown") {
      u.send(
        `${OK}Comedown active: roll with ${bad("Glitch")}` +
          ` for 2d6 hours (${val("+roll … +glitch")}).`,
      );
      return;
    }

    u.send(`${ERR}Switches: /catalog /use /withdraw /comedown`);
  },
});
