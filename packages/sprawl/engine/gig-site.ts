/**
 * Instanced gig site room — one room per run, look/image
 * updates per node, destroyed on leave/complete.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";
import type { IActiveGig, ISprawlChar } from "../db/schemas.ts";
import { getGigRoomArt } from "./gig-art.ts";
import {
  destroyGigHostiles,
  isBossNode,
} from "./gig-run.ts";

export type GigSiteMeta = {
  gigId: string;
  ownerId: string;
  returnRoomId: string;
  at: number;
};

/** Full look text for the instanced site room. */
export function siteDesc(gig: IActiveGig): string {
  const node = gig.node ?? 1;
  const max = gig.nodesMax ?? 1;
  const paras: string[] = [];

  // Header strip
  paras.push(
    `${gig.title} · Node ${node}/${max}` +
      (gig.roomName ? ` — ${gig.roomName}` : ""),
  );

  // Venue context (where the job lives)
  if (gig.venueName || gig.venueBlurb) {
    const head = gig.venueName
      ? `${gig.venueName}. `
      : "";
    const body = gig.venueBlurb ?? "";
    if (head || body) paras.push((head + body).trim());
  }

  // Room prose (primary look)
  const roomProse = gig.roomDesc || gig.roomBlurb;
  if (roomProse) {
    for (const chunk of roomProse.split(/\n\n+/)) {
      const t = chunk.replace(/\s+/g, " ").trim();
      if (t) paras.push(t);
    }
  } else {
    paras.push("A dangerous site. Watch your corners.");
  }

  // Contract hook
  if (gig.blurb) {
    paras.push(`The job: ${gig.blurb}`);
  }
  if (gig.targetName) {
    paras.push(
      `Target mark: ${gig.targetName}` +
        (gig.targetBlurb ? ` — ${gig.targetBlurb}` : "") +
        ".",
    );
  }

  // Complication
  if (gig.complication) {
    paras.push(
      `Complication — ${gig.complication}` +
        (gig.complicationBlurb
          ? `: ${gig.complicationBlurb}`
          : "."),
    );
  }

  // Objective strip
  if (isBossNode(gig) && gig.objective === "hack-node") {
    paras.push(
      `OBJECTIVE: +hack the PRIMARY system` +
        ` (DS${gig.hackDs ?? 12}` +
        (gig.hackTargetName
          ? ` · ${gig.hackTargetName}`
          : "") +
        `).`,
    );
  } else if (isBossNode(gig)) {
    paras.push(
      `OBJECTIVE: put down ${gig.bossName ?? "the principal"}` +
        ` (DS${gig.bossDs ?? "?"})` +
        (gig.targetName ? ` · secure ${gig.targetName}` : "") +
        `.`,
    );
  } else {
    paras.push(
      `Clear this node, then +gig/push when the path opens.`,
    );
  }

  paras.push(
    `Hostiles and systems are live here. ` +
      `+hack <name|DS> · +attack · +gig/leave · +gig/turnin.`,
  );

  return paras.join("\r\n\r\n");
}

function siteName(gig: IActiveGig): string {
  const room = gig.roomName || gig.venueName || "Site";
  return `${gig.title} — ${room}`.slice(0, 60);
}

async function movePlayer(
  u: IUrsamuSDK,
  playerId: string,
  roomId: string,
): Promise<void> {
  if (typeof u.teleport === "function") {
    await u.teleport(playerId, roomId);
    return;
  }
  await u.db.modify(playerId, "$set", {
    location: roomId,
  });
}

/** Apply phase name/desc/image onto an existing site room. */
export async function applyGigSiteLook(
  u: IUrsamuSDK,
  roomId: string,
  gig: IActiveGig,
): Promise<void> {
  const name = siteName(gig);
  const description = siteDesc(gig);
  const slug = (gig.roomSlug ?? "").toLowerCase();
  const art = slug ? await getGigRoomArt(slug) : null;
  const patch: Record<string, unknown> = {
    "data.name": name,
    "data.description": description,
    // Mirror for look paths that read state
    "state.description": description,
    "state.name": name,
  };
  if (art) {
    patch["data.image"] = art;
    patch["data.image_url"] = art;
    patch["state.image"] = art;
  }
  await u.db.modify(roomId, "$set", patch);
}

