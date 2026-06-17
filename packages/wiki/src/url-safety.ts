/**
 * SSRF guard for wiki webhook and fetch URLs.
 *
 * Blocks loopback, RFC-1918 private ranges, link-local, and non-HTTPS schemes.
 * Used by both @wiki/fetch (DNS-resolved IP check) and @wiki/webhook (URL check).
 */

/** Returns true if an IPv4/IPv6 address is in a private or reserved range. */
export function isPrivateIp(ip: string): boolean {
  // IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) — unwrap and re-check IPv4
  if (/^::ffff:/i.test(ip)) return isPrivateIp(ip.slice(7));

  // IPv6 loopback / ULA / link-local
  if (ip === "::1") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
  if (ip.startsWith("fe80")) return true;

  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false; // not IPv4

  const [a, b] = parts;
  return (
    a === 10 ||                            // 10.0.0.0/8
    a === 127 ||                           // 127.0.0.0/8  loopback
    a === 0 ||                             // 0.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) ||   // 172.16.0.0/12
    (a === 192 && b === 168) ||            // 192.168.0.0/16
    (a === 169 && b === 254) ||            // 169.254.0.0/16 link-local
    (a === 100 && b >= 64 && b <= 127) ||  // 100.64.0.0/10 shared
    a >= 240                               // 240.0.0.0/4   reserved
  );
}

/**
 * Returns a copy of `originalUrl` with its hostname replaced by `resolvedIp`.
 *
 * Pinning the connection to the pre-validated IP prevents DNS rebinding:
 * Deno's fetch() would otherwise perform a fresh DNS lookup that an attacker
 * could redirect to a private address after our validation window.
 *
 * IPv6 addresses are automatically wrapped in brackets per RFC 3986.
 */
export function buildPinnedFetchUrl(originalUrl: string, resolvedIp: string): string {
  const parsed = new URL(originalUrl);
  if (resolvedIp.includes(":")) {
    // IPv6: the URL `host` property includes port, so preserve it manually.
    // `hostname` setter does not accept bare IPv6 in Deno — use `host` with brackets.
    const portPart = parsed.port ? `:${parsed.port}` : "";
    parsed.host = `[${resolvedIp}]${portPart}`;
  } else {
    parsed.hostname = resolvedIp;
  }
  return parsed.toString();
}

/**
 * Returns true if a webhook URL is safe to use (HTTPS only, non-private host).
 * Does NOT perform DNS resolution — use isPrivateIp() after resolving for fetch.
 */
export function isWebhookUrlSafe(url: string): boolean {
  if (!url.startsWith("https://")) return false;
  try {
    const parsed = new URL(url);
    // Strip IPv6 brackets: new URL("https://[::1]/").hostname === "::1" in some runtimes,
    // but normalize defensively in case it returns "[::1]"
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost") return false;
    return !isPrivateIp(host);
  } catch { return false; }
}
