// Cryptographically secure ID generator (CRIT-01 / HIGH-05)
// Uses crypto.getRandomValues() — safe for security-sensitive record IDs.
export function nanoid(len = 12): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  // Use rejection sampling to avoid modulo bias (256 % 36 = 4 ≠ 0)
  const LIMIT = 256 - (256 % chars.length);
  const bytes = new Uint8Array(len * 2); // oversample to handle rejections
  const result: string[] = [];
  let i = 0;
  while (result.length < len) {
    if (i >= bytes.length) {
      crypto.getRandomValues(bytes);
      i = 0;
    }
    const b = bytes[i++];
    if (b >= LIMIT) continue; // reject biased values
    result.push(chars[b % chars.length]);
  }
  return result.join("");
}
