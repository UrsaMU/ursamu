import { parser } from "../services/Softcode/parser.ts";
import { flags } from "../services/flags/flags.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";

export const evaluateLock = async (
  lockStr: string,
  enactor: IDBOBJ,
  target: IDBOBJ
): Promise<boolean> => {
  return await parseLock(lockStr, enactor, target, false);
};

export const validateLock = async (lockStr: string): Promise<boolean> => {
    try {
        await parseLock(lockStr, null, null, true);
        return true;
    } catch {
        return false;
    }
};

const parseLock = async (
    lockStr: string,
    enactor: IDBOBJ | null,
    target: IDBOBJ | null,
    validationMode: boolean
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
      // Softcode evaluation
      // @ts-ignore: Enactor/Target are checked before execution or handled by parser?
      // Actually parser expects objects. If validationMode is false, enactor/target MUST be present.
      if (!enactor || !target) return false; // Should not happen in eval mode

      const result = await parser(token, { data: { enactor, target } });
      return result !== "0" && !result.startsWith("#-1") && result !== ""; 
    }

    // Direct Check (Flag, ID, etc)
    if (validationMode) return true;
    if (!enactor || !target) return false;
    return checkAtom(token, enactor, target);
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

const checkAtom = (atom: string, enactor: IDBOBJ, _target: IDBOBJ): boolean => {
  atom = atom.trim();
  
  // Power/Flag Check
  if (atom.startsWith("+") || atom.match(/^[a-zA-Z]+$/)) { // Starts with + OR looks like a flag name?
    // MUX: +flag means check flag. plain word might be logic?
    // Let's assume flags usually start with + in locks or are just names.
    // If it's a known flag name, check it.
    // Wait, simple lock: "wizard" -> checks valid lock check? or checks if enactor is wizard?
    // `evaluateLock` is usually `check(enactor, target)`.
    // Atom `wizard` -> does enactor have wizard?
    
    const flagName = atom.startsWith("+") ? atom.slice(1) : atom;
    // We can use flags.check from flags service?
    // flags.check(flagsStr: string, lockStr: string) -> boolean. 
    // Wait `flags.check` implementation in `src/utils/canEdit.ts` (imports flags service)
    // `src/services/flags/flags.ts` has `check(enflags: string, lock: string)`.
    
    return flags.check(enactor.flags, flagName);
  }

  // DB Ref Check (#123)
  if (atom.startsWith("#")) {
    return enactor.id === atom.slice(1);
  }
  
  // Attribute Check (attr:value)
  if (atom.includes(":")) {
    const [attr, val] = atom.split(":");
    // Check if enactor has attribute `attr` with value `val`
    const attribute = enactor.data?.attributes?.find(a => a.name.toLowerCase() === attr.toLowerCase());
    if(!attribute) return false;
    
    // Glob/Regex matching?
    // MUX supports wildcards. For now, strict check or simple startsWith?
    // Let's support literal equality for now.
    return attribute.value === val;
  }
  
  // Indirect Lock (@#123) - Check the lock ON #123 (uses #123's Basic Lock)
  if (atom.startsWith("@#") || (atom.startsWith("@") && !atom.includes("/"))) { // @#123 or @Object
      // TODO: Resolve object, get its lock, evaluate it against EN ACTOR.
      // This creates recursion.
      // Skipping for MVP to avoid complexity or infinite loops.
      return false; 
  }

  return false;
};
