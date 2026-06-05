// Shared utilities for the discord plugin

export const COLORS = {
  green:   5763719,
  blue:    3447003,
  orange:  15105570,
  teal:    1752220,
  gray:    9807270,
  red:     15548997,
  blurple: 5793266,
  yellow:  16776960,
} as const;

/**
 * Strip MUSH/ANSI codes and clamp to Discord's 80-char username limit.
 */
export function clean(str: string): string {
  return str
    .replace(/%c[a-zA-Z0-9]/gi, "")
    .replace(/%[nrtbR]/g, "")
    // deno-lint-ignore no-control-regex
    .replace(/\x1b\[[0-9;]*m/g, "")
    .trim()
    .slice(0, 80) || "Unknown";
}

/**
 * Resolve avatar_url: player's saved image if present, else RoboHash fallback.
 */
export async function resolveAvatar(
  playerId: string,
  playerName: string,
  publicUrl: string,
): Promise<string> {
  if (publicUrl) {
    try {
      for await (const entry of Deno.readDir("data/avatars")) {
        if (entry.name.startsWith(playerId + ".")) {
          return `${publicUrl}/avatars/${playerId}`;
        }
      }
    } catch { /* no avatars dir yet */ }
  }
  return `https://robohash.org/${encodeURIComponent(playerName)}?set=set4&size=80x80`;
}
