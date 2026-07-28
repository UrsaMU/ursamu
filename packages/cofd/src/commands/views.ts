// +views -- detail views on places, optional locks.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  viewSlug,
  validateViewName,
  validateViewText,
  validateViewLock,
  getRoomViews,
  type RoomView,
} from "../views/index.ts";
import {
  resolvePlace,
  writeViews,
  requirePlaceEdit,
  splitOnFirst,
  type Place,
} from "./views_lib.ts";
import { showViewList, showOneView } from "./views_display.ts";

export {
  canSeeView,
  visibleViews,
} from "./views_lib.ts";

export async function viewsExec(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const here = u.here as unknown as Place;

  if (!sw) {
    if (!rest) {
      await showViewList(u, here);
      return;
    }
    const slash = rest.indexOf("/");
    if (slash >= 0) {
      const place = await resolvePlace(u, rest.slice(0, slash).trim());
      if (!place) {
        u.send("I can't find that place.");
        return;
      }
      await showOneView(u, place, viewSlug(rest.slice(slash + 1)));
      return;
    }
    await showOneView(u, here, viewSlug(rest));
    return;
  }

  if (sw === "list") {
    const place = rest ? await resolvePlace(u, rest) : here;
    if (!place) {
      u.send("I can't find that place.");
      return;
    }
    await showViewList(u, place);
    return;
  }

  if (sw === "add" || sw === "edit") {
    await execAddEdit(u, here, sw, rest);
    return;
  }
  if (sw === "del" || sw === "delete" || sw === "rem" || sw === "remove") {
    await execDel(u, here, rest);
    return;
  }
  if (sw === "lock") {
    await execLock(u, here, rest);
    return;
  }

  u.send(
    `Unknown +views switch '/${sw}'. ` +
      `Use /add, /edit, /del, /lock, or /list.`,
  );
}

async function execAddEdit(
  u: IUrsamuSDK,
  place: Place,
  sw: string,
  rest: string,
): Promise<void> {
  const split = splitOnFirst(rest, "=");
  if (!split) {
    u.send(`Usage: +views/${sw} <name>=<text>`);
    return;
  }
  if (!(await requirePlaceEdit(u, place))) return;

  const nv = validateViewName(split.left);
  if (!nv.ok) {
    u.send(`%cr${nv.error}%cn`);
    return;
  }
  const tv = validateViewText(split.right);
  if (!tv.ok) {
    u.send(`%cr${tv.error}%cn`);
    return;
  }

  const views = { ...getRoomViews(place) };
  const slug = viewSlug(split.left);
  const now = Date.now();
  const existing = views[slug];
  if (sw === "add" && existing) {
    u.send(
      `A view named '${existing.name}' already exists; ` +
        `use /edit to replace it.`,
    );
    return;
  }
  if (sw === "edit" && !existing) {
    u.send(`No view named '${split.left}'; use /add to create it.`);
    return;
  }
  const view: RoomView = {
    name: split.left,
    text: split.right,
    lock: existing?.lock ?? "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    createdBy: existing?.createdBy ?? u.me.id,
  };
  views[slug] = view;
  await writeViews(u, place, views);
  u.send(`View '${split.left}' ${sw === "add" ? "added" : "updated"}.`);
}

async function execDel(
  u: IUrsamuSDK,
  place: Place,
  rest: string,
): Promise<void> {
  if (!rest) {
    u.send("Usage: +views/del <name>");
    return;
  }
  if (!(await requirePlaceEdit(u, place))) return;
  const views = { ...getRoomViews(place) };
  const slug = viewSlug(rest);
  if (!views[slug]) {
    u.send("No such view.");
    return;
  }
  const removed = views[slug].name;
  delete views[slug];
  await writeViews(u, place, views);
  u.send(`Deleted view '${removed}'.`);
}

async function execLock(
  u: IUrsamuSDK,
  place: Place,
  rest: string,
): Promise<void> {
  const split = splitOnFirst(rest, "=");
  if (!split) {
    u.send("Usage: +views/lock <name>=<lock>|!");
    return;
  }
  if (!(await requirePlaceEdit(u, place))) return;
  const rawLock = split.right === "!" ? "" : split.right;
  const lv = validateViewLock(rawLock);
  if (!lv.ok) {
    u.send(`%cr${lv.error}%cn`);
    return;
  }
  const views = { ...getRoomViews(place) };
  const slug = viewSlug(split.left);
  const view = views[slug];
  if (!view) {
    u.send("No such view.");
    return;
  }
  const lock = rawLock.trim();
  views[slug] = { ...view, lock, updatedAt: Date.now() };
  await writeViews(u, place, views);
  u.send(
    lock
      ? `View '${view.name}' lock set to: ${lock}`
      : `View '${view.name}' lock cleared (open).`,
  );
}
