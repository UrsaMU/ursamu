/** +paradox — AI fights with Paradoxware (Nodejacker). */
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
import { requireChar, saveChar } from "../engine/sheet-io.ts";
import { NET_AI, PARADOXWARE } from "../engine/catalog.ts";
import {
  clearAiFight,
  startAiFight,
  strikeParadox,
} from "../engine/net-ai.ts";
import { formatLootLines } from "../engine/company-loot.ts";
import { defendConsole } from "../engine/net-hardware.ts";

addCmd({
  name: "+paradox",
  pattern: /^\+paradox(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+paradox[/<switch>] [args]  — AI + Paradoxware.

Switches:
  /scan|/list     AI classes
  /ware           Paradoxware kits
  /start <ai>     Engage AI (rolls DS)
  /strike <ware>  Deploy paradoxware
  /status         Current fight
  /flee           Clear fight
  /data           Company loot bank
  /defend <n>     Test firewall vs attack total

Examples:
  +paradox/start architect
  +paradox/strike eschatology
  +paradox/data`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }

    if (!sw || sw === "status" || sw === "show") {
      const f = c.net?.aiFight;
      const lines = [header("PARADOX")];
      if (!f) {
        lines.push(`  ${dim("No AI engaged.")}`);
        lines.push(
          `  ${dim("+paradox/start <ai> · /ware · /scan")}`,
        );
      } else {
        lines.push(
          `  ${val(f.name)} DS${f.ds}/${f.dsMax}` +
            (f.paradox ? ` ${dim(f.paradox)}` : ""),
        );
        lines.push(
          `  ${dim("+paradox/strike <ware>")}`,
        );
      }
      lines.push(footer("NET"));
      u.send(lines.join("\r\n"));
      return;
    }

    if (sw === "scan" || sw === "list" || sw === "ai") {
      const lines = [header("AI CLASSES")];
      for (const a of NET_AI) {
        lines.push(
          `  ${val(a.slug)} DS${a.dsBase}+2d6` +
            ` ${dim(String(a.name))}`,
        );
      }
      lines.push(footer());
      u.send(lines.join("\r\n"));
      return;
    }

    if (sw === "ware" || sw === "kits" || sw === "catalog") {
      const lines = [header("PARADOXWARE")];
      for (const p of PARADOXWARE) {
        const vs = ((p.vs as string[]) ?? []).join(",") ||
          "all";
        lines.push(
          `  ${val(p.slug)} ${p.cost}b¥` +
            ` sl${p.slots} vs ${dim(vs)}`,
        );
      }
      lines.push(footer());
      u.send(lines.join("\r\n"));
      return;
    }

    if (sw === "start" || sw === "engage" || sw === "jack") {
      if (!arg) {
        u.send(
          `${ERR}Usage: ${val("+paradox/start <ai>")}`,
        );
        return;
      }
      const r = startAiFight(c, arg);
      if (!r.ok) {
        u.send(`${ERR}${r.error}`);
        return;
      }
      await saveChar(u, r.next);
      u.send(
        [`${OK}AI`, ...r.notes.map((n) => `  ${n}`)]
          .join("\r\n"),
      );
      return;
    }

    if (
      sw === "strike" || sw === "hit" || sw === "use" ||
      sw === "cast"
    ) {
      if (!arg) {
        u.send(
          `${ERR}Usage: ${val("+paradox/strike <ware>")}`,
        );
        return;
      }
      const r = strikeParadox(c, arg);
      if (!r.ok) {
        u.send(`${ERR}${r.error}`);
        return;
      }
      await saveChar(u, r.next);
      u.send(
        [
          r.won ? `${OK}AI COMPROMISED` : `${ylw("STRIKE")}`,
          ...r.notes.map((n) => `  ${n}`),
        ].join("\r\n"),
      );
      return;
    }

    if (sw === "flee" || sw === "clear" || sw === "end") {
      await saveChar(u, clearAiFight(c));
      u.send(`${OK}Jacked out of AI fight.`);
      return;
    }

    if (sw === "data" || sw === "loot" || sw === "files") {
      u.send(
        [
          header("COMPANY DATA"),
          ...formatLootLines(c),
          footer("NET"),
        ].join("\r\n"),
      );
      return;
    }

    if (sw === "defend" || sw === "fw" || sw === "firewall") {
      const atk = Number(arg);
      if (!Number.isFinite(atk) || atk < 1) {
        u.send(
          `${ERR}Usage: ${val("+paradox/defend <attackTotal>")}`,
        );
        return;
      }
      const r = defendConsole(c, atk);
      await saveChar(u, r.next);
      u.send(
        [
          r.held ? `${OK}HELD` : `${ERR}BREACHED`,
          ...r.notes.map((n) => `  ${n}`),
        ].join("\r\n"),
      );
      return;
    }

    // bare +paradox eschatology → strike if fighting
    if (!sw && arg) {
      const r = strikeParadox(c, arg);
      if (!r.ok) {
        u.send(`${ERR}${r.error}`);
        return;
      }
      await saveChar(u, r.next);
      u.send(
        [
          r.won ? `${OK}AI COMPROMISED` : `${ylw("STRIKE")}`,
          ...r.notes.map((n) => `  ${n}`),
        ].join("\r\n"),
      );
      return;
    }

    u.send(
      `${ERR}Switches: /scan /ware /start /strike` +
        ` /status /data /defend /flee`,
    );
  },
});
