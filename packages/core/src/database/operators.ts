import type { Query, QueryCondition } from "./types.ts";

// ── Dot-notation field access ────────────────────────────────────────────────

export function getField(obj: unknown, path: string): unknown {
  if (!path.includes(".")) return (obj as Record<string, unknown>)[path];
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function setField<T>(obj: T, path: string, value: unknown): T {
  if (!path.includes(".")) {
    return { ...obj as Record<string, unknown>, [path]: value } as T;
  }
  const parts = path.split(".");
  const root = { ...(obj as Record<string, unknown>) };
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    cur[part] = typeof cur[part] === "object" && cur[part] !== null
      ? { ...(cur[part] as Record<string, unknown>) }
      : {};
    cur = cur[part] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
  return root as T;
}

export function deleteField<T>(obj: T, path: string): T {
  if (!path.includes(".")) {
    const copy = { ...(obj as Record<string, unknown>) };
    delete copy[path];
    return copy as T;
  }
  const parts = path.split(".");
  const root = { ...(obj as Record<string, unknown>) };
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (cur[part] == null || typeof cur[part] !== "object") return obj;
    cur[part] = { ...(cur[part] as Record<string, unknown>) };
    cur = cur[part] as Record<string, unknown>;
  }
  delete cur[parts[parts.length - 1]];
  return root as T;
}

// ── Prototype pollution guard ─────────────────────────────────────────────────

const DANGEROUS = new Set(["__proto__", "constructor", "prototype"]);

export function isDangerousKey(key: string): boolean {
  if (DANGEROUS.has(key)) return true;
  if (key.includes(".")) return key.split(".").some((s) => DANGEROUS.has(s));
  return false;
}

// ── Query matching ────────────────────────────────────────────────────────────

export function matchesQuery<T>(value: T, query?: Query<T>): boolean {
  if (!query) return true;
  if (typeof query !== "object") return value === query;

  if ("$or" in query && Array.isArray(query.$or)) {
    return (query.$or as QueryCondition[]).some((c) => matchesQuery(value, c));
  }
  if ("$and" in query && Array.isArray(query.$and)) {
    return (query.$and as QueryCondition[]).every((c) => matchesQuery(value, c));
  }
  // $where intentionally removed — it executes arbitrary JS and is a
  // code-execution vector if queries can be influenced by user input.

  for (const [key, condition] of Object.entries(query)) {
    const val = getField(value, key);
    if (condition instanceof RegExp) {
      if (!condition.test(val as string)) return false;
    } else if (
      typeof condition === "object" && condition !== null && !Array.isArray(condition)
    ) {
      const condObj = condition as Record<string, unknown>;
      if ("$in" in condObj) {
        const inValues = condObj.$in as unknown[];
        const hit = Array.isArray(val)
          ? inValues.some((v) => (val as unknown[]).includes(v))
          : inValues.includes(val);
        if (!hit) return false;
      } else if ("$ne" in condObj) {
        if (val === condObj.$ne) return false;
      } else if (!matchesQuery(val as T, condition as Query<T>)) {
        return false;
      }
    } else if (val !== condition) {
      return false;
    }
  }
  return true;
}

// ── Modify operators ─────────────────────────────────────────────────────────

export function applySet<T>(item: T, data: Partial<T>): T {
  let updated = { ...item } as T;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (isDangerousKey(key)) continue;
    updated = setField(updated, key, value);
  }
  return updated;
}

export function applyUnset<T>(item: T, data: Partial<T>): T {
  let updated = { ...item } as T;
  for (const key of Object.keys(data as Record<string, unknown>)) {
    if (isDangerousKey(key)) continue;
    updated = deleteField(updated, key);
  }
  return updated;
}

export function applyInc<T>(item: T, data: Partial<T>): T {
  let updated = { ...item } as T;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (isDangerousKey(key)) continue;
    if (typeof value !== "number" || isNaN(value)) continue;
    const current = (getField(updated, key) as number) ?? 0;
    updated = setField(updated, key, current + value);
  }
  return updated;
}

export function applyPush<T>(item: T, data: Partial<T>): T {
  let updated = { ...item } as T;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (isDangerousKey(key)) continue;
    const existing = (getField(updated, key) as unknown[]) ?? [];
    updated = setField(updated, key, [...existing, value]);
  }
  return updated;
}
