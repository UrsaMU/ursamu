/**
 * URL safety helpers — used to validate webhook URLs before storing or fetching.
 *
 * Blocks SSRF vectors: loopback, RFC-1918 private ranges, link-local, and non-HTTPS.
 */

/**
 * Returns true only if `url` is a safe, externally-routable HTTPS URL.
 *
 * Rejects:
 *  - Non-https schemes (http://, file://, javascript:, data:, etc.)
 *  - Loopback: localhost, 127.0.0.1, ::1
 *  - RFC-1918 private ranges: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
 *  - Link-local: 169.254.x.x
 *  - Malformed URLs
 */
export function isWebhookUrlSafe(url: string): boolean {
  if (!url.startsWith("https://")) return false;
  try {
    const parsed = new URL(url);
    const host   = parsed.hostname.toLowerCase();

    // Loopback
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    // Link-local
    if (host.startsWith("169.254.")) return false;
    // RFC-1918 private ranges
    if (host.startsWith("10.")) return false;
    if (host.startsWith("192.168.")) return false;
    // 172.16.0.0/12 → 172.16.x.x – 172.31.x.x
    const parts = host.split(".");
    if (
      parts.length === 4 &&
      parts[0] === "172" &&
      parseInt(parts[1], 10) >= 16 &&
      parseInt(parts[1], 10) <= 31
    ) return false;

    return true;
  } catch {
    return false; // malformed URL
  }
}
