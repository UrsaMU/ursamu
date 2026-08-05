// +views list / single-entry display.

import {
  header,
  footer,
  dbrefWithFlags,
  type IUrsamuSDK,
} from "@ursamu/ursamu";
import { getRoomViews, type RoomView, type RoomViews } from "../views/index.ts";
import { canSeeView, visibleViews, type Place } from "./views_lib.ts";

function primaryPlaceName(place: Place): string {
  const raw = String(
    (place as { state?: { moniker?: string; name?: string } }).state
      ?.moniker ||
      (place as { state?: { name?: string } }).state?.name ||
      place.name ||
      "Here",
  );
  return raw.split(";")[0]?.trim() || raw || "Here";
}

async function placeTitle(
  u: IUrsamuSDK,
  place: Place,
): Promise<string> {
  const base = primaryPlaceName(place);
  const canEdit = await u.canEdit(u.me as never, place as never);
  if (!canEdit) return base;
  const flags = place.flags;
  return `${base}(${dbrefWithFlags(place.id, flags)})`;
}

export async function showViewList(
  u: IUrsamuSDK,
  place: Place,
): Promise<void> {
  const visible = await visibleViews(u, place);
  const title = await placeTitle(u, place);
  const lines: string[] = [];
  lines.push(await header(`Views: ${title}`));

  let anyLocked = false;
  if (visible.length === 0) {
    lines.push("No views are available here.");
  } else {
    for (const v of visible) {
      const locked = !!(v.lock && v.lock.trim());
      if (locked) anyLocked = true;
      const mark = locked ? "+" : " ";
      lines.push(` ${mark}${v.name}`);
    }
  }

  lines.push(await footer());
  if (anyLocked) {
    lines.push("%ch+%cn locked");
  }
  u.send(lines.join("\n"));
}

export async function showOneView(
  u: IUrsamuSDK,
  place: Place,
  slug: string,
): Promise<void> {
  const views = getRoomViews(place);
  const view = views[slug];
  if (!view || !(await canSeeView(u, place, view))) {
    u.send("No such view.");
    return;
  }
  const title = await placeTitle(u, place);
  const locked = !!(view.lock && view.lock.trim());
  const viewLabel = locked ? `+${view.name}` : view.name;
  const lines: string[] = [];
  lines.push(await header(`${title} / ${viewLabel}`));
  lines.push(view.text);
  lines.push(await footer());
  if (locked) {
    lines.push("%ch+%cn locked");
  }
  u.send(lines.join("\n"));
}

export type { RoomView, RoomViews };
