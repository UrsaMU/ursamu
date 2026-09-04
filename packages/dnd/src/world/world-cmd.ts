/**
 * +dnd/world — multi-town campaign / map status.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/mush";
import {
  getSeedRecord,
  getTownSeed,
  WORLD,
} from "./seed.ts";
import {
  campaignStatus,
  listCampaignTowns,
  seedCampaign,
} from "./campaign.ts";
import {
  formatMapSummary,
  loadMapApi,
  resolveMapTiles,
} from "./map-seed.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

addCmd({
  name: "+dnd/world",
  pattern: /^\+dnd\/world(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+dnd/world — Campaign towns + roads.\n` +
    `+dnd/world/seed — Seed all towns+roads (staff).\n` +
    `+dnd/world/goto [town] — Teleport to square (staff).\n` +
    `+dnd/world/map — Havenbrook map footprint.\n` +
    `+dnd/world/towns — List seeded towns.`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "seed" || sw === "install") {
      if (!isStaff(u)) {
        u.send("Permission denied.");
        return;
      }
      const r = await seedCampaign({ force: true });
      u.send(`%ch%cyWORLD>>%cn ${r.message}`);
      return;
    }

    if (sw === "towns" || sw === "list") {
      u.send("%ch%cyWORLD>>%cn Towns & roads:");
      for (const l of await campaignStatus()) u.send(l);
      return;
    }

    if (sw === "goto" || sw === "start" || sw === "square") {
      if (!isStaff(u)) {
        u.send("Permission denied.");
        return;
      }
      const want = (arg || "havenbrook").toLowerCase();
      const towns = listCampaignTowns();
      const town = towns.find((t) =>
        t.id.includes(want) ||
        t.name.toLowerCase().includes(want) ||
        (want === "haven" && t.id === WORLD.id)
      ) ?? towns[0]!;
      const rec = await getTownSeed(town.id);
      const id = rec?.playerStart ??
        rec?.rooms?.[town.playerStartKey];
      if (!id) {
        u.send(
          `${town.name} not seeded. Staff: +dnd/world/seed`,
        );
        return;
      }
      u.teleport(u.me.id, id);
      u.send(
        `%ch%cyWORLD>>%cn Teleported to ${town.name} ` +
          `(#${id}).`,
      );
      return;
    }

    if (sw === "map" || sw === "coords") {
      const rec = await getSeedRecord();
      const tiles = rec?.map?.tiles?.length
        ? rec.map.tiles
        : resolveMapTiles(WORLD, rec?.rooms ?? {});
      u.send(
        `%ch%cyWORLD>>%cn ` +
          formatMapSummary(WORLD, tiles),
      );
      if (WORLD.map) {
        const o = WORLD.map.origin;
        u.send(
          `  Origin ${WORLD.map.realm ?? "default"}:` +
            `(${o.x},${o.y},${o.z ?? 0}) ` +
            `faction=${WORLD.map.faction ?? WORLD.name}`,
        );
      }
      for (const t of tiles.slice(0, 16)) {
        const room = t.roomId ? ` #${t.roomId}` : "";
        u.send(
          `  ${t.glyph} ${t.key.padEnd(12)} ` +
            `(${t.x},${t.y},${t.z})${room}`,
        );
      }
      if (tiles.length > 16) {
        u.send(`  … +${tiles.length - 16} more tiles`);
      }
      const api = await loadMapApi();
      u.send(
        api
          ? "  Map plugin: present (overlays seedable)."
          : "  Map plugin: not loaded — rooms only.",
      );
      return;
    }

    u.send("%ch%cyWORLD>>%cn Campaign:");
    for (const l of await campaignStatus()) u.send(l);
    u.send(
      "Staff: +dnd/world/seed · /goto [havenbrook|millhaven]",
    );
    u.send("Travel: +road · Bounties: +bounty · Rep: +rep");
  },
});
