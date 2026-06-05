import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";
import { dbojs } from "../world/dbobjs.ts";
import { ensureDir } from "@std/fs";
import { join } from "@std/path";

const AVATARS_DIR = "data/avatars";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Returns true if `hostname` is private, loopback, link-local, or otherwise
 * internal (SSRF guard).
 */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost") return true;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd")) return true;
  const parts = h.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  const [a, b] = parts;
  return (
    a === 0   ||
    a === 10  ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 240
  );
}

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
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

async function fetchAndValidate(url: URL, u: IUrsamuSDK): Promise<Uint8Array | null> {
  const hostname = url.hostname.toLowerCase();
  if (isPrivateHost(hostname)) { u.send("URL resolves to a private or internal address."); return null; }
  try {
    const aRecords    = await Deno.resolveDns(hostname, "A").catch(() => [] as string[]);
    const aaaaRecords = await Deno.resolveDns(hostname, "AAAA").catch(() => [] as string[]);
    if ([...aRecords, ...aaaaRecords].some(isPrivateHost)) {
      u.send("URL resolves to a private or internal address.");
      return null;
    }
  } catch {
    // DNS resolution failure is not fatal
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), { redirect: "error", signal: AbortSignal.timeout(10_000) });
  } catch { u.send("Could not fetch that URL."); return null; }
  if (!res.ok) { u.send(`Request failed (${res.status}). Check the URL and try again.`); return null; }

  const mime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_MIME.has(mime)) { u.send("URL must point to a PNG, JPEG, GIF, or WebP image."); return null; }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) { u.send("Image must be 2 MB or smaller."); return null; }
  return bytes;
}

export async function execAvatar(u: IUrsamuSDK): Promise<void> {
  const arg = (u.cmd.args[0] || "").trim();

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
  try { url = new URL(arg); } catch { u.send("Invalid URL."); return; }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    u.send("URL must use http or https."); return;
  }

  const mime = (url.toString().match(/\.(png|jpg|jpeg|gif|webp)(\?|$)/i)?.[1] || "").toLowerCase();
  const bytes = await fetchAndValidate(url, u);
  if (!bytes) return;

  const contentMime = mime || "image/png";
  const ext = MIME_TO_EXT[contentMime] || "png";

  const player = await dbojs.queryOne({ id: u.me.id });
  if (!player) { u.send("Error: could not find your player record."); return; }

  await ensureDir(AVATARS_DIR);
  await removeExistingAvatar(u.me.id);
  await Deno.writeFile(join(AVATARS_DIR, `${u.me.id}.${ext}`), bytes);

  player.data ||= {};
  player.data.avatarExt = ext;
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
