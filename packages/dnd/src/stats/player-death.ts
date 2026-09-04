/**
 * Player death: corpse with gear + spirit to underworld.
 * Resurrection restores body, gear, and clears death.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";
import { migrateSheet, type DndSheet } from "./dnd_sheet.ts";
import {
  deathOf,
  defaultDeath,
  isDead,
} from "./death.ts";
import { ensureUnderworld } from "../world/underworld.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

export type DeathTravel = {
  corpseId?: string;
  deathRoomId?: string;
  spirit: boolean;
};

function sheetOf(p: IDBObj): DndSheet {
  return migrateSheet((p.state as Any)?.dnd);
}

function deathTravelOf(sheet: DndSheet): DeathTravel {
  const d = (sheet.death ?? {}) as Any;
  return {
    corpseId: d.corpseId ? String(d.corpseId) : undefined,
    deathRoomId: d.deathRoomId
      ? String(d.deathRoomId)
      : undefined,
    spirit: !!d.spirit,
  };
}

function displayName(u: IUrsamuSDK, p: IDBObj): string {
  return (u.util.displayName(p, u.me) || p.name || "Someone")
    .split(";")[0];
}

/**
 * If sheet just became dead and player is not already a spirit,
 * create corpse, move gear, teleport to underworld.
 */
export async function maybeProcessPlayerDeath(
  u: IUrsamuSDK,
  player: IDBObj,
  sheet: DndSheet,
  opts: { quiet?: boolean; underworldId?: string } = {},
): Promise<{
  sheet: DndSheet;
  processed: boolean;
  corpseId?: string;
  lines: string[];
}> {
  const lines: string[] = [];
  if (!isDead(sheet)) {
    return { sheet, processed: false, lines };
  }
  // Only player characters
  if (!player.flags?.has?.("player")) {
    return { sheet, processed: false, lines };
  }
  if (sheet.class === "Monster") {
    return { sheet, processed: false, lines };
  }
  const travel = deathTravelOf(sheet);
  if (travel.spirit && travel.corpseId) {
    return {
      sheet,
      processed: false,
      corpseId: travel.corpseId,
      lines,
    };
  }

  const result = await processPlayerDeath(u, player, sheet, {
    quiet: opts.quiet,
    underworldId: opts.underworldId,
  });
  return {
    sheet: result.sheet,
    processed: true,
    corpseId: result.corpseId,
    lines: result.lines,
  };
}

export async function processPlayerDeath(
  u: IUrsamuSDK,
  player: IDBObj,
  sheetIn?: DndSheet,
  opts: { quiet?: boolean; underworldId?: string } = {},
): Promise<{
  sheet: DndSheet;
  corpseId: string;
  lines: string[];
}> {
  const lines: string[] = [];
  let sheet = sheetIn ?? sheetOf(player);
  const name = displayName(u, player);
  const deathRoomId = String(
    player.location || u.me.location || "",
  );
  if (!deathRoomId) {
    lines.push("Death failed — no location.");
    return { sheet, corpseId: "", lines };
  }

  const uwId = opts.underworldId || await ensureUnderworld();
  const corpseId = await spawnPlayerCorpse(
    u,
    player,
    name,
    deathRoomId,
  );

  const death = {
    ...deathOf(sheet),
    dead: true,
    spirit: true,
    corpseId,
    deathRoomId,
  };
  sheet = { ...sheet, hp: { ...sheet.hp, current: 0 }, death };
  await u.db.modify(player.id, "$set", {
    "data.dnd": sheet,
    location: uwId,
  });
  if (player.state) (player.state as Any).dnd = sheet;
  player.location = uwId;

  try {
    u.teleport(player.id, uwId);
  } catch {
    /* location already set */
  }

  lines.push(
    `%ch%cr${name}%cn's spirit is torn free. ` +
      `A corpse remains behind.`,
  );
  lines.push(
    `You drift to the %chGrey Veil%cn. ` +
      `Allies may %ch+res%cn your body to call you back.`,
  );

  // Always notify the dead player (spirit messages).
  if (player.id === u.me.id) {
    for (const ln of lines) u.send(ln);
  } else {
    try {
      u.send(lines.join("\n"), player.id);
    } catch {
      /* optional notify */
    }
  }
  if (!opts.quiet) {
    const roomMsg =
      `%ch%cr${name}%cn dies! A corpse is left behind.`;
    if (typeof u.broadcast === "function") {
      u.broadcast(roomMsg);
    } else if (player.id !== u.me.id) {
      u.send(roomMsg);
    }
  }

  return { sheet, corpseId, lines };
}

async function spawnPlayerCorpse(
  u: IUrsamuSDK,
  player: IDBObj,
  name: string,
  deathRoomId: string,
): Promise<string> {
  const corpse = await u.db.create({
    flags: new Set(["thing"]),
    location: deathRoomId,
    name:
      `Corpse of ${name};corpse;body of ${name};` +
      `${name} corpse;remains of ${name}`,
    state: {
      name: `Corpse of ${name}`,
      description:
        `The still body of ${name}. Gear clings to cold flesh. ` +
        `A body awaits %chres%cnurrection — or scavenging.`,
      dnd: {
        type: "player_corpse",
        ownerId: player.id,
        ownerName: name,
        noGet: true,
      },
      locks: { basic: "flag(wizard)" },
      FAIL: "That is someone's body.",
      owner: player.id,
    },
  });
  const corpseId = String(corpse.id);
  // deno-lint-ignore no-explicit-any
  const carried = await u.db.search({
    location: player.id,
  } as any);
  for (const item of carried) {
    if (!item.flags?.has?.("thing")) continue;
    if (item.flags?.has?.("player")) continue;
    await u.db.modify(item.id, "$set", {
      location: corpseId,
      "data.dnd.equipped": false,
    });
  }
  return corpseId;
}

/** True if object is a player corpse with owner. */
export function isPlayerCorpse(o: IDBObj): boolean {
  const d = (o.state as Any)?.dnd;
  return d?.type === "player_corpse" && !!d.ownerId;
}
