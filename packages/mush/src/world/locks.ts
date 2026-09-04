import type { IDBObj } from "./types.ts";
import { flags } from "./flags.ts";
import { Obj } from "./dbobjs.ts";

const MAX_LOCK_DEPTH = 10;
const MAX_LOCK_LENGTH = 4096;

// --- Lock evaluator callback ---

export type LockEvaluatorFn = (
  expr: string,
  enactor: IDBObj,
  target: IDBObj,
) => Promise<boolean>;

let _lockEvaluator: LockEvaluatorFn | null = null;

/** Register a softcode evaluator for `[expr]` lock expressions. */
export function registerLockEvaluator(fn: LockEvaluatorFn): void {
  _lockEvaluator = fn;
}

// --- Lock function registry ---

export type LockFunc = (
  enactor: IDBObj,
  target: IDBObj,
  args: string[],
) => Promise<boolean> | boolean;

const registry = new Map<string, LockFunc>();
const RESERVED = new Set<string>();

function registerBuiltin(name: string, fn: LockFunc): void {
  const key = name.toLowerCase();
  registry.set(key, fn);
  RESERVED.add(key);
}

/** Register a custom lock function. Built-in names are protected. */
export function registerLockFunc(name: string, fn: LockFunc): void {
  const key = name.toLowerCase();
  if (RESERVED.has(key)) return;
  registry.set(key, fn);
}

export async function callLockFunc(
  name: string,
  enactor: IDBObj,
  target: IDBObj,
  args: string[],
): Promise<boolean> {
  const fn = registry.get(name.toLowerCase());
  if (!fn) return false;
  try {
    return await fn(enactor, target, args);
  } catch (_e: unknown) {
    return false;
  }
}

registerBuiltin("flag", (enactor, _target, args) =>
  enactor.flags.has((args[0] ?? "").trim().toLowerCase()));

/** Case-insensitive own-property lookup on enactor.state. */
function stateAttr(
  state: Record<string, unknown> | undefined,
  name: string,
): unknown {
  if (!state || !name) return undefined;
  if (Object.hasOwn(state, name)) return state[name];
  const want = name.toLowerCase();
  for (const k of Object.keys(state)) {
    if (k.toLowerCase() === want) return state[k];
  }
  return undefined;
}

/**
 * Compare lock attr values. Supports bare equality and
 * prefixed ops: >, <, >=, <=, =, !=, <>.
 */
export function compareLockAttrValue(
  actual: string,
  wantRaw: string,
): boolean {
  const want = wantRaw.trim();
  const cmp = want.match(/^(>=|<=|!=|<>|>|<|=)(.*)$/);
  if (cmp) {
    const op = cmp[1];
    const rhs = cmp[2].trim();
    const numWant = parseFloat(rhs);
    const numAct = parseFloat(actual);
    const bothNum = !Number.isNaN(numWant) && !Number.isNaN(numAct) &&
      /^-?\d+(\.\d+)?$/.test(rhs) &&
      /^-?\d+(\.\d+)?$/.test(actual.trim());
    if (bothNum) {
      if (op === ">=") return numAct >= numWant;
      if (op === "<=") return numAct <= numWant;
      if (op === ">") return numAct > numWant;
      if (op === "<") return numAct < numWant;
      if (op === "=") return numAct === numWant;
      if (op === "!=" || op === "<>") return numAct !== numWant;
    }
    if (op === "=") return actual === rhs;
    if (op === "!=" || op === "<>") return actual !== rhs;
    return false;
  }
  return actual === want;
}

registerBuiltin("attr", (enactor, _target, args) => {
  const attrName = (args[0] ?? "").trim();
  if (!attrName) return false;
  const actual = stateAttr(enactor.state, attrName);
  if (actual === undefined) return false;
  if (args.length < 2) return true;
  return compareLockAttrValue(String(actual), args[1] ?? "");
});

registerBuiltin("type", (enactor, _target, args) =>
  enactor.flags.has((args[0] ?? "").trim().toLowerCase()));

