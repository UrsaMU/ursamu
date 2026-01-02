export const parser = async (
  input: string,
  data: Record<string, unknown> = {}
): Promise<string> => {
  if (!input.includes("[")) return input;

  let depth = 0;
  let start = -1;
  let output = "";

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === "[") {
      if (depth === 0) start = i;
      depth++;
    } else if (char === "]") {
      depth--;
      if (depth === 0 && start !== -1) {
        // Found a complete block []
        const inner = input.slice(start + 1, i);
        const result = await evaluate(inner, data);
        output += result;
        start = -1;
      }
    } else if (depth === 0) {
      output += char;
    }
  }

  // Handle unclosed brackets
  if (depth > 0 && start !== -1) {
    output += input.slice(start);
  }

  return output;
};

const evaluate = async (
  inner: string,
  data: Record<string, unknown>
): Promise<string> => {
  // Split function name and args
  const firstParen = inner.indexOf("(");
  if (firstParen === -1) {
    // Treat as literal text if no parentheses
    return inner;
  }

  const funcName = inner.slice(0, firstParen).trim();
  const argsStr = inner.slice(firstParen + 1, inner.lastIndexOf(")"));
  
  const args = splitArgs(argsStr);
  const evaluatedArgs: string[] = [];
  
  for (const arg of args) {
      // Trim whitespace from arguments before parsing
      // This matches MUX behavior where args are trimmed unless escaped/nested
      evaluatedArgs.push(await parser(arg.trim(), data));
  }

  return await executeFunction(funcName, evaluatedArgs, data);
};

const splitArgs = (str: string): string[] => {
  const args: string[] = [];
  let current = "";
  let depth = 0;
  let parenDepth = 0; // For () inside args that aren't function calls? MUX doesn't nest () except in math maybe.
  // MUX args are separated by , at the top level of the function call.
  // Nested [] are respected.

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === "[") depth++;
    else if (char === "]") depth--;
    else if (char === "(") parenDepth++;
    else if (char === ")") parenDepth--;
    else if (char === "," && depth === 0 && parenDepth === 0) {
      args.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  args.push(current);
  return args;
};

// Placeholder for registry
import { getFunction } from "./functions/index.ts";

const executeFunction = async (
  name: string,
  args: string[],
  data: Record<string, unknown>
): Promise<string> => {
  const func = getFunction(name);
  if (!func) {
    // If function not found, maybe return unmodified or empty?
    // In MUX, invalid function returns "Huh?" or the string itself?
    // Usually [invalid()] -> "Huh? (Type 'help' for help.)" or similar if command, 
    // but inline [invalid()] usually silently fails or returns empty string or error string.
    return ""; 
  }
  try {
    return await func(args, data);
  } catch (error) {
    if (error instanceof Error) {
      return `#-1 ${error.message}`;
    }
    return `#-1 ${String(error)}`;
  }
};
