import { getFunction } from "./functions/index.ts";
import type { IParserContext } from "./types.ts";

export type { IParserContext };

export async function parser(
  input: string,
  context: Partial<IParserContext> | Record<string, unknown> = {}
): Promise<string> {
  if (!input.includes("[") && !input.includes("%")) return input;

  // Normalize context
  let ctx: IParserContext;
  if ("data" in context && "registers" in context) {
      ctx = context as IParserContext;
  } else {
      // Assume it's just data or a partial context
      ctx = {
          data: (context && "data" in context ? context.data : context) as Record<string, unknown>,
          registers: (context && "registers" in context ? context.registers : {}) as Record<string, string>,
          args: (context && "args" in context ? context.args : []) as string[],
      };
  }
  
  // Ensure defaults
  ctx.data = ctx.data || {};
  ctx.registers = ctx.registers || {};
  ctx.args = ctx.args || [];

  let depth = 0;
  let start = -1;
  let output = "";

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    // Handle substitutions at top level
    if (char === "%" && depth === 0) {
       const next = input[i+1];
       if (!next) { output += "%"; break; } // Trailing %

       // Escaping Brackets - Should we handle this at top level?
       // If %[, we output [.
       if (next === "[" || next === "]") {
           output += next;
           i++;
           continue;
       }
       
       // %0-%9
       if (/\d/.test(next)) {
           const argIdx = parseInt(next);
           output += ctx.args[argIdx] || "";
           i++;
           continue;
       }
       
       // %q<alphanum>
       if (next === "q" || next === "Q") {
           const reg = input[i+2];
           if (reg) {
               output += ctx.registers[reg.toLowerCase()] || "";
               i += 2;
               continue;
           }
       }
       
       // Fallthrough: output % normally
       output += char;
       continue;
    }
    
    // Check escapes inside or outside?
    // If we are inside brackets, we don'tsubstitute %, but we must respect escaped brackets for depth.
    if (char === "%" && (input[i+1] === "[" || input[i + 1] === "]")) {
        // Escaped bracket. Skip checks.
        i++;
        continue;
    }

    if (char === "[") {
      if (depth === 0) start = i;
      depth++;
    } else if (char === "]") {
      depth--;
      if (depth === 0 && start !== -1) {
        // Found a complete block []
        const inner = input.slice(start + 1, i);
        const result = await evaluate(inner, ctx);
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
}

async function evaluate(
  inner: string,
  ctx: IParserContext
): Promise<string> {
  // Split function name and args
  const firstParen = inner.indexOf("(");
  if (firstParen === -1) {
    // Treat as literal text if no parentheses, but still evaluate (e.g. for %-subs)
    return await parser(inner, ctx);
  }

  const funcName = inner.slice(0, firstParen).trim();
  const argsStr = inner.slice(firstParen + 1, inner.lastIndexOf(")"));
  
  const args = splitArgs(argsStr);
  const evaluatedArgs: string[] = [];
  
  for (const arg of args) {
      evaluatedArgs.push(await parser(arg.trim(), ctx));
  }

  return await executeFunction(funcName, evaluatedArgs, ctx);
}

export function splitArgs(
  str: string, 
  separator = ",", 
  _options: { stripBraces?: boolean } = {}
): string[] {
  const args: string[] = [];
  let current = "";
  let depth = 0;
  let parenDepth = 0;
  let braceDepth = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    // Handle escaped chars
    if (char === "%" || char === "\\") {
        const next = str[i+1];
        if (next) {
            current += char + next;
            i++;
            continue;
        }
    }

    if (char === "[") depth++;
    else if (char === "]") depth--;
    else if (char === "(") parenDepth++;
    else if (char === ")") parenDepth--;
    else if (char === "{") {
        braceDepth++;
        // If we are stripping braces, and this is the outer brace, don't add it?
        // MUX behavior: {a,b} -> becomes a,b when evaluated?
        // Usually splitArgs keeps the braces if they are part of the arg, 
        // but often we want to strip the outer layer if it was used just for escaping.
        // For now, let's keep them in the string.
    }
    else if (char === "}") braceDepth--;
    else if (char === separator && depth === 0 && parenDepth === 0 && braceDepth === 0) {
      args.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  args.push(current);
  return args;
}

async function executeFunction(
  name: string,
  args: string[],
  context: IParserContext
): Promise<string> {
  const func = getFunction(name);
  if (!func) {
      return ""; // Or HUH?
  }
  try {
    return await func(args, context.data || {}, context);
  } catch (error) {
    if (error instanceof Error) {
      return `#-1 ${error.message}`;
    }
    return `#-1 ${String(error)}`;
  }
}