/**
 * Create (or reuse) instance room, move player in, set look.
 */
export async function enterGigSite(
  u: IUrsamuSDK,
  c: ISprawlChar,
  gig: IActiveGig,
): Promise<{ next: ISprawlChar; roomId: string; created: boolean }> {
  const returnRoomId = gig.returnRoomId ||
    u.here?.id ||
    u.me.location ||
    "";
  let roomId = gig.siteRoomId;
  let created = false;

  if (roomId) {
    const found = await u.db.search({ id: roomId });
    const live = (found as IDBObj[])[0];
    if (!live) roomId = undefined;
  }

  if (!roomId) {
    const meta: GigSiteMeta = {
      gigId: gig.id,
      ownerId: u.me.id,
      returnRoomId: returnRoomId || "0",
      at: Date.now(),
    };
    const desc = siteDesc(gig);
    const nm = siteName(gig);
    const room = await u.db.create({
      name: nm,
      flags: new Set(["room", "gig-site"]),
      location: "",
      state: {
        description: desc,
        name: nm,
        sprawl_gig_site: meta,
      },
      // Some look paths prefer data.*
      data: {
        description: desc,
        name: nm,
      },
      contents: [],
    } as never);
    if (!room?.id) {
      throw new Error("Could not create site room");
    }
    roomId = room.id;
    created = true;

    if (returnRoomId) {
      await u.db.create({
        name: "Out",
        flags: new Set(["exit"]),
        location: roomId,
        state: {
          destination: returnRoomId,
          description:
            "The way back out. +gig/leave if the exit sticks.",
        },
        data: {
          description:
            "The way back out. +gig/leave if the exit sticks.",
        },
        contents: [],
      } as never);
    }
  }

  const nextGig: IActiveGig = {
    ...gig,
    siteRoomId: roomId,
    returnRoomId: returnRoomId || gig.returnRoomId,
  };
  await applyGigSiteLook(u, roomId, nextGig);
  await movePlayer(u, u.me.id, roomId);

  return {
    roomId,
    created,
    next: { ...c, activeGig: nextGig },
  };
}

/** Move player home; destroy empty site room + hostiles. */
export async function leaveGigSite(
  u: IUrsamuSDK,
  c: ISprawlChar,
  opts: { destroy?: boolean } = {},
): Promise<ISprawlChar> {
  const gig = c.activeGig;
  if (!gig) return c;
  const home = gig.returnRoomId || u.me.location;
  if (home && home !== gig.siteRoomId) {
    await movePlayer(u, u.me.id, home);
  }
  if (opts.destroy !== false && gig.siteRoomId) {
    await destroyGigSite(u, gig);
    const nextGig = { ...gig };
    delete nextGig.siteRoomId;
    return { ...c, activeGig: nextGig };
  }
  return c;
}

/** Destroy site room, exits, and spawned hostiles. */
export async function destroyGigSite(
  u: IUrsamuSDK,
  gig: IActiveGig,
): Promise<void> {
  await destroyGigHostiles(u, gig);
  const roomId = gig.siteRoomId;
  if (!roomId) return;
  try {
    const kids = await u.db.search({ location: roomId });
    for (const o of kids as IDBObj[]) {
      if (o.flags?.has?.("player")) continue;
      try {
        await u.db.destroy(o.id);
      } catch {
        /* ok */
      }
    }
    await u.db.destroy(roomId);
  } catch {
    /* ok */
  }
}

export function isInGigSite(
  u: IUrsamuSDK,
  gig: IActiveGig | undefined,
): boolean {
  if (!gig?.siteRoomId) return false;
  return u.me.location === gig.siteRoomId ||
    u.here?.id === gig.siteRoomId;
}
