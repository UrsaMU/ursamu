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
 * Filter out characters outside the Latin-1 range (charCode > 255)
 * and replace common smart quotes/dashes with ASCII equivalents.
 */
export function toLatin1(str: string): string {
  return str
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .split("")
    .filter((char) => char.charCodeAt(0) <= 255)
    .join("");
}

/**
 * Strip MUSH markup for plain-text targets (Discord, logs).
 * Handles truecolor `<#RRGGBB>`, `%c`/`%x` codes, and ANSI.
 * Discord has no per-character color — drop codes, keep text.
 */
export function stripMushMarkup(str: string): string {
  return str
    // %x<#rrggbb> / %c<#…> / %X<#…> / %C<#…> then bare <#…>
    .replace(/%[xcXC]?<#[0-9a-fA-F]{3,8}>/g, "")
    .replace(/<#[0-9a-fA-F]{3,8}>/g, "")
    // %ch %cn %cr %cR %x0 %c#123 …
    .replace(/%[cx][#]?[a-zA-Z0-9]/gi, "")
    .replace(/%[nrtbR]/g, "")
    // deno-lint-ignore no-control-regex
    .replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Strip MUSH/ANSI codes, enforce Latin-1, clamp to Discord
 * username limit (80).
 */
export function clean(str: string): string {
  const sanitized = stripMushMarkup(str);
  return toLatin1(sanitized).trim().slice(0, 80) || "Unknown";
}

const AVATARS_DIR = "data/avatars";

/** Normalize base URL (no trailing slash). */
export function normalizePublicUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

/**
 * Resolve avatar_url for Discord webhooks.
 * Returns local @avatar URL or undefined (omit avatar_url).
 *
 * Discord quirks (verified on webhooks):
 * - Silently drops avatar_url if the URL has a query string
 * - Third-party hosts (robohash, gravatar, github, …) often
 *   yield author.avatar=null — only our publicUrl host is reliable
 * - Prefer path with real extension: /avatars/{id}.jpg
 * - No query cache-busters (they void the override)
 */
export async function resolveAvatar(
  playerId: string,
  _playerName: string,
  publicUrl: string,
): Promise<string | undefined> {
  const base = normalizePublicUrl(publicUrl);
  if (!base || !playerId) return undefined;
  try {
    for await (const entry of Deno.readDir(AVATARS_DIR)) {
      if (!entry.isFile) continue;
      if (!entry.name.startsWith(playerId + ".")) continue;
      // Use real filename (id.ext). No query string.
      return `${base}/avatars/${entry.name}`;
    }
  } catch { /* no avatars dir yet */ }
  return undefined;
}
