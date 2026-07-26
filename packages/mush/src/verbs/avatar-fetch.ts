/**
 * SSRF-safe image fetch for @avatar.
 * HTTPS keeps the hostname (TLS cert/SNI). HTTP pins the
 * resolved public IP against DNS rebinding.
 */

import type { IUrsamuSDK } from "../commands/types.ts";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const FETCH_HEADERS = {
  "User-Agent": "UrsaMU-Avatar/1.0",
  "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
} as const;

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * Returns true if `hostname` is private, loopback, link-local, or
 * otherwise internal (SSRF guard).
 */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost") return true;
  if (/^::ffff:/i.test(h)) return isPrivateHost(h.slice(7));
  if (
    h === "::1" || h.startsWith("fc") || h.startsWith("fd") ||
    h.startsWith("fe80")
  ) {
    return true;
  }
  const parts = h.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 240
  );
}

/**
 * Returns a copy of `originalUrl` with hostname replaced by
 * `resolvedIp`. Used for plain-HTTP IP pinning only.
 */
export function buildPinnedFetchUrl(
  originalUrl: string,
  resolvedIp: string,
): string {
  const parsed = new URL(originalUrl);
  if (resolvedIp.includes(":")) {
    const portPart = parsed.port ? `:${parsed.port}` : "";
    parsed.host = `[${resolvedIp}]${portPart}`;
  } else {
    parsed.hostname = resolvedIp;
  }
  return parsed.toString();
}

/** Resolve A/AAAA; reject if any record is private. */
export async function resolvePublicIps(
  hostname: string,
  u: IUrsamuSDK,
): Promise<string[] | null> {
  if (isPrivateHost(hostname)) {
    u.send("URL resolves to a private or internal address.");
    return null;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(":")) {
    return [hostname];
  }

  let aRecords: string[] = [];
  let aaaaRecords: string[] = [];
  try {
    aRecords = await Deno.resolveDns(hostname, "A").catch(() => []);
    aaaaRecords = await Deno.resolveDns(hostname, "AAAA").catch(() => []);
  } catch {
    // DNS API failure — fetch may still succeed by hostname.
  }
  const all = [...aRecords, ...aaaaRecords];
  if (all.some(isPrivateHost)) {
    u.send("URL resolves to a private or internal address.");
    return null;
  }
  return all;
}

/**
 * HTTPS keeps the real hostname so TLS works. Plain HTTP pins the
 * first public IP and sets Host for virtual hosts.
 */
export function chooseFetchTarget(
  url: URL,
  resolvedIps: string[],
): { fetchUrl: string; hostHeader?: string } {
  const ip = resolvedIps[0];
  if (url.protocol === "http:" && ip) {
    return {
      fetchUrl: buildPinnedFetchUrl(url.toString(), ip),
      hostHeader: url.hostname,
    };
  }
  return { fetchUrl: url.toString() };
}

export async function fetchAndValidate(
  url: URL,
  u: IUrsamuSDK,
): Promise<{ bytes: Uint8Array; ext: string } | null> {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const ips = await resolvePublicIps(hostname, u);
  if (ips === null) return null;

  const { fetchUrl, hostHeader } = chooseFetchTarget(url, ips);
  const headers: Record<string, string> = { ...FETCH_HEADERS };
  if (hostHeader) headers["Host"] = hostHeader;

  let res: Response;
  try {
    res = await fetch(fetchUrl, {
      redirect: "error",
      headers,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    u.send("Could not fetch that URL.");
    return null;
  }
  if (!res.ok) {
    u.send(
      `Request failed (${res.status}). Check the URL and try again.`,
    );
    return null;
  }

  const mime = (res.headers.get("content-type") || "")
    .split(";")[0].trim().toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    u.send("URL must point to a PNG, JPEG, GIF, or WebP image.");
    return null;
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) {
    u.send("Image must be 2 MB or smaller.");
    return null;
  }
  return { bytes, ext: MIME_TO_EXT[mime] || "png" };
}
