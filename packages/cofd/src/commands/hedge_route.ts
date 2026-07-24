// +hedge/route and +hedge/luxury Hollow enhancements.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  hollowHas,
  isHollowOwner,
} from "../hedge/index.ts";
import { isChangelingSheet } from "../form/index.ts";
import {
  getSheet,
  persistSheet,
  roomHedge,
} from "./hedge_helpers.ts";

/**
 * +hedge/route — Route Zero (1/day): path +2 + 1 WP.
 */
export async function hedgeRouteZero(
  u: IUrsamuSDK,
  _rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet || !isChangelingSheet(sheet)) {
    u.send("Only the Lost use Route Zero.");
    return;
  }
  const hr = roomHedge(u.here ?? {});
  if (!hr || hr.realm !== "hollow") {
    u.send("Route Zero only works inside your Hollow.");
    return;
  }
  if (!hollowHas(hr, "route-zero")) {
    u.send(
      "This Hollow needs Route Zero " +
        "(+hedge/hollow route-zero).",
    );
    return;
  }
  if (!isHollowOwner(hr, u.me.id)) {
    u.send("Only Hollow owners may use Route Zero.");
    return;
  }
  const flags = sheet.hedgeState?.fruitFlags ?? [];
  const now = Date.now();
  const dayMs = 24 * 3600_000;
  const used = flags.find((f) => f.key === "routeZeroUsed");
  if (used && used.until > now) {
    u.send("Route Zero already used today.");
    return;
  }
  const maxWp = sheet.advantages?.willpowerMax ?? 0;
  const curWp = sheet.advantages?.willpowerCurrent ?? 0;
  const nextFlags = [
    ...flags.filter((f) => f.key !== "routeZeroUsed"),
    { key: "routeZeroUsed", until: now + dayMs },
    { key: "spinPath", until: now + 3600_000 },
  ];
  const next = {
    ...sheet,
    advantages: {
      ...sheet.advantages,
      willpowerCurrent: Math.min(maxWp, curWp + 1),
    },
    hedgeState: {
      ...(sheet.hedgeState ?? {}),
      fruitFlags: nextFlags,
    },
  };
  await persistSheet(u, u.me.id, next);
  u.send(
    "Route Zero loops the trod. Path +2 for an hour, " +
      "Willpower +1 (once per day).",
  );
}

/**
 * +hedge/luxury — Luxury Goods: request a mundane supply.
 */
export async function hedgeLuxury(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet) {
    u.send("No character sheet.");
    return;
  }
  const hr = roomHedge(u.here ?? {});
  if (!hr || hr.realm !== "hollow") {
    u.send("Luxury Goods only work inside a Hollow.");
    return;
  }
  if (!hollowHas(hr, "luxury-goods")) {
    u.send(
      "This Hollow needs Luxury Goods " +
        "(+hedge/hollow luxury-goods).",
    );
    return;
  }
  if (!isHollowOwner(hr, u.me.id)) {
    u.send("Only Hollow owners may pull Luxury Goods.");
    return;
  }
  const want = rest.trim() || "a useful mundane item";
  u.send(
    `Luxury Goods: you pull %cy${want.slice(0, 50)}%cn ` +
      `from the Hollow (Availability ≤ Wits+Wyrd ` +
      `successes — ST). Lasts one scene.`,
  );
}
