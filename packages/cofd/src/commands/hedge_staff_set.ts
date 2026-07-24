// Staff +hedge/set, /setway, and /season.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  defaultHedgeRoom,
  findHedgewayById,
  findHedgewayByName,
  isHedgeDanger,
  isHedgeRealm,
  setSeason,
  updateHedgeway,
  type HedgeRoom,
} from "../hedge/index.ts";
import {
  isBuilder,
  isStaff,
  persistRoomHedge,
  roomHedge,
} from "./hedge_helpers.ts";

export async function hedgeSet(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isBuilder(u.me)) {
    u.send("Permission denied.");
    return;
  }
  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send(
      "Usage: +hedge/set <trait>=<value>  " +
        "(realm|danger|trod|flavor|maskflavor|" +
        "hollowrating|hollowowner)",
    );
    return;
  }
  const trait = rest.slice(0, eq).trim().toLowerCase();
  const val = rest.slice(eq + 1).trim();
  const roomId = u.here?.id;
  if (!roomId) {
    u.send("No current room.");
    return;
  }
  let cur: HedgeRoom = roomHedge(u.here) ??
    defaultHedgeRoom("mortal");

  if (trait === "realm") {
    if (!isHedgeRealm(val)) {
      u.send("realm must be mortal|hedge|hollow");
      return;
    }
    cur = { ...cur, realm: val };
    if (val === "hollow" && !cur.hollow) {
      cur = {
        ...cur,
        hollow: { owners: [], rating: 1, enhancements: [] },
      };
    }
  } else if (trait === "danger") {
    if (!isHedgeDanger(val)) {
      u.send("danger must be trod|hedge|thorns");
      return;
    }
    cur = { ...cur, danger: val };
  } else if (trait === "trod" || trait === "trodrating") {
    const n = parseInt(val, 10);
    if (!Number.isFinite(n) || n < 1 || n > 5) {
      u.send("trod rating must be 1–5");
      return;
    }
    cur = { ...cur, danger: "trod", trodRating: n };
  } else if (trait === "flavor") {
    cur = {
      ...cur,
      flavor: u.util.stripSubs(val).slice(0, 200),
    };
  } else if (
    trait === "maskflavor" || trait === "mask-flavor"
  ) {
    cur = {
      ...cur,
      maskFlavor: u.util.stripSubs(val).slice(0, 200),
    };
  } else if (trait === "hollowrating") {
    const n = parseInt(val, 10);
    if (!Number.isFinite(n) || n < 0 || n > 5) {
      u.send("hollowrating must be 0–5");
      return;
    }
    cur = {
      ...cur,
      realm: "hollow",
      hollow: {
        owners: cur.hollow?.owners ?? [],
        rating: n,
        enhancements: cur.hollow?.enhancements ?? [],
        escapeRoomId: cur.hollow?.escapeRoomId,
      },
    };
  } else if (
    trait === "hollowowner" || trait === "owner"
  ) {
    // +hedge/set hollowowner=<player id or name>
    const t = await u.util.target(u.me, val, true);
    if (!t) {
      u.send(`No player matches '${val}'.`);
      return;
    }
    const owners = [...(cur.hollow?.owners ?? [])];
    if (!owners.includes(t.id)) owners.push(t.id);
    cur = {
      ...cur,
      realm: "hollow",
      hollow: {
        owners,
        rating: cur.hollow?.rating ?? 1,
        enhancements: cur.hollow?.enhancements ?? [],
        escapeRoomId: cur.hollow?.escapeRoomId,
      },
    };
  } else {
    u.send(
      "Unknown trait. Use realm|danger|trod|flavor|" +
        "maskflavor|hollowrating|hollowowner",
    );
    return;
  }
  await persistRoomHedge(u, roomId, cur);
  u.send(`Hedge room updated: ${trait}=${val}`);
}

/**
 * +hedge/setway <name|id>/maskName=<label>
 * Also: name=  key=  (true name / key phrase).
 */
export async function hedgeSetWay(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isBuilder(u.me)) {
    u.send("Permission denied.");
    return;
  }
  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send(
      "Usage: +hedge/setway <gate>/maskName=<label>",
    );
    return;
  }
  const left = rest.slice(0, eq).trim();
  const val = u.util.stripSubs(rest.slice(eq + 1)).trim();
  const slash = left.lastIndexOf("/");
  if (slash < 0) {
    u.send(
      "Usage: +hedge/setway <gate>/maskName=<label>",
    );
    return;
  }
  const key = left.slice(0, slash).trim();
  const field = left.slice(slash + 1).trim().toLowerCase();
  let way = await findHedgewayById(key);
  if (!way) way = await findHedgewayByName(key);
  if (!way) {
    u.send(`No hedgeway '${key}'.`);
    return;
  }
  if (field === "maskname" || field === "mask") {
    way = await updateHedgeway(way, { maskName: val });
    u.send(
      `Gate %cy${way.name}%cn maskName=` +
        `${way.maskName ?? "Strange passage"}.`,
    );
    return;
  }
  if (field === "name") {
    way = await updateHedgeway(way, { name: val });
    u.send(`Gate true name set to %cy${way.name}%cn.`);
    return;
  }
  if (field === "key" || field === "keyphrase") {
    way = await updateHedgeway(way, { keyPhrase: val });
    u.send(`Gate key phrase updated.`);
    return;
  }
  u.send("Fields: maskName, name, key");
}

export async function hedgeSeason(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Permission denied.");
    return;
  }
  const label = u.util.stripSubs(rest).trim();
  if (!label) {
    u.send("Usage: +hedge/season <label>");
    return;
  }
  const cfg = await setSeason(label, u.me.id);
  u.send(
    `Hedge season set to %cy${cfg.season}%cn. ` +
      "Dormant free-open requires matching stamp.",
  );
}
