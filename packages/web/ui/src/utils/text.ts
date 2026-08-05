/**
 * Strip MUSH color / substitution codes and ANSI for plain web UI.
 * Converts layout codes (%r → newline, %t → tab, %b → space)
 * so sheet snapshots stay readable after color codes are removed.
 */
export function stripMushCodes(s: unknown): string {
  return String(s ?? "")
    // Layout first (before bare %c / %[nrt…] sweeps)
    .replace(/%r/gi, "\n")
    .replace(/%t/gi, "\t")
    .replace(/%b/gi, " ")
    // %ch %cy %cn %cx … and truecolor
    .replace(/%c[a-zA-Z]/gi, "")
    .replace(/<#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})>/g, "")
    // leftover %n / %N name markers (not used as newline)
    .replace(/%[nN]/g, "")
    // raw ANSI SGR
    // deno-lint-ignore no-control-regex
    .replace(/\u001b\[[0-9;]*m/g, "")
    // collapse accidental double blank lines from code runs
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function normalizeFlags(flags: unknown): string[] {
  if (!flags) return [];
  if (Array.isArray(flags)) {
    return flags.map((f) => String(f).toLowerCase().trim()).filter(Boolean);
  }
  if (typeof flags === "string") {
    return flags
      .split(/[\s,|]+/)
      .map((f) => f.toLowerCase().trim())
      .filter(Boolean);
  }
  return [];
}

export const STAFF = new Set(["admin", "wizard", "superuser"]);

export function isStaffFlags(flags: string[]): boolean {
  return flags.some((f) => STAFF.has(f));
}

export function flagsToString(flags: unknown): string {
  if (flags instanceof Set) return [...flags].map(String).join(" ");
  if (Array.isArray(flags)) return flags.map(String).join(" ");
  return String(flags ?? "");
}

export function dboType(o: {
  flags?: string | string[];
}): "player" | "room" | "exit" | "thing" {
  const f = flagsToString(o.flags).toLowerCase();
  if (/\bplayer\b/.test(f)) return "player";
  if (/\broom\b/.test(f)) return "room";
  if (/\bexit\b/.test(f)) return "exit";
  return "thing";
}

export function dboName(o: {
  id?: string;
  data?: Record<string, unknown>;
}): string {
  const d = o.data || {};
  const raw = String(d.name || d.moniker || o.id || "—");
  return stripMushCodes(raw) || String(o.id || "—");
}

/**
 * Resolve a location id to a readable label using a lookup
 * (e.g. live store). Returns "Name (#id)" when known.
 */
export function locationLabel(
  location: unknown,
  lookup?: (id: string) =>
    | { id?: string; data?: Record<string, unknown> }
    | undefined
    | null,
): string {
  if (location == null || location === "") return "—";
  const id = String(location).replace(/^#/, "").trim();
  if (!id) return "—";
  const obj = lookup?.(id);
  if (obj) {
    const name = dboName(obj);
    if (name && name !== id && name !== `#${id}`) {
      return `${name} (#${id})`;
    }
  }
  return `#${id}`;
}

export function onlineDisplayName(p: {
  id?: string;
  name?: string;
  moniker?: string | null;
}): string {
  const mono = stripMushCodes(p.moniker || "");
  if (mono) return mono;
  return String(p.name || `#${p.id}` || "Unknown");
}

export function normalizeObjectList(data: unknown): import("@/api/types").DboStub[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.objects)) return o.objects as import("@/api/types").DboStub[];
    if (Array.isArray(o.items)) return o.items as import("@/api/types").DboStub[];
    if (Array.isArray(o.results)) return o.results as import("@/api/types").DboStub[];
  }
  return [];
}
