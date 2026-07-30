/**
 * Helpers for the dual-mode JSON form editor.
 */

export type JsonPath = Array<string | number>;

export function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function isPlainObject(
  v: unknown,
): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function isScalarArray(v: unknown): v is unknown[] {
  return Array.isArray(v) &&
    v.every((x) =>
      x === null ||
      typeof x === "string" ||
      typeof x === "number" ||
      typeof x === "boolean"
    );
}

export function cloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function getAt(root: unknown, path: JsonPath): unknown {
  let cur: unknown = root;
  for (const p of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[p];
  }
  return cur;
}

export function setAt(
  root: unknown,
  path: JsonPath,
  value: unknown,
): unknown {
  if (path.length === 0) return value;
  const next = cloneJson(root);
  let cur = next as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]!;
    const child = cur[k];
    if (child == null || typeof child !== "object") {
      cur[k] = typeof path[i + 1] === "number" ? [] : {};
    } else {
      cur[k] = Array.isArray(child) ? [...child] : { ...child };
    }
    cur = cur[k] as Record<string | number, unknown>;
  }
  cur[path[path.length - 1]!] = value;
  return next;
}

export function removeAt(root: unknown, path: JsonPath): unknown {
  if (path.length === 0) return root;
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1]!;
  const parent = getAt(root, parentPath);
  if (Array.isArray(parent)) {
    const arr = [...parent];
    arr.splice(Number(key), 1);
    return setAt(root, parentPath, arr);
  }
  if (isPlainObject(parent)) {
    const obj = { ...parent };
    delete obj[String(key)];
    return setAt(root, parentPath, obj);
  }
  return root;
}

export function emptyFromSample(sample: unknown): unknown {
  if (sample && typeof sample === "object" && !Array.isArray(sample)) {
    const t: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(sample as object)) {
      if (typeof v === "boolean") t[k] = false;
      else if (typeof v === "number") t[k] = 0;
      else if (Array.isArray(v)) t[k] = [];
      else if (v && typeof v === "object") t[k] = {};
      else t[k] = "";
    }
    return t;
  }
  if (typeof sample === "number") return 0;
  if (typeof sample === "boolean") return false;
  return "";
}

export function addArrayItem(
  root: unknown,
  path: JsonPath,
  sample: unknown,
): unknown {
  const cur = getAt(root, path);
  const arr = Array.isArray(cur) ? [...cur] : [];
  arr.push(emptyFromSample(sample));
  return setAt(root, path, arr);
}

export function scalarArrayToText(arr: unknown[]): string {
  return arr.map((x) => (x === null ? "" : String(x))).join("\n");
}

export function textToScalarArray(
  text: string,
  sample: unknown[],
): unknown[] {
  const lines = text.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const kind = sample.length ? typeof sample[0] : "string";
  return lines.map((line) => {
    if (kind === "number") {
      const n = Number(line);
      return line.trim() === "" || Number.isNaN(n) ? 0 : n;
    }
    if (kind === "boolean") {
      return line.trim().toLowerCase() === "true";
    }
    return line;
  });
}
