import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";
import { ensureDir } from "@std/fs";
import { join } from "@std/path";

const AVATARS_DIR = "data/avatars";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const MIME_TO_EXT: Record<string, string> = {
  "image/png":  "png",
  "image/jpeg": "jpg",
  "image/gif":  "gif",
  "image/webp": "webp",
};

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

export default () =>
  addCmd({
    name: "avatar",
    pattern: /^[@+]?avatar(?:\s+(.*))?$/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      const arg = (u.cmd.args[0] || "").trim();

      // @avatar clear (or bare @avatar)
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

      // Validate URL scheme
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

      // Fetch
      let res: Response;
      try {
        res = await fetch(url.toString());
      } catch {
        u.send("Could not fetch that URL.");
        return;
      }
      if (!res.ok) {
        u.send(`Request failed (${res.status}). Check the URL and try again.`);
        return;
      }

      // Validate content type
      const mime = (res.headers.get("content-type") || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      if (!ALLOWED_MIME.has(mime)) {
        u.send("URL must point to a PNG, JPEG, GIF, or WebP image.");
        return;
      }

      // Read body and enforce size limit
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > MAX_BYTES) {
        u.send("Image must be 2 MB or smaller.");
        return;
      }

      const ext = MIME_TO_EXT[mime];

      // Verify player record exists before writing file to avoid orphaned files
      const player = await dbojs.queryOne({ id: u.me.id });
      if (!player) {
        u.send("Error: could not find your player record.");
        return;
      }

      // Remove old avatar, save new one
      await ensureDir(AVATARS_DIR);
      await removeExistingAvatar(u.me.id);
      await Deno.writeFile(join(AVATARS_DIR, `${u.me.id}.${ext}`), bytes);

      // Store ext on player record for fast lookup
      player.data ||= {};
      player.data.avatarExt = ext;
      await dbojs.modify({ id: player.id }, "$set", player);

      u.send("Avatar saved.");
    },
  });
