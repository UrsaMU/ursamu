/** Shared staff flag checks for mail REST. */

const STAFF = new Set(["admin", "wizard", "superuser"]);

export function flagSet(raw: unknown): Set<string> {
  if (raw instanceof Set) {
    return new Set([...raw].map(String));
  }
  if (Array.isArray(raw)) return new Set(raw.map(String));
  if (typeof raw === "string") {
    return new Set(
      raw.split(/[\s,|]+/).map((s) => s.trim()).filter(Boolean),
    );
  }
  return new Set();
}

export function isStaffFlags(flags: unknown): boolean {
  const s = flagSet(flags);
  for (const f of STAFF) if (s.has(f)) return true;
  return false;
}
