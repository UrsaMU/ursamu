/** Escape a string for safe use inside a RegExp constructor. */
export const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
