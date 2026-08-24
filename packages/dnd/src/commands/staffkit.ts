/**
 * +staffkit — staff overview for D&D (chargen, XP, delves).
 */
import { addCmd, header, footer, type IUrsamuSDK } from
  "@ursamu/ursamu";
import { listOpenCgen } from "../chargen/job_helpers.ts";
import { approvePlayer } from "../chargen/approve_core.ts";
import { migrateSheet, defaultSheet } from
  "../stats/dnd_sheet.ts";
import { addXp as addXpSheet } from "../stats/rules.ts";
import { formatLevelReady as lvlReady } from
  "../stats/levelup.ts";
import { listSkins } from "../adventure/skins.ts";
import {
  getInstance,
  listInstances,
  countLivingMobs,
  ensureAdventure,
} from "../adventure/site.ts";
import { NPC_TEMPLATES } from "../combat/npc-templates.ts";
import { roomIdOf } from "../combat/session.ts";
import { startRoomFight } from "../combat/start-fight.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

addCmd({
  name: "+staffkit",
  pattern: /^\+staffkit(?:\/(\S+))?\s*(.*)/i,
  lock: "connected admin+",
  category: "Dnd",
  help: `+staffkit — D&D staff tools.

Switches:
  /cgen /approve
  /xp <player>=<n>
  /delve [slug]
  /encounter <template>[=name]
  /skins /towns

See: +help staffkit`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) {
      u.send("Permission denied.");
      return;
    }
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (!sw || sw === "help") {
      u.send(
        [
          header("D&D STAFFKIT"),
          "  +staffkit/cgen              Open CGEN jobs",
          "  +staffkit/approve <player>  Approve sheet",
          "  +staffkit/xp <player>=<n>   Award XP",
          "  +staffkit/delve [slug]      Live delve status",
          "  +staffkit/encounter <tmpl>  Spawn foe here",
          "  +staffkit/skins             List delve skins",
          "  +staffkit/towns             Campaign towns",
          "  +staffkit/caravans          Escort jobs",
          "  +approve / +deny / +unapprove",
          footer(),
        ].join("\n"),
      );
      return;
    }

    if (sw === "towns" || sw === "campaign") {
      const { campaignStatus } = await import(
        "../world/campaign.ts"
      );
      u.send("%ch%cySTAFF>>%cn Campaign:");
      for (const l of await campaignStatus()) u.send(l);
      u.send("  Seed: +dnd/world/seed");
      return;
    }

    if (sw === "caravans" || sw === "escorts") {
      const { listCaravans } = await import(
        "../world/caravans.ts"
      );
      u.send("%ch%cySTAFF>>%cn Caravans:");
      for (const c of listCaravans()) {
        u.send(
          `  ${c.slug.padEnd(14)} ${c.route}  ` +
            `${c.payGp}gp/${c.payXp}xp`,
        );
      }
      return;
    }

    if (sw === "skins") {
      for (const s of listSkins()) {
        u.send(
          `  ${s.slug.padEnd(16)} T${s.tier} ${s.kind}  ${s.name}`,
        );
      }
      return;
    }

    if (sw === "xp" || sw === "award") {
      const eq = arg.indexOf("=");
      if (eq < 0) {
        u.send("Usage: +staffkit/xp <player>=<amount>");
        return;
      }
      const who = arg.slice(0, eq).trim();
      const n = parseInt(arg.slice(eq + 1).trim(), 10);
      if (!who || isNaN(n) || n < 0) {
        u.send("Bad player or amount.");
        return;
      }
      const t = await u.util.target(u.me, who, true);
      if (!t) {
        u.send("Not found.");
        return;
      }
      // deno-lint-ignore no-explicit-any
      if (!(t.state as any)?.dnd) {
        u.send("No D&D sheet.");
        return;
      }
      let sheet = migrateSheet(
        // deno-lint-ignore no-explicit-any
        (t.state as any).dnd,
      );
      sheet = addXpSheet(sheet, n);
      await u.db.modify(t.id, "$set", { "data.dnd": sheet });
      u.send(
        `%ch%cySTAFF>>%cn ${t.name} +${n} XP (now ${sheet.xp}).`,
      );
      u.send(
        `%ch%cgLEVEL>>%cn ${lvlReady(sheet)}`,
        t.id,
      );
      return;
    }

    if (sw === "delve" || sw === "runs") {
      const runs = await listInstances();
      if (!runs.length) {
        u.send("%ch%cySTAFF>>%cn No active delve instances.");
        return;
      }
      const filter = arg.toLowerCase();
      for (const r of runs) {
        if (filter && !r.slug.includes(filter) &&
          !(r.skin || "").includes(filter)) {
          continue;
        }
        const left = await countLivingMobs(r);
        u.send(
          `  ${r.slug}  skin=${r.skin || "?"}  ` +
            `foes=${left}  cleared=${r.cleared}  ` +
            `entry=#${r.entryId}`,
        );
      }
      if (arg && getInstance) {
        const one = await getInstance(arg);
        if (one) {
          u.send(
            `  rooms: ${Object.keys(one.rooms).join(", ")}`,
          );
        }
      }
      return;
    }

    if (sw === "encounter" || sw === "spawn") {
      const roomId = roomIdOf(u);
      if (!roomId) {
        u.send("Not in a room.");
        return;
      }
      let tmpl = arg;
      let name = "";
      if (arg.includes("=")) {
        const [a, b] = arg.split("=").map((s) => s.trim());
        tmpl = a!;
        name = b!;
      }
      const t = NPC_TEMPLATES[tmpl.toLowerCase()];
      if (!t) {
        u.send(
          `Unknown template. Sample: goblin, orc, wolf, wight`,
        );
        return;
      }
      const sheet = migrateSheet(defaultSheet());
      sheet.class = "Monster";
      sheet.hp = { max: t.hp, current: t.hp, temp: 0 };
      sheet.ac = t.ac;
      sheet.xp = t.xp;
      sheet.abilities = {
        strength: t.abilities.strength ?? 10,
        dexterity: t.abilities.dexterity ?? 10,
        constitution: t.abilities.constitution ?? 10,
        intelligence: t.abilities.intelligence ?? 10,
        wisdom: t.abilities.wisdom ?? 10,
        charisma: t.abilities.charisma ?? 10,
      };
      // deno-lint-ignore no-explicit-any
      (sheet as any).aiKey = "aggressive";
      // deno-lint-ignore no-explicit-any
      (sheet as any).drops = t.drops ?? [];
      const npc = await u.db.create({
        flags: new Set(["thing", "npc"]),
        location: roomId,
        name: name || t.name || tmpl,
        state: {
          name: name || t.name || tmpl,
          dnd: sheet,
          owner: u.me.id,
        },
      });
      u.send(
        `%ch%cySTAFF>>%cn Spawned ${npc.name} (#${npc.id}). ` +
          `+combat/start to engage.`,
      );
      return;
    }

    if (sw === "fight") {
      const r = await startRoomFight(u);
      u.send(r.ok ? "Combat started." : (r.message ?? "Fail"));
      return;
    }

    if (sw === "reset" && arg) {
      const r = await ensureAdventure(arg, { reset: true });
      u.send(r.message);
      return;
    }

    if (sw === "cgen" || sw === "pending" || sw === "list") {
      const open = await listOpenCgen();
      const lines = [header("OPEN CGEN JOBS")];
      if (!open.length) {
        lines.push("  (none)");
      } else {
        for (const j of open) {
          const who = j.submitterName || j.submittedBy || "?";
          lines.push(
            `  #${j.number}  ${u.util.ljust(String(who), 18)} ` +
              `${j.title || "Chargen"}`,
          );
        }
      }
      lines.push(
        "  Use %ch+approve <player>%cn or " +
          "%ch+job/close <n>%cn.",
      );
      lines.push(footer());
      u.send(lines.join("\n"));
      return;
    }

    if (sw === "approve") {
      if (!arg) {
        u.send("Usage: +staffkit/approve <player>");
        return;
      }
      const target = await u.util.target(u.me, arg, true);
      if (!target) {
        u.send(`No player matches '${arg}'.`);
        return;
      }
      const result = await approvePlayer({
        playerId: target.id,
        staffId: u.me.id,
        staffName: u.util.displayName(u.me, u.me),
        completeJob: true,
        u,
        target,
      });
      if (!result.ok) {
        u.send(`%cr${result.error}%cn`);
        return;
      }
      if (result.already) {
        u.send(`${result.name} is already approved.`);
        return;
      }
      u.send(
        `%ch%cgSTAFFKIT>>%cn Approved ${result.name}.` +
          (result.job?.number != null
            ? ` CGEN #${result.job.number} closed.`
            : ""),
      );
      return;
    }

    u.send("Unknown switch. Try +staffkit for a menu.");
  },
});
