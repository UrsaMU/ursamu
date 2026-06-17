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

registerBuiltin("attr", (enactor, _target, args) => {
  const attrName = (args[0] ?? "").trim();
  if (!Object.hasOwn(enactor.state, attrName)) return false;
  if (args.length < 2) return true;
  return String(enactor.state[attrName]) === args[1].trim();
});

registerBuiltin("type", (enactor, _target, args) =>
  enactor.flags.has((args[0] ?? "").trim().toLowerCase()));

registerBuiltin("is", (enactor, _target, args) => {
  const dbref = (args[0] ?? "").trim();
  return enactor.id === dbref.replace(/^#/, "");
});

registerBuiltin("holds", (enactor, _target, args) => {
  const dbref = (args[0] ?? "").trim().replace(/^#/, "");
  return enactor.contents.some((c) => c.id === dbref);
});

registerBuiltin("perm", (enactor, _target, args) => {
  const permLevel = (args[0] ?? "").trim();
  const flagStr = Array.from(enactor.flags).join(" ");
  return flags.check(flagStr, permLevel);
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

  if (atom.startsWith("+") || atom.match(/^[a-zA-Z0-9_+]+$/)) {
    const flagName = atom.startsWith("+") ? atom.slice(1) : atom;
    return flags.check(Array.from(enactor.flags || []).join(" "), flagName);
  }

  if (atom.startsWith("#")) {
    return enactor.id === atom.slice(1);
  }

  if (atom.includes(":")) {
    const [attr, val] = atom.split(":");
    const actualVal = enactor.state?.[attr.toLowerCase()];
    if (actualVal === undefined) return false;

    const cmpMatch = val.match(/^(>=|<=|>|<)(.+)$/);
    if (cmpMatch) {
      const [, op, numStr] = cmpMatch;
      const numVal = parseFloat(numStr);
      const actualNum = parseFloat(String(actualVal));
      if (!isNaN(numVal) && !isNaN(actualNum)) {
        if (op === ">=") return actualNum >= numVal;
        if (op === "<=") return actualNum <= numVal;
        if (op === ">") return actualNum > numVal;
        if (op === "<") return actualNum < numVal;
      }
    }
    return String(actualVal) === val;
  }

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

  return false;
};
