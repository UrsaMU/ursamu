/**
 * +spells — browse SRD spell catalog.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  SPELLS,
  spellBySlug,
  spellsByLevel,
} from "../data/catalog.ts";
import { migrateSheet } from "../stats/dnd_sheet.ts";

addCmd({
  name: "+spells",
  pattern: /^\+spells?(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+spells [<level|name>] — Browse SRD spells.\n` +
    `+spells/known — Your known list.\n` +
    `+spells/info <name> — One spell detail.`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "known" || sw === "mine") {
      // deno-lint-ignore no-explicit-any
      const raw = (u.me.state as any)?.dnd;
      if (!raw) {
        u.send("No character sheet.");
        return;
      }
      const s = migrateSheet(raw);
      const list = s.spells?.length
        ? s.spells.join(", ")
        : "(none)";
      u.send(`%ch%cgSPELLS>>%cn Known: ${list}`);
      return;
    }

    if (sw === "info" || sw === "view" || sw === "show") {
      const sp = spellBySlug(arg);
      if (!sp) {
        u.send(`Unknown spell "${arg}".`);
        return;
      }
      const bits = [
        `L${sp.level} ${sp.school}`,
        sp.castingTime,
        sp.range,
        sp.duration,
      ].filter(Boolean);
      if (sp.concentration) bits.push("conc");
      if (sp.ritual) bits.push("ritual");
      if (sp.damage) {
        bits.push(`${sp.damage} ${sp.damageType || ""}`.trim());
      }
      if (sp.healing) bits.push(`heal ${sp.healing}`);
      if (sp.tempHp) bits.push(`tempHP ${sp.tempHp}`);
      if (sp.attack) bits.push(`${sp.attack} atk`);
      if (sp.save) {
        bits.push(
          `save ${sp.save}` +
            (sp.halfOnSave ? " (1/2)" : ""),
        );
      }
      if (sp.autoHit) bits.push("auto-hit");
      u.send(
        `%ch%cgSPELLS>>%cn %ch${sp.name}%cn — ` +
          bits.join(" · "),
      );
      return;
    }

    const q = (sw && !["list", "all"].includes(sw) ? sw : "") ||
      arg.toLowerCase();

    if (q && /^\d+$/.test(q)) {
      const lvl = parseInt(q, 10);
      const list = spellsByLevel(lvl);
      if (!list.length) {
        u.send(`No level-${lvl} spells in catalog.`);
        return;
      }
      const names = list.map((s) => s.name).join(", ");
      u.send(
        `%ch%cgSPELLS>>%cn Level ${lvl} (${list.length}): ` +
          names,
      );
      return;
    }

    if (q) {
      const sp = spellBySlug(q);
      if (sp) {
        u.cmd.args = ["info", q];
        // re-enter info path
        const bits = [
          `L${sp.level}`,
          sp.school,
          sp.damage
            ? `${sp.damage} ${sp.damageType || ""}`
            : "",
          sp.healing ? `heal ${sp.healing}` : "",
          sp.attack || "",
          sp.save ? `save ${sp.save}` : "",
        ].filter(Boolean);
        u.send(
          `%ch%cgSPELLS>>%cn %ch${sp.name}%cn — ` +
            bits.join(" · "),
        );
        return;
      }
      const hits = Object.values(SPELLS).filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.slug.includes(q.replace(/\s+/g, "_"))
      );
      if (!hits.length) {
        u.send(`No spells match "${q}".`);
        return;
      }
      u.send(
        `%ch%cgSPELLS>>%cn Match (${hits.length}): ` +
          hits.slice(0, 24).map((s) => s.name).join(", ") +
          (hits.length > 24 ? "…" : ""),
      );
      return;
    }

    // Overview by level
    const counts: string[] = [];
    for (let i = 0; i <= 3; i++) {
      counts.push(`L${i}:${spellsByLevel(i).length}`);
    }
    u.send(
      `%ch%cgSPELLS>>%cn Catalog ${Object.keys(SPELLS).length} ` +
        `spells (${counts.join(" ")}). ` +
        `+spells 1  ·  +spells fireball  ·  +spells/known`,
    );
  },
});
