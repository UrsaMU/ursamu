import { registerFunction } from "./registry.ts";
import { parser } from "../parser.ts";

registerFunction("iter", async (args, _data, ctx) => {
  // iter(list, pattern, [delimiter], [output_separator])
  // args[0]: list
  // args[1]: pattern (can use ## for current item, #@ for index)
  // args[2]: delimiter (default space)
  // args[3]: output separator (default space)

  const listStr = args[0] || "";
  const pattern = args[1] || "";
  const delimiter = args[2] || " ";
  const outputSep = args[3] || " ";

  const list = listStr.split(delimiter).filter(i => i.length > 0);
  const results: string[] = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    // We need to substitute ## and #@ in pattern?
    // And also potentially %0 etc if it's evaluated?
    // In MUX, `iter` evaluates the pattern for each item.
    // ## is the item, #@ is the 1-based index to the item.
    
    // We can use the parser with temporary registers or explicitly replace text before parsing?
    // Better to use registers if possible to avoid injection issues?
    // But MUX specifically uses ## and #@ substitutions TEXTUALLY before evaluation often, or as special symbols.
    
    // However, `parser` in our system handles `%` substitutions.
    // We'd need to modify `parser` to handle `##` and `#@` OR we replace them in the string then parse.
    // Replacing in string is risky if data contains ##.
    // But standard MUSH `iter` does exactly that or sets context.
    // Let's replace `##` with the item and `#@` with index.
    
    const currentPattern = pattern.replaceAll("##", item).replaceAll("#@", (i + 1).toString());
    
    // Also, usually `iter` sets a temporary context where maybe %0 is the item? 
    // MUSH Manual: "The symbol ## will be replaced by the current element... #@ by number..."
    // It doesn't use %0.
    
    const res = await parser(currentPattern, ctx || {});
    results.push(res);
  }

  return results.join(outputSep);
});
