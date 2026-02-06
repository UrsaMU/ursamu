import { sandboxService } from "../services/Sandbox/SandboxService.ts";
import { flags } from "../services/flags/flags.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import type { IDBObj } from "../@types/UrsamuSDK.ts";
import { Obj } from "../services/DBObjs/DBObjs.ts";

export const evaluateLock = async (
  lockStr: string,
  enactor: IDBObj,
  target: IDBObj,
  depth = 0
): Promise<boolean> => {
  if (depth > 10) return false; // Prevent infinite recursion
  return await parseLock(lockStr, enactor, target, false, depth);
};

export const validateLock = async (lockStr: string): Promise<boolean> => {
    try {
        await parseLock(lockStr, null, null, true, 0);
        return true;
    } catch {
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
  let pos = 0;

  const parseOr = async (): Promise<boolean> => {
    let left = await parseAnd();
    while (pos < tokens.length && tokens[pos] === "|") {
        pos++;
        const right = await parseAnd();
        if (validationMode) left = true;
        else left = left || right;
    }
    return left;
  };

  const parseAnd = async (): Promise<boolean> => {
    let left = await parseNot();
    while (pos < tokens.length && tokens[pos] === "&") {
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
        target: { id: target.id }
      });
      return !!result && result !== "0" && result !== ""; 
    }

    // Direct Check (Flag, ID, etc)
    if (validationMode) return true;
    if (!enactor || !target) return false;
    return checkAtom(token, enactor, target, depth);
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
    } else if (["&", "|", "!", "(", ")"].includes(char)) {
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

const checkAtom = async (atom: string, enactor: IDBObj, _target: IDBObj, depth: number): Promise<boolean> => {
  atom = atom.trim();
  
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
    
    // Simple equality for now.
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
