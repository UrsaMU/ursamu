import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";
import { dbojs } from "../world/dbobjs.ts";
import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import {
  fetchAndValidate,
  isPrivateHost,
  buildPinnedFetchUrl,
  chooseFetchTarget,
} from "./avatar-fetch.ts";
import {
  clearImageDataFields,
  importImageFromUrl,
  removeObjectImage,
  setImageDataFields,
  IMAGES_DIR,
} from "../media/object-image.ts";

export {
  isPrivateHost,
  buildPinnedFetchUrl,
  chooseFetchTarget,
  fetchAndValidate,
} from "./avatar-fetch.ts";

/** Legacy path — still written so old /avatars/ links work. */
const AVATARS_DIR = "data/avatars";

async function removeLegacyAvatar(id: string): Promise<void> {
  try {
    for await (const entry of Deno.readDir(AVATARS_DIR)) {
      if (entry.name.startsWith(id + ".")) {
        await Deno.remove(join(AVATARS_DIR, entry.name));
      }
    }
  } catch {
    /* none */
  }
}

export async function execAvatar(u: IUrsamuSDK): Promise<void> {
  const raw = u.cmd.args[0] || "";
  const arg = (u.util?.stripSubs ? u.util.stripSubs(raw) : raw)
    .trim();

  if (!arg || arg.toLowerCase() === "clear") {
    await removeObjectImage(u.me.id);
    await removeLegacyAvatar(u.me.id);
    const player = await dbojs.queryOne({ id: u.me.id });
    if (player) {
      player.data ||= {};
      clearImageDataFields(
        player.data as Record<string, unknown>,
      );
      await dbojs.modify({ id: player.id }, "$set", player);
    }
    u.send("Avatar cleared.");
    return;
  }

  const result = await importImageFromUrl(u.me.id, arg, u);
  if (!result.ok) {
    // importImageFromUrl already messaged via fetchAndValidate
    if (
      result.error === "Invalid URL." ||
      result.error.startsWith("URL must")
    ) {
      u.send(result.error);
    }
    return;
  }

  const player = await dbojs.queryOne({ id: u.me.id });
  if (!player) {
    u.send("Error: could not find your player record.");
    return;
  }

  // Dual-write legacy /avatars/ (nav + Discord often use this path)
  const ext = result.ext === "jpeg" ? "jpg" : result.ext;
  const avPath = `/avatars/${u.me.id}.${ext}`;
  try {
    await ensureDir(AVATARS_DIR);
    await removeLegacyAvatar(u.me.id);
    const bytes = await Deno.readFile(
      join(IMAGES_DIR, `${u.me.id}.${result.ext}`),
    );
    await Deno.writeFile(
      join(AVATARS_DIR, `${u.me.id}.${ext}`),
      bytes,
    );
  } catch {
    /* images path still set below */
  }

  player.data ||= {};
  // Public URL prefers /avatars/ so site nav keeps working
  const rev = Date.now().toString(36);
  const publicUrl = `${avPath}?v=${rev}`;
  setImageDataFields(
    player.data as Record<string, unknown>,
    publicUrl,
    ext,
  );
  player.data.image = publicUrl;
  player.data.avatarExt = ext;
  await dbojs.modify({ id: player.id }, "$set", {
    "data.image": publicUrl,
    "data.imageExt": ext,
    "data.avatarExt": ext,
    "data.imageRev": rev,
  });
  u.send("Avatar saved.");
}

addCmd({
  name: "@avatar",
  pattern: /^[@+]?avatar(?:\s+(.*))?$/i,
  lock: "connected",
  category: "General",
  help: `@avatar [<url>|clear]  — Set or clear your player avatar image.

Accepted formats: PNG, JPEG, GIF, WebP. Upload max 8 MB;
images over 2 MB are downsampled before save.
Stored locally under /images/ (and legacy /avatars/).
Omit the URL or use "clear" to remove your avatar.

Examples:
  @avatar https://example.com/pic.png
  @avatar clear`,
  exec: execAvatar,
});
