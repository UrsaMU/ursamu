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
    else if (char === "{") braceDepth++;
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
