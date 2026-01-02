import { registerFunction } from "./registry.ts";

registerFunction("iter", async (args, data) => {
  const listStr = args[0] || "";
  const pattern = args[1] || "";
  const delim = args[2] || " ";
  const outDelim = args[3] || " ";

  if (!listStr) return "";

  const actualItems = delim === " " ? listStr.split(/\s+/).filter(x => x) : listStr.split(delim);
  
  const results: string[] = [];
  
  // deno-lint-ignore no-explicit-any
  const parser = (data as any).parser;
  
  if (!parser || typeof parser !== 'function') {
      return "#-1 PARSER ERROR";
  }
  
  for (let i = 0; i < actualItems.length; i++) {
      const item = actualItems[i];
      let currentPattern = pattern.replaceAll("##", item);
      currentPattern = currentPattern.replaceAll("#@", (i + 1).toString());
      
      const res = await parser(currentPattern, data);
      results.push(res);
  }
  
  return results.join(outDelim);
});


// Re-implementing map manually since the above dynamic lookup is hacky/wrong in this context.
registerFunction("map", async (args, data) => {
  const listStr = args[0] || "";
  const pattern = args[1] || "";
  const delim = args[2] || " ";
  const outDelim = args[3] || " ";

  if (!listStr) return "";

  const actualItems = delim === " " ? listStr.split(/\s+/).filter(x => x) : listStr.split(delim);
  const results: string[] = [];
  // deno-lint-ignore no-explicit-any
  const parser = (data as any).parser;
  
  if (!parser || typeof parser !== 'function') return "#-1 PARSER ERROR";
  
  for (let i = 0; i < actualItems.length; i++) {
      const item = actualItems[i];
      let currentPattern = pattern.replaceAll("##", item);
      currentPattern = currentPattern.replaceAll("#@", (i + 1).toString());
      results.push(await parser(currentPattern, data));
  }
  return results.join(outDelim);
});

registerFunction("filter", async (args, data) => {
    const listStr = args[0] || "";
    const pattern = args[1] || "";
    const delim = args[2] || " ";
    const outDelim = args[3] || " ";
  
    if (!listStr) return "";
  
    const actualItems = delim === " " ? listStr.split(/\s+/).filter(x => x) : listStr.split(delim);
    const results: string[] = [];
    // deno-lint-ignore no-explicit-any
    const parser = (data as any).parser;
    
    if (!parser || typeof parser !== 'function') return "#-1 PARSER ERROR";
    
    for (let i = 0; i < actualItems.length; i++) {
        const item = actualItems[i];
        let currentPattern = pattern.replaceAll("##", item);
        currentPattern = currentPattern.replaceAll("#@", (i + 1).toString());
        
        const res = await parser(currentPattern, data);
        if (res === "1" || (res !== "0" && res !== "")) {
            results.push(item);
        }
    }
    return results.join(outDelim);
});

registerFunction("exclude", (args) => {
    // exclude(list, item, delim) implies remove matching items?
    // actually, typically involves removing index?
    // MUX: remove(list, item, delim) removes BY CONTENT.
    // Implementation:
    const listStr = args[0] || "";
    const itemToRemove = args[1] || "";
    const delim = args[2] || " ";
    
    const items = delim === " " ? listStr.split(/\s+/).filter(x => x) : listStr.split(delim);
    return items.filter(x => x !== itemToRemove).join(delim);
});

registerFunction("item", (args) => {
    const listStr = args[0] || "";
    const index = parseInt(args[1] || "1") - 1; // 1-based
    const delim = args[2] || " ";
    
    const items = delim === " " ? listStr.split(/\s+/).filter(x => x) : listStr.split(delim);
    if (index < 0 || index >= items.length) return "";
    return items[index];
});

registerFunction("extract", (args) => {
    const listStr = args[0] || "";
    const start = parseInt(args[1] || "1") - 1; // 1-based
    const len = parseInt(args[2] || "1");
    const delim = args[3] || " ";
    
    const items = delim === " " ? listStr.split(/\s+/).filter(x => x) : listStr.split(delim);
    return items.slice(start, start + len).join(delim);
});

registerFunction("elements", (args) => {
    const listStr = args[0] || "";
    const indices = args[1] || "";
    const delim = args[2] || " ";
    
    const items = delim === " " ? listStr.split(/\s+/).filter(x => x) : listStr.split(delim);
    const idxs = indices.split(" ").map(x => parseInt(x) - 1);
    
    return idxs.map(i => items[i] || "").join(delim);
});

registerFunction("grab", (args) => {
    // grab(list, pattern, delim)
    const listStr = args[0] || "";
    const pattern = args[1] || "";
    const delim = args[2] || " ";
    
    // Glob match? 
    // Convert glob to regex
    const regexStr = "^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, ".*").replace(/\\\?/g, ".") + "$";
    const regex = new RegExp(regexStr, "i");
    
    const items = delim === " " ? listStr.split(/\s+/).filter(x => x) : listStr.split(delim);
    return items.find(x => regex.test(x)) || "";
});

registerFunction("match", (args) => {
    // match(list, pattern, delim) -> returns index (1-based)
    const listStr = args[0] || "";
    const pattern = args[1] || "";
    const delim = args[2] || " ";
    
    const regexStr = "^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, ".*").replace(/\\\?/g, ".") + "$";
    const regex = new RegExp(regexStr, "i");
    
    const items = delim === " " ? listStr.split(/\s+/).filter(x => x) : listStr.split(delim);
    const idx = items.findIndex(x => regex.test(x));
    return idx === -1 ? "0" : (idx + 1).toString();
});
