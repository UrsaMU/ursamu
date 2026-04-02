/**
 * Convert a TinyMUX-style glob pattern to a case-insensitive RegExp.
 * `*` matches any sequence, `?` matches a single character.
 */
export function globToRegex(pat: string): RegExp {
  const escaped = pat
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}
