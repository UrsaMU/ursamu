// +hedge — CtL 2e Hedge travel, gates, Hollows (v1).

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  getSeason,
  isInHedge,
  refreshHedgeway,
  roomRealmLabel,
  trailActive,
  waysForRoom,
  wayStateLabel,
} from "../hedge/index.ts";
import {
  getSheet,
  isBuilder,
  roomHedge,
  wayLine,
} from "./hedge_helpers.ts";
import {
  resolveRoomFlavor,
  resolveWayName,
} from "../support/perception.ts";
import {
  hedgeCreate,
  hedgeDestroy,
  hedgeLink,
  hedgeWaysList,
} from "./hedge_staff.ts";
import {
  hedgeSeason,
  hedgeSet,
  hedgeSetWay,
} from "./hedge_staff_set.ts";
import { hedgeEnter, hedgeOpen } from "./hedge_travel.ts";
import { hedgeFind } from "./hedge_find.ts";
import { hedgeClaim, hedgeExit } from "./hedge_exit.ts";
import { hedgeTravel } from "./hedge_nav.ts";
import {
  hedgeEat,
  hedgeForage,
  hedgeFruitList,
  hedgeGarden,
} from "./hedge_fruit.ts";
import { hedgeHollow } from "./hedge_hollow.ts";
import {
  hedgeAccess,
  hedgeEscape,
} from "./hedge_hollow_travel.ts";
import {
  hedgeLuxury,
  hedgeRouteZero,
} from "./hedge_route.ts";
import {
  countFruitObjects,
  freeHollowDots,
  readNavState,
} from "../hedge/index.ts";

export async function hedgeExec(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  switch (sw) {
    case "":
    case "status":
      return await hedgeStatus(u);
    case "list":
      return await hedgeList(u, rest);
    case "open":
      return await hedgeOpen(u, rest);
    case "enter":
      return await hedgeEnter(u, rest);
    case "exit":
      return await hedgeExit(u, rest);
    case "claim":
      return await hedgeClaim(u, rest);
    case "hollow":
      return await hedgeHollow(u, rest);
    case "escape":
      return await hedgeEscape(u, rest);
    case "access":
      return await hedgeAccess(u, rest);
    case "route":
    case "route-zero":
    case "routezero":
      return await hedgeRouteZero(u, rest);
    case "luxury":
    case "luxury-goods":
      return await hedgeLuxury(u, rest);
    case "travel":
      return await hedgeTravel(u, rest);
    case "forage":
      return await hedgeForage(u, rest);
    case "fruit":
      return await hedgeFruitList(u, rest);
    case "eat":
      return await hedgeEat(u, rest);
    case "garden":
      return await hedgeGarden(u, rest);
    case "find":
      return await hedgeFind(u, rest);
    case "create":
      return await hedgeCreate(u, rest);
    case "link":
      return await hedgeLink(u, rest);
    case "set":
      return await hedgeSet(u, rest);
    case "setway":
      return await hedgeSetWay(u, rest);
    case "season":
      return await hedgeSeason(u, rest);
    case "destroy":
      return await hedgeDestroy(u, rest);
    case "ways":
      return await hedgeWaysList(u);
    default:
      u.send(`Unknown +hedge switch: /${sw}`);
  }
}

async function hedgeStatus(u: IUrsamuSDK): Promise<void> {
  const hr = roomHedge(u.here ?? { state: {} });
  const season = await getSeason();
  const roomId = u.here?.id ?? "";
  const ways = roomId ? await waysForRoom(roomId) : [];
  const lines: string[] = [await divider("H E D G E")];
  lines.push(`  Realm:   %cy${roomRealmLabel(hr)}%cn`);
  const flavor = resolveRoomFlavor(u.me, hr);
  if (flavor) lines.push(`  Flavor:  ${flavor}`);
  if (hr?.hollow) {
    const free = freeHollowDots(hr);
    lines.push(
      `  Hollow:  rating ${hr.hollow.rating}  ` +
        `owners ${hr.hollow.owners.length}  ` +
        `free ${free}`,
    );
    if (hr.hollow.enhancements.length > 0) {
      lines.push(
        `  Enhance: ${hr.hollow.enhancements.join(", ")}`,
      );
    }
  }
  lines.push(`  Season:  ${season}`);
  const sheet = getSheet(u.me);
  if (sheet) {
    const trail = trailActive(sheet);
    lines.push(
      `  Trail:   ${trail ? "%chactive%cn" : "none"}`,
    );
    lines.push(
      `  Glamour: ${sheet.energyCurrent ?? 0}`,
    );
    const nFruit = await countFruitObjects(u, u.me.id);
    if (nFruit > 0) {
      lines.push(`  Fruit:   ${nFruit} item(s)`);
    }
    const nav = readNavState(sheet);
    if (nav) {
      lines.push(
        `  Path:    "${nav.goal}" you ` +
          `${nav.progress}/${nav.target}  Hedge ` +
          `${nav.hedgeProgress}/${nav.target} ` +
          `(t${nav.turns})`,
      );
    }
  }
  lines.push("  Gates here:");
  if (ways.length === 0) {
    lines.push("    (none linked)");
  } else {
    for (const raw of ways) {
      const w = await refreshHedgeway(raw);
      const label = resolveWayName(u.me, w);
      lines.push(
        `    ${label}  [${wayStateLabel(w.state)}]  ` +
          `${w.mortalRoomId} ↔ ${w.hedgeRoomId}`,
      );
    }
  }
  if (isInHedge(hr)) {
    lines.push(
      "  Hint: +hedge/forage | /travel | /exit | " +
        "/hollow | /escape",
    );
  } else {
    lines.push(
      "  Hint: +hedge/open [name][=key]  or /access",
    );
  }
  u.send(lines.join("\n"));
}

async function hedgeList(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (rest.toLowerCase() === "all" && isBuilder(u.me)) {
    return await hedgeWaysList(u);
  }
  const roomId = u.here?.id ?? "";
  const ways = roomId ? await waysForRoom(roomId) : [];
  const lines: string[] = [
    await divider("H E D G E W A Y S  H E R E"),
  ];
  if (ways.length === 0) {
    lines.push("  No gates linked to this room.");
  } else {
    for (const raw of ways) {
      const w = await refreshHedgeway(raw);
      lines.push(wayLine(w, u.me));
    }
  }
  u.send(lines.join("\n"));
}
