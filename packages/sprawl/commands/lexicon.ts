/** +lexicon +rules — setting glossary and rules quick-ref. */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  footer,
  ARR,
  ERR,
  header,
  dim,
  divider,
  val,
  wrap,
} from "./chrome.ts";
import {
  LEXICON,
  COMBAT_RULES,
  HEALING_RULES,
  METAL_EXPRESS,
  DIFFICULTY,
  findByName,
} from "../engine/catalog.ts";

addCmd({
  name: "+lexicon",
  pattern: /^\+lexicon\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+lexicon [<term>]  — Sprawl slang glossary.

Examples:
  +lexicon
  +lexicon arc
  +lexicon tanksuit`,

  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim()
      .toLowerCase();
    const lines = [header("SPRAWL LEXICON")];
    const rows = arg
      ? LEXICON.filter((r) =>
        r.slug.includes(arg) ||
        String(r.term).toLowerCase().includes(arg)
      )
      : LEXICON;
    if (!rows.length) {
      u.send(`${ERR}No match.`);
      return;
    }
    for (const r of rows) {
      lines.push(`  ${val(String(r.term))}`);
      lines.push(...wrap(String(r.def ?? ""), 74, "     "));
    }
    lines.push(footer());
    u.send(lines.join("\r\n"));
  },
});

addCmd({
  name: "+rules",
  pattern: /^\+rules\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+rules [combat|heal|ds|vehicle]  — Quick rules reference.

Examples:
  +rules
  +rules combat
  +rules ds`,

  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim()
      .toLowerCase();
    if (!arg || arg === "ds") {
      const lines = [header("DIFFICULTY SCORES")];
      for (const d of DIFFICULTY) {
        lines.push(
          `  ${val(String(d.name).padEnd(12))}` +
            ` DS${val(d.ds as number)}`,
        );
      }
      lines.push(footer());
      u.send(lines.join("\r\n"));
      if (arg === "ds") return;
    }
    if (!arg || arg === "combat") {
      const c = COMBAT_RULES;
      u.send(
        [
          header("COMBAT QUICK-REF"),
          `  Full auto +${
            (c.fullAuto as { bonus: number } | undefined)
              ?.bonus ?? "?"
          } (mag empty)`,
          `  Burst +2 (×3 before empty)`,
          `  Aim +1/round (max 3)`,
          `  Point blank +3 (<1m)`,
          `  Multi-action → all Glitch`,
          `  Assisted action +1`,
          `  Double 6 explodes; double 1 = nerve DS10`,
          `  No initiative — player-facing Reaction`,
          footer()
        ].join("\r\n"),
      );
      if (arg === "combat") return;
    }
    if (!arg || arg === "heal") {
      const h = HEALING_RULES;
      u.send(
        [
          header("HEALING"),
          `  Safe rest ${val(String(h.fullRestHours))}h` +
            ` → full Resilience`,
          `  Lazarus Patch +${val(3)} Res`,
          `  First aid Cognition success +2 Res`,
          `  Stuns clear after encounter`,
          `  Criticals need a medical pro`,
          footer()
        ].join("\r\n"),
      );
      if (arg === "heal") return;
    }
    if (arg === "vehicle" || arg === "metal") {
      const m = METAL_EXPRESS;
      u.send(
        [
          header("METAL EXPRESS"),
          `  ${dim(String(m.ramming))}`,
          `  ${dim(String(m.pedestrians))}`,
          `  ${dim(String(m.collisions))}`,
          `  Control roll: Reaction vs DS14 dangerous`,
          `  Repair: 10% price per DS lost;` +
            ` 1 person-day per DS`,
          `  ${val("+vehicle/showroom")} for chassis list`,
          footer()
        ].join("\r\n"),
      );
      return;
    }
    if (arg && !["combat", "heal", "ds", "vehicle", "metal"].includes(arg)) {
      u.send(
        `${ERR}Topics: combat heal ds vehicle`,
      );
    }
    void findByName;
  },
});
