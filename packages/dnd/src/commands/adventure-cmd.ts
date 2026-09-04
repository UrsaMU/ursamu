/**
 * +adv — procedural delves. +chest/+altar alias open/use.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/mush";
import {
  adventureBySlug,
  catalogSummary,
  countLivingMobs,
  ensureAdventure,
  getInstance,
  markClearedIfDone,
  skinBySlug,
  startDelve,
} from "../adventure/site.ts";
import {
  bringHirelings,
  countParty,
  formatPartyLine,
} from "../adventure/party.ts";
import {
  hostileRoomTip,
  listHostiles,
  startRoomFight,
} from "../combat/start-fight.ts";
import { openDndChest } from "./chest-open.ts";
import { useDndProp } from "./prop-use.ts";

function roomIdOf(u: IUrsamuSDK): string | null {
  // Prefer actor location (authoritative after teleport).
  return u.me.location ?? u.here?.id ?? null;
}

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

async function rememberRun(
  u: IUrsamuSDK,
  inst: {
    slug: string;
    entryId: string;
    anchorId?: string;
  },
): Promise<void> {
  const payload = {
    slug: inst.slug,
    entryId: inst.entryId,
    anchorId: inst.anchorId,
  };
  await u.db.modify(u.me.id, "$set", { "data.dndAdv": payload });
  // deno-lint-ignore no-explicit-any
  if (u.me.state) (u.me.state as any).dndAdv = payload;
}

async function enterGenerated(
  u: IUrsamuSDK,
  skinRaw: string,
): Promise<void> {
  const party = await countParty(u);
  const r = await startDelve(skinRaw, {
    partySize: party.size,
  });
  if (!r.ok || !r.instance || !r.def) {
    u.send(`%ch%cyADV>>%cn ${r.message}`);
    return;
  }
  const inst = r.instance;
  const def = r.def;
  u.teleport(u.me.id, inst.entryId);
  // Keep SDK location in sync for same-turn room queries.
  u.me.location = inst.entryId;
  const brought = await bringHirelings(
    u,
    inst.entryId,
    party.hirelings.map((h) => h.id),
  );
  await rememberRun(u, inst);
  const bossRoom = def.rooms.find((x) => x.key === "boss");
  u.send(`%ch%cyADV>>%cn ${r.message}`);
  u.send(
    `%ch%cyADV>>%cn ${formatPartyLine(party)}` +
      (brought ? ` — ${brought} hireling(s) follow.` : "") +
      ` · ${def.rooms.length} chambers` +
      ` · boss in %ch${bossRoom?.name ?? "the depths"}%cn.`,
  );

  // Auto-start combat when the entry room is hostile.
  // Pass entryId — teleport does not refresh u.here.
  const hostiles = await listHostiles(u, inst.entryId);
  if (hostiles.length > 0) {
    u.send(
      `%ch%cr${hostiles.length} foe(s)%cn in the entry — combat begins!`,
    );
    const fight = await startRoomFight(u, {
      roomId: inst.entryId,
    });
    if (!fight.ok && fight.message) {
      u.send(
        `%ch%cyADV>>%cn ${fight.message} Try %ch+combat/start%cn.`,
      );
    }
  } else {
    const tip = await hostileRoomTip(u);
    if (tip) u.send(tip);
    u.send(
      "Explore exits · +combat/start if foes appear · " +
        "open chests · +adv/leave",
    );
  }
}

async function enterFixed(
  u: IUrsamuSDK,
  raw: string,
): Promise<void> {
  const def = adventureBySlug(raw);
  if (!def) {
    if (skinBySlug(raw)) {
      await enterGenerated(u, raw);
      return;
    }
    u.send(`%ch%cyADV>>%cn Unknown "${raw}". +adv`);
    return;
  }
  const r = await ensureAdventure(def.slug, { reset: false });
  if (!r.ok || !r.instance) {
    u.send(`%ch%cyADV>>%cn ${r.message}`);
    return;
  }
  let inst = r.instance;
  if (inst.cleared) {
    const r2 = await ensureAdventure(def.slug, { reset: true });
    if (r2.instance) inst = r2.instance;
    u.send("%ch%cyADV>>%cn Cleared site restocked.");
  }
  u.teleport(u.me.id, inst.entryId);
  u.me.location = inst.entryId;
  await rememberRun(u, inst);
  u.send(
    `%ch%cyADV>>%cn Entered %ch${def.name}%cn. ${def.summary}`,
  );
  const hostiles = await listHostiles(u, inst.entryId);
  if (hostiles.length > 0) {
    u.send(
      `%ch%crFoes present%cn — combat begins!`,
    );
    const fight = await startRoomFight(u, {
      roomId: inst.entryId,
    });
    if (!fight.ok && fight.message) {
      u.send(`%ch%cyADV>>%cn ${fight.message}`);
    }
  } else {
    u.send("Explore · +combat/start · +loot · +adv/leave");
  }
}

addCmd({
  name: "+adventure",
  pattern: /^\+(?:adv|adventure)(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+adv — List skins & sites.\n` +
    `+adv/delve <skin> — New random dungeon/camp run.\n` +
    `+adv/enter <slug> — Fixed site or new skin run.\n` +
    `+adv/leave · +adv/status · +adv/reset (staff)`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (!sw && !arg) {
      u.send("%ch%cyADV>>%cn Dungeons & camps:");
      for (const line of catalogSummary()) u.send(line);
      u.send(
        "New run: %ch+adv/delve goblin-warren%cn · " +
          "Leave: +adv/leave",
      );
      return;
    }

    if (sw === "list" || sw === "skins") {
      for (const line of catalogSummary()) u.send(line);
      return;
    }

    if (
      sw === "delve" || sw === "run" || sw === "generate" ||
      sw === "proc"
    ) {
      if (!arg) {
        u.send("Usage: +adv/delve <skin>");
        return;
      }
      await enterGenerated(u, arg);
      return;
    }

    if (sw === "enter" || sw === "go") {
      if (!arg) {
        u.send("Usage: +adv/enter <slug|skin>");
        return;
      }
      await enterFixed(u, arg);
      return;
    }

    if (!sw && arg) {
      await enterFixed(u, arg);
      return;
    }
    if (sw && !arg && (skinBySlug(sw) || adventureBySlug(sw))) {
      if (skinBySlug(sw)) await enterGenerated(u, sw);
      else await enterFixed(u, sw);
      return;
    }

    if (sw === "leave" || sw === "exit") {
      // deno-lint-ignore no-explicit-any
      const st = (u.me.state as any)?.dndAdv as {
        slug?: string;
        anchorId?: string;
      } | undefined;
      const slug = st?.slug || arg;
      const inst = slug ? await getInstance(slug) : null;
      const dest = st?.anchorId || inst?.anchorId;
      if (!dest) {
        u.send(
          "No exit anchor. Use Out exits or +dnd/world/goto.",
        );
        return;
      }
      if (slug) await markClearedIfDone(slug);
      u.teleport(u.me.id, dest);
      await u.db.modify(u.me.id, "$unset", {
        "data.dndAdv": "",
      });
      u.send("%ch%cyADV>>%cn You leave the site.");
      return;
    }

    if (sw === "status") {
      // deno-lint-ignore no-explicit-any
      const cur = (u.me.state as any)?.dndAdv?.slug as
        | string
        | undefined;
      const raw = arg || cur;
      if (!raw) {
        u.send("Usage: +adv/status <slug> (or while inside)");
        return;
      }
      const inst = await getInstance(raw);
      if (!inst) {
        u.send(`%ch%cyADV>>%cn No active run "${raw}".`);
        return;
      }
      const left = await countLivingMobs(inst);
      u.send(
        `%ch%cyADV>>%cn ${inst.skin ?? inst.slug}: ` +
          `${left} foe(s)` +
          (inst.cleared ? ", cleared" : "") +
          `, ${Object.keys(inst.rooms).length} rooms` +
          `. Entry #${inst.entryId}.`,
      );
      return;
    }

    if (sw === "reset" || sw === "respawn") {
      if (!isStaff(u)) {
        u.send("Permission denied.");
        return;
      }
      if (!arg) {
        u.send("Usage: +adv/reset <slug> or +adv/delve <skin>");
        return;
      }
      if (skinBySlug(arg)) {
        await enterGenerated(u, arg);
        return;
      }
      const r = await ensureAdventure(arg, { reset: true });
      u.send(`%ch%cyADV>>%cn ${r.message}`);
      return;
    }

    u.send(
      "Switches: /delve /enter /leave /status /skins /reset",
    );
  },
});

/** Alias for core `open` — same openDndChest path. */
addCmd({
  name: "+chest",
  pattern: /^\+chest(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+chest [open] <name> — Alias for open <chest>.\n` +
    `Prefer: open <chest name>`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const nameArg = ["open", "loot", "search"].includes(sw)
      ? arg
      : (arg || sw);
    if (!nameArg) {
      u.send("Open which chest? Prefer: open <name>");
      return;
    }
    const roomId = roomIdOf(u);
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }
    const target = await u.util.target(u.me, nameArg);
    if (!target || target.location !== roomId) {
      u.send("That chest is not here.");
      return;
    }
    const r = await openDndChest(u, target);
    if (!r.ok && r.message) u.send(r.message);
  },
});

/** Alias for core `use` — same useDndProp path. */
addCmd({
  name: "+altar",
  pattern: /^\+altar(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+altar [touch] <name> — Alias for use <altar>.\n` +
    `Prefer: use <altar|campfire>`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const nameArg = ["touch", "use", "pray"].includes(sw)
      ? arg
      : (arg || sw);
    if (!nameArg) {
      u.send("Use which altar? Prefer: use <name>");
      return;
    }
    const roomId = roomIdOf(u);
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }
    const target = await u.util.target(u.me, nameArg);
    if (!target || target.location !== roomId) {
      u.send("That is not here.");
      return;
    }
    const r = await useDndProp(u, target);
    if (!r.ok && r.message) u.send(r.message);
  },
});
