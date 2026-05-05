import { sandboxService } from "../services/Sandbox/SandboxService.ts";

const MAX_LOCK_DEPTH = 10;
import { flags } from "../services/flags/flags.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import type { IDBObj } from "../@types/UrsamuSDK.ts";
import { Obj } from "../services/DBObjs/DBObjs.ts";
import { callLockFunc } from "./lockFuncs.ts";

const MAX_LOCK_LENGTH = 4096;

export const evaluateLock = async (
  lockStr: string,
  enactor: IDBObj,
  target: IDBObj,
  depth = 0
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

const parseLock = async (
    lockStr: string,
    enactor: IDBObj | null,
    target: IDBObj | null,
    validationMode: boolean,
    depth: number
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
    
    // Trim the token to handle leading whitespace from tokenizer
    const token = tokens[pos].trim();
    pos++;

    if (token === "(") {
      const result = await parseOr();
      if (pos < tokens.length && tokens[pos] === ")") {
        pos++;
      }
      return result;
    }

    if (token.startsWith("[")) {
      if (validationMode) return true;
      // Script Engine evaluation
      if (!enactor || !target) return false;

      const result = await sandboxService.runScript(token.slice(1, -1), {
        id: enactor.id,
        location: enactor.location || "limbo",
        state: enactor.state || {},
        target: target ? { id: target.id } : undefined
      });
      return !!result && result !== "0" && result !== ""; 
    }

    // Direct Check (Flag, ID, etc)
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
        // funcname( — consume until matching ) as a single token
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
    } else {
      current += char;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
};

const checkAtom = async (atom: string, enactor: IDBObj, target: IDBObj, depth: number, validationMode: boolean): Promise<boolean> => {
  if (depth > 10) return false;
  atom = atom.trim();

  const funcMatch = atom.match(/^([a-z_][a-z0-9_]*)\(([^)]*)\)$/i);
  if (funcMatch) {
    if (validationMode) return true;
    const name = funcMatch[1].toLowerCase();
    const args = funcMatch[2].split(",").map((s) => s.trim()).filter(Boolean);
    return callLockFunc(name, enactor, target, args);
  }

  // Power/Flag Check
  if (atom.startsWith("+") || atom.match(/^[a-zA-Z0-9_+]+$/)) { 
    const flagName = atom.startsWith("+") ? atom.slice(1) : atom;
    // Check if it's a flag/power/tag.
    // The tags/flags system usually checks the actor.
    return flags.check(Array.from(enactor.flags || []).join(" "), flagName);
  }

  // DB Ref Check (#123)
  if (atom.startsWith("#")) {
    return enactor.id === atom.slice(1);
  }
  
  // Attribute Check (attr:value)
  if (atom.includes(":")) {
    const [attr, val] = atom.split(":");
    const actualVal = enactor.state?.[attr.toLowerCase()];
    if (actualVal === undefined) return false;
    
    // Comparison operators: attr:>5, attr:>=10, attr:<3, attr:<=100
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
  
  // Indirect Lock (@#123) - Check the lock ON #123 (uses #123's Basic Lock)
  if (atom.startsWith("@#") || (atom.startsWith("@") && !atom.includes("/"))) { 
      const id = atom.startsWith("@#") ? atom.slice(2) : atom.slice(1);
      const tarObj = await Obj.get(id);
      if (tarObj) {
          const lock = tarObj.dbobj.data?.lock as string;
          if (lock) {
            // Hydrate tarObj to IDBObj for recursion
            const hydratedTar: IDBObj = {
                id: tarObj.id,
                name: tarObj.name,
                flags: new Set(tarObj.flags.split(" ")),
                location: tarObj.location,
                state: tarObj.dbobj.data || {},
                contents: [] // For now
            };
            return await evaluateLock(lock, enactor, hydratedTar, depth + 1);
          }
      }
      return false; 
  }

  return false;
};

export const hydrate = (obj: IDBOBJ): IDBObj => ({
  id: obj.id,
  name: obj.data?.name || obj.data?.moniker || "Unknown",
  flags: new Set(obj.flags.split(" ")),
  location: obj.location,
  state: obj.data || {},
  contents: []
});
