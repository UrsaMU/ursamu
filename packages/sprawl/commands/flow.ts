/** +flow +corp +npc — atlas, corps, room NPC objects. */
import { addCmd } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  footer,
  ARR,
  ERR,
  OK,
  header,
  dim,
  divider,
  val,
  wrap,
  ylw,
} from "./chrome.ts";
import {
  ANTAGONISTS,
  CORPS,
  FLOW_DISTRICTS,
  FLOW_LOCATIONS,
} from "../engine/catalog.ts";
import {
  catalogNpc,
  isSprawlNpc,
  loadRoomNpcs,
  npcData,
  spawnNpc,
} from "../engine/npcs.ts";
import { isStaff } from "../engine/sheet-io.ts";

addCmd({
  name: "+flow",
  pattern: /^\+flow(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+flow [districts|<num|name|grid|slug>]  — Flow atlas.

Examples:
  +flow
  +flow districts
  +flow 1
  +flow H3`,

  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const q = arg.toLowerCase();

    if (!arg || q === "districts") {
      const lines = [header("FLOW DISTRICTS")];
      for (const d of FLOW_DISTRICTS) {
        lines.push(
          `  ${dim(String(d.grid ?? "").padEnd(4))} ` +
            `${ylw(String(d.name))} ` +
            `${dim(String(d.slug))}`,
        );
      }
      lines.push(
        `  ${dim("+flow <grid|name|num> for a location")}`,
      );
      lines.push(footer());
      u.send(lines.join("\r\n"));
      return;
    }

    // Location by num / grid / name / slug
    const loc = FLOW_LOCATIONS.find((l) =>
      String(l.num) === arg ||
      String(l.slug).toLowerCase() === q ||
      String(l.grid ?? "").toLowerCase() === q ||
      String(l.name).toLowerCase().includes(q)
    );
    if (loc) {
      const lines = [
        header(String(loc.name)),
        `  ${dim("#" + loc.num)}  ${dim(String(loc.grid ?? ""))}` +
        `  ${dim(String(loc.slug))}`,
      ];
      if (loc.blurb) {
        lines.push(...wrap(String(loc.blurb), 74, "  "));
      }
      lines.push(footer());
      u.send(lines.join("\r\n"));
      return;
    }

    // District by grid / name
    const dist = FLOW_DISTRICTS.find((d) =>
      String(d.grid ?? "").toLowerCase() === q ||
      String(d.slug).toLowerCase() === q ||
      String(d.name).toLowerCase().includes(q)
    );
    if (dist) {
      const lines = [
        header(String(dist.name)),
        `  ${dim(String(dist.grid ?? ""))}  ${dim(dist.slug)}`,
      ];
      if (dist.blurb) {
        lines.push(...wrap(String(dist.blurb), 74, "  "));
      }
      // Locations sharing this grid prefix
      const g = String(dist.grid ?? "").toUpperCase();
      const locs = FLOW_LOCATIONS.filter((l) =>
        String(l.grid ?? "").toUpperCase().startsWith(g[0] ?? "")
      ).slice(0, 20);
      if (locs.length) {
        lines.push(divider("NEARBY"));
        for (const l of locs) {
          lines.push(
            `  ${dim(String(l.num).padStart(2))} ` +
              `${dim(String(l.grid ?? "").padEnd(4))} ` +
              `${String(l.name)}`,
          );
        }
      }
      lines.push(footer());
      u.send(lines.join("\r\n"));
      return;
    }

    u.send(
      `${ERR}Unknown Flow ref. ` +
        `${val("+flow districts")}`,
    );
  },
});

addCmd({
  name: "+corp",
  pattern: /^\+corp(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+corp [<name>]  — Corporations.

Examples:
  +corp
  +corp genexus`,

  exec: async (u: IUrsamuSDK) => {
    const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim()
      .toLowerCase();
    const lines = [header("CORPORATIONS")];
    for (const c of CORPS) {
      if (
        arg &&
        !c.slug.includes(arg) &&
        !String(c.name).toLowerCase().includes(arg)
      ) {
        continue;
      }
      lines.push(`  ${ylw(String(c.name))} ${dim(c.slug)}`);
      if (c.blurb) {
        lines.push(...wrap(String(c.blurb), 74, "     "));
      }
    }
    lines.push(footer());
    u.send(lines.join("\r\n"));
  },
});

addCmd({
  name: "+npc",
  pattern: /^\+npc(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+npc[/<switch>] [args]  — Antagonists as room objects.

NPCs are Things (flag npc) in the room. Book p.26:
DS = Resilience. Damage lowers DS; DS 0 = dead.

Switches:
  (none) [filter]     Catalog
  /here|/room         NPCs in this room
  /spawn <slug|ds>    Create NPC here (staff)
  /spawn <slug>=Name  Custom name
  /clear [ref]        Remove room NPC(s) (staff)

Examples:
  +npc/spawn eswat
  +npc/here
  look
  +attack eswat
  +npc/clear eswat`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const argLc = arg.toLowerCase();

    if (sw === "here" || sw === "room" || sw === "list") {
      const roomNpcs = await roomNpcsFresh(u);
      const lines = [header("NPCS HERE")];
      if (!roomNpcs.length) {
        lines.push(
          `  ${dim("none — staff: +npc/spawn <slug>")}`,
        );
      }
      for (const o of roomNpcs) {
        const d = npcData(o)!;
        const mark = d.dead
          ? `%crDOWN%cn`
          : ylw("DS" + d.ds);
        lines.push(
          `  ${val(String(o.name ?? d.name))}  ${mark}` +
            `/${val(d.dsMax)}  ${dim(d.slug)}`,
        );
      }
      lines.push(
        `  ${dim("+attack <name|slug> · look <name>")}`,
      );
      lines.push(footer());
      u.send(lines.join("\r\n"));
      return;
    }

    if (sw === "spawn" || sw === "create" || sw === "summon") {
      if (!isStaff(u)) {
        u.send(
          `${ERR}Staff only. ` +
            `${val("+npc/spawn <slug>")}`,
        );
        return;
      }
      if (!arg) {
        u.send(
          `${ERR}Usage: ${val("+npc/spawn <slug|ds>")}` +
            ` or ${val("+npc/spawn <slug>=Name")}`,
        );
        return;
      }
      let slugOrDs = arg;
      let name: string | undefined;
      const eq = arg.indexOf("=");
      if (eq > 0) {
        slugOrDs = arg.slice(0, eq).trim();
        name = arg.slice(eq + 1).trim();
      }
      const asDs = Number(slugOrDs);
      let obj: IDBObj | null = null;
      if (
        Number.isFinite(asDs) && asDs >= 1 && asDs <= 30 &&
        String(asDs) === slugOrDs
      ) {
        obj = await spawnNpc(u, {
          ds: asDs,
          name: name || `DS${asDs} foe`,
          slug: `ds-${asDs}`,
        });
      } else {
        const row = catalogNpc(slugOrDs);
        if (!row && !name) {
          u.send(
            `${ERR}Unknown antagonist. ` +
              `${val("+npc")} for catalog.`,
          );
          return;
        }
        obj = await spawnNpc(u, {
          slug: row ? String(row.slug) : slugOrDs,
          name: name ||
            (row ? String(row.name) : slugOrDs),
          ds: row && typeof row.ds === "number"
            ? row.ds as number
            : 10,
          loadout: row?.loadout
            ? String(row.loadout)
            : undefined,
        });
      }
      if (!obj) {
        u.send(`${ERR}Could not spawn (no room?).`);
        return;
      }
      const d = npcData(obj)!;
      u.send(
        `${OK}Spawned ${val(d.name)} ` +
          `DS${val(d.ds)} here. ` +
          `${dim("look · +attack " + d.slug)}`,
      );
      return;
    }

    if (sw === "clear" || sw === "despawn") {
      if (!isStaff(u)) {
        u.send(`${ERR}Staff only.`);
        return;
      }
      const roomId = u.here?.id;
      if (!roomId) {
        u.send(`${ERR}No room.`);
        return;
      }
      const found = await u.db.search({ location: roomId });
      const all = (found as IDBObj[]).filter((o) =>
        isSprawlNpc(o)
      );
      if (!arg) {
        let n = 0;
        for (const o of all) {
          await u.db.destroy(o.id);
          n++;
        }
        u.send(
          `${OK}Removed ${val(n)} NPC(s) from room.`,
        );
        return;
      }
      const hit = all.find((o) => {
        const d = npcData(o);
        const q = argLc;
        return o.id === arg.replace(/^#/, "") ||
          d?.slug === q ||
          String(o.name).toLowerCase().includes(q);
      });
      if (!hit) {
        u.send(`${ERR}No matching NPC here.`);
        return;
      }
      await u.db.destroy(hit.id);
      u.send(
        `${OK}Removed ${val(String(hit.name ?? hit.id))}.`,
      );
      return;
    }

    if (sw === "ds" && arg) {
      u.send(
        `${ARR}Custom DS ${val(arg)} — ` +
          `${val("+npc/spawn " + arg)}.`,
      );
      return;
    }

    // Catalog
    const q = sw &&
        !["spawn", "here", "room", "list", "clear", "ds",
          "create", "summon", "despawn"].includes(sw)
      ? sw
      : argLc;
    const lines = [header("ANTAGONISTS")];
    lines.push(
      `  ${dim("Staff: +npc/spawn <slug>  → room object")}`,
    );
    let n = 0;
    for (const a of ANTAGONISTS) {
      if (
        q &&
        !a.slug.includes(q) &&
        !String(a.name).toLowerCase().includes(q)
      ) {
        continue;
      }
      lines.push(
        `  ${val(a.slug)} DS${val(a.ds as number)}` +
          ` ${dim(String(a.name))}`,
      );
      n++;
      if (n >= 40) {
        lines.push(`  ${dim("… filter to narrow")}`);
        break;
      }
    }
    lines.push(
      `  ${dim("+npc/here · +npc/spawn eswat · +attack eswat")}`,
    );
    lines.push(footer());
    u.send(lines.join("\r\n"));
  },
});

async function roomNpcsFresh(u: IUrsamuSDK): Promise<IDBObj[]> {
  return loadRoomNpcs(u);
}
