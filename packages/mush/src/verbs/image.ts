/**
 * @image — set/clear local object image (room, thing, player).
 * Fetches URL, stores under data/images/, sets data.image.
 */
import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";
import { dbojs } from "../world/dbobjs.ts";
import {
  clearImageDataFields,
  importImageFromUrl,
  removeObjectImage,
  setImageDataFields,
} from "../media/object-image.ts";

export async function execImage(u: IUrsamuSDK): Promise<void> {
  const rawTarget = (u.cmd.args[0] ?? "").trim();
  const rawVal = (u.cmd.args[1] ?? "").trim();
  const arg = u.util?.stripSubs
    ? u.util.stripSubs(rawVal)
    : rawVal;
  const value = arg.trim();

  if (!rawTarget) {
    u.send("Usage: @image <object>=<url|clear>");
    return;
  }

  const target = await u.util.target(u.me, rawTarget, true);
  if (!target) {
    u.send(`I can't find "${rawTarget}".`);
    return;
  }
  if (!(await u.canEdit(u.me, target))) {
    u.send("Permission denied.");
    return;
  }

  const display = u.util.displayName
    ? u.util.displayName(target, u.me)
    : (target.name || target.id);

  if (!value || value.toLowerCase() === "clear") {
    await removeObjectImage(target.id);
    const row = await dbojs.queryOne({ id: target.id });
    if (row) {
      row.data ||= {};
      clearImageDataFields(
        row.data as Record<string, unknown>,
      );
      await dbojs.modify({ id: row.id }, "$set", row);
    }
    // Softcode IMAGE attr if present
    try {
      await u.attr.clear?.(target.id, "IMAGE");
    } catch {
      /* optional */
    }
    u.send(`Image cleared on ${display}.`);
    return;
  }

  const result = await importImageFromUrl(target.id, value, u);
  if (!result.ok) {
    if (!result.error.includes("private") &&
      !result.error.includes("fetch") &&
      !result.error.includes("URL") &&
      !result.error.includes("Image") &&
      !result.error.includes("Request")) {
      u.send(result.error);
    }
    return;
  }

  const row = await dbojs.queryOne({ id: target.id });
  if (!row) {
    u.send("Error: could not find that object.");
    return;
  }
  row.data ||= {};
  setImageDataFields(
    row.data as Record<string, unknown>,
    result.url,
    result.ext,
  );
  await dbojs.modify({ id: row.id }, "$set", row);

  // Mirror into softcode IMAGE for builders who inspect attrs
  try {
    await u.attr.set?.(target.id, "IMAGE", result.url);
  } catch {
    /* optional */
  }

  u.send(`Image saved on ${display}: ${result.url}`);
}

addCmd({
  name: "@image",
  pattern: /^@image\s+(\S+)\s*=\s*(.*)$/i,
  lock: "connected",
  category: "Building",
  help: `@image <object>=<url|clear>  — Set or clear a local image.

Fetches the URL (PNG/JPEG/GIF/WebP). Upload max 8 MB; images
over 2 MB are downsampled before save. Stored for web look on
rooms, things, and players. Clear with =clear or empty value.

Examples:
  @image here=https://example.com/room.png
  @image me=https://example.com/me.jpg
  @image #12=clear`,
  exec: execImage,
});