registerBuiltin("is", (enactor, _target, args) => {
  const dbref = (args[0] ?? "").trim();
  return enactor.id === dbref.replace(/^#/, "");
});

const holdsImpl: LockFunc = (enactor, _target, args) => {
  const dbref = (args[0] ?? "").trim().replace(/^#/, "");
  return enactor.contents.some((c) => c.id === dbref);
};
registerBuiltin("holds", holdsImpl);
// TinyMUX alias
registerBuiltin("carries", holdsImpl);

/**
 * perm(level) — privilege ladder check.
 * Digibear treats bare names as exact flags; the `+` suffix means
 * "this level or higher". Superuser must pass perm(staff)/perm(builder).
 */
registerBuiltin("perm", (enactor, _target, args) => {
  const raw = (args[0] ?? "").trim();
  if (!raw) return false;
  const flagStr = Array.from(enactor.flags).join(" ");
  // Already hierarchical (builder+, admin+) — use as-is.
  if (raw.endsWith("+")) return flags.check(flagStr, raw);
  // Exact flag first, then ladder (staff → staff+).
  if (flags.check(flagStr, raw)) return true;
  return flags.check(flagStr, `${raw}+`);
});

/** TinyMUX owner() — enactor owns the locked object (target). */
registerBuiltin("owner", (enactor, target, _args) => {
  const owner = String(
    (target.state?.owner as string | undefined) ?? target.id,
  ).replace(/^#/, "");
  return enactor.id === owner || enactor.id === target.id;
});

// --- Public API ---

export const evaluateLock = async (
  lockStr: string,
  enactor: IDBObj,
  target: IDBObj,
  depth = 0,
): Promise<boolean> => {
  if (depth > MAX_LOCK_DEPTH) return false;
  if (lockStr.length > MAX_LOCK_LENGTH) return false;
  return await parseLock(lockStr, enactor, target, false, depth);
};

export const validateLock = async (lockStr: string): Promise<boolean> => {
  try {
    await parseLock(lockStr, null, null, true, 0);
    return true;
  } catch (_e: unknown) {
    return false;
  }
};

// --- Internal parser ---

const parseLock = async (
  lockStr: string,
  enactor: IDBObj | null,
  target: IDBObj | null,
  validationMode: boolean,
  depth: number,
): Promise<boolean> => {
  if (!lockStr) return true;

  const tokens = tokenize(lockStr);
  if (tokens.length > 256) return validationMode ? true : false;
  let pos = 0;

  const parseOr = async (): Promise<boolean> => {
    let left = await parseAnd();
    while (pos < tokens.length && (tokens[pos] === "|" || tokens[pos] === "||")) {
      pos++;
      const right = await parseAnd();
      if (validationMode) left = true;
      else left = left || right;
    }
    return left;
  };

  const parseAnd = async (): Promise<boolean> => {
    let left = await parseNot();
    while (pos < tokens.length && (tokens[pos] === "&" || tokens[pos] === "&&")) {
      pos++;
      const right = await parseNot();
      if (validationMode) left = true;
      else left = left && right;
    }
    return left;
  };

  const parseNot = async (): Promise<boolean> => {
    if (pos < tokens.length && tokens[pos] === "!") {
      pos++;
      return !(await parseNot());
    }
    return await parsePrimary();
  };

  const parsePrimary = async (): Promise<boolean> => {
    if (pos >= tokens.length) return false;

    const token = tokens[pos].trim();
    pos++;

    if (token === "(") {
      const result = await parseOr();
      if (pos < tokens.length && tokens[pos] === ")") pos++;
      return result;
    }

    if (token.startsWith("[")) {
      if (validationMode) return true;
      if (!enactor || !target) return false;
      if (!_lockEvaluator) return false;
      const result = await _lockEvaluator(token.slice(1, -1), enactor, target);
      return result;
    }

    if (validationMode) return true;
    if (!enactor || !target) return false;
    return checkAtom(token, enactor, target, depth, validationMode);
  };

  return await parseOr();
};

const tokenize = (str: string): string[] => {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (char === "[") {
      depth++;
      current += char;
    } else if (char === "]") {
      depth--;
      current += char;
      if (depth === 0) {
        tokens.push(current);
        current = "";
      }
    } else if (depth > 0) {
      current += char;
    } else if (char === "&" || char === "|") {
      if (current.trim()) tokens.push(current.trim());
      if (str[i + 1] === char) {
        tokens.push(char + char);
        i++;
      } else {
        tokens.push(char);
      }
      current = "";
    } else if (char === "(") {
      const trimmed = current.trim();
      if (trimmed && /^[a-z_][a-z0-9_]*$/i.test(trimmed)) {
        current = trimmed + char;
        let pd = 1;
        i++;
        while (i < str.length && pd > 0) {
          const c = str[i];
          current += c;
          if (c === "(") pd++;
          else if (c === ")") pd--;
          i++;
        }
        i--;
        tokens.push(current.trim());
        current = "";
      } else {
        if (trimmed) tokens.push(trimmed);
        tokens.push("(");
        current = "";
      }
    } else if (["!", ")"].includes(char)) {
      if (current.trim()) tokens.push(current.trim());
      tokens.push(char);
      current = "";
    } else if (/\s/.test(char) && depth === 0) {
      if (current.trim()) tokens.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) tokens.push(current.trim());

  // Insert implicit AND between adjacent atoms.
  const isOp = (t: string) =>
    t === "&" || t === "&&" || t === "|" || t === "||" || t === "!" || t === "(";
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (i > 0) {
      const prev = out[out.length - 1];
      const cur = tokens[i];
      const prevTerminates = prev === ")" || (!isOp(prev) && prev !== "!");
      const curStartsAtom = cur === "(" || cur === "!" || !isOp(cur);
      if (prevTerminates && curStartsAtom) out.push("&");
    }
    out.push(tokens[i]);
  }
  return out;
};

const checkAtom = async (
  atom: string,
  enactor: IDBObj,
  target: IDBObj,
  depth: number,
  validationMode: boolean,
): Promise<boolean> => {
  if (depth > 10) return false;
  atom = atom.trim();

  const funcMatch = atom.match(/^([a-z_][a-z0-9_]*)\(([^)]*)\)$/i);
  if (funcMatch) {
    if (validationMode) return true;
    const name = funcMatch[1].toLowerCase();
    const args = funcMatch[2].split(",").map((s) => s.trim()).filter(Boolean);
    return callLockFunc(name, enactor, target, args);
  }

  // TinyMUX: me — enactor owns the locked object (or is it).
  if (atom.toLowerCase() === "me") {
    if (validationMode) return true;
    const owner = String(
      (target.state?.owner as string | undefined) ?? target.id,
    ).replace(/^#/, "");
    return enactor.id === owner || enactor.id === target.id;
  }

  // TinyMUX: *Name — enactor is that player (by name).
  if (atom.startsWith("*")) {
    if (validationMode) return true;
    const want = atom.slice(1).trim().toLowerCase();
    if (!want) return false;
    const have = String(
      enactor.state?.name ?? enactor.name ?? "",
    ).toLowerCase();
    return have === want;
  }

  if (atom.startsWith("#")) {
    return enactor.id === atom.slice(1);
  }

  // TinyMUX: @#dbref / @dbref — evaluate that object's basic lock.
  if (atom.startsWith("@#") || (atom.startsWith("@") && !atom.includes("/"))) {
    const id = atom.startsWith("@#") ? atom.slice(2) : atom.slice(1);
    const tarObj = await Obj.get(id);
    if (tarObj) {
      const lock = tarObj.dbobj.data?.lock as string;
      if (lock) {
        const hydratedTar: IDBObj = {
          id: tarObj.id,
          name: tarObj.name,
          flags: new Set(tarObj.flags.split(" ")),
          location: tarObj.location,
          state: tarObj.dbobj.data || {},
          contents: [],
        };
        return await evaluateLock(lock, enactor, hydratedTar, depth + 1);
      }
    }
    return false;
  }

  // TinyMUX: attr:value (and attr:>N etc.) on enactor state.
  if (atom.includes(":")) {
    const colon = atom.indexOf(":");
    const attr = atom.slice(0, colon);
    const val = atom.slice(colon + 1);
    const actualVal = stateAttr(enactor.state, attr);
    if (actualVal === undefined) return false;
    return compareLockAttrValue(String(actualVal), val);
  }

  // +FLAG or bare FLAG / power word (wizard, builder+, connected).
  if (atom.startsWith("+") || atom.match(/^[a-zA-Z0-9_+]+$/)) {
    const flagName = atom.startsWith("+") ? atom.slice(1) : atom;
    return flags.check(
      Array.from(enactor.flags || []).join(" "),
      flagName,
    );
  }

  return false;
};
