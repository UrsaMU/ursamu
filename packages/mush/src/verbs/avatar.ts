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

export {
  isPrivateHost,
  buildPinnedFetchUrl,
  chooseFetchTarget,
  fetchAndValidate,
} from "./avatar-fetch.ts";

const AVATARS_DIR = "data/avatars";

async function removeExistingAvatar(id: string): Promise<void> {
  try {
    for await (const entry of Deno.readDir(AVATARS_DIR)) {
      if (entry.name.startsWith(id + ".")) {
        await Deno.remove(join(AVATARS_DIR, entry.name));
      }
    }
  } catch {
    // directory doesn't exist yet — nothing to remove
  }
}

export async function execAvatar(u: IUrsamuSDK): Promise<void> {
  const raw = u.cmd.args[0] || "";
  const arg = (u.util?.stripSubs ? u.util.stripSubs(raw) : raw)
    .trim();

  if (!arg || arg.toLowerCase() === "clear") {
    await removeExistingAvatar(u.me.id);
    const player = await dbojs.queryOne({ id: u.me.id });
    if (player) {
      player.data ||= {};
      delete player.data.avatarExt;
      await dbojs.modify({ id: player.id }, "$set", player);
    }
    u.send("Avatar cleared.");
    return;
  }

  let url: URL;
  try {
    url = new URL(arg);
  } catch {
    u.send("Invalid URL.");
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    u.send("URL must use http or https.");
    return;
  }

  const result = await fetchAndValidate(url, u);
  if (!result) return;

  const player = await dbojs.queryOne({ id: u.me.id });
  if (!player) {
    u.send("Error: could not find your player record.");
    return;
  }

  await ensureDir(AVATARS_DIR);
  await removeExistingAvatar(u.me.id);
  await Deno.writeFile(
    join(AVATARS_DIR, `${u.me.id}.${result.ext}`),
    result.bytes,
  );

  player.data ||= {};
  player.data.avatarExt = result.ext;
  await dbojs.modify({ id: player.id }, "$set", player);
  u.send("Avatar saved.");
}

addCmd({
  name: "@avatar",
  pattern: /^[@+]?avatar(?:\s+(.*))?$/i,
  lock: "connected",
  category: "General",
  help: `@avatar [<url>|clear]  — Set or clear your player avatar image.

Accepted formats: PNG, JPEG, GIF, WebP. Maximum size: 2 MB.
Omit the URL or use "clear" to remove your avatar.

Examples:
  @avatar https://example.com/pic.png
  @avatar clear`,
  exec: execAvatar,
});
