import { registerFunction } from "./registry.ts";

registerFunction("add", (args) => {
  const sum = args.reduce((acc, curr) => acc + parseFloat(curr || "0"), 0);
  return sum.toString();
});

registerFunction("sub", (args) => {
    const val1 = parseFloat(args[0] || "0");
    const val2 = parseFloat(args[1] || "0");
    return (val1 - val2).toString();
});

registerFunction("mul", (args) => {
    const sum = args.reduce((acc, curr) => acc * parseFloat(curr || "1"), 1);
    return sum.toString();
});

registerFunction("div", (args) => {
    const val1 = parseFloat(args[0] || "0");
    const val2 = parseFloat(args[1] || "1");
    if(val2 === 0) return "#-1 DIVISION BY ZERO";
    return (val1 / val2).toString();
});

registerFunction("mod", (args) => {
    const val1 = parseInt(args[0] || "0");
    const val2 = parseInt(args[1] || "1");
    if(val2 === 0) return "#-1 DIVISION BY ZERO";
    return (val1 % val2).toString();
});

registerFunction("abs", (args) => {
    return Math.abs(parseFloat(args[0] || "0")).toString();
});

registerFunction("min", (args) => {
    if (args.length === 0) return "0";
    const nums = args.map(a => parseFloat(a || "0"));
    return Math.min(...nums).toString();
});

registerFunction("max", (args) => {
    if (args.length === 0) return "0";
    const nums = args.map(a => parseFloat(a || "0"));
    return Math.max(...nums).toString();
});

registerFunction("dist2d", (args) => {
    const x1 = parseFloat(args[0] || "0");
    const y1 = parseFloat(args[1] || "0");
    const x2 = parseFloat(args[2] || "0");
    const y2 = parseFloat(args[3] || "0");
    
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx*dx + dy*dy).toString();
});

// Alias Remainder
registerFunction("remainder", (args) => {
    const val1 = parseInt(args[0] || "0");
    const val2 = parseInt(args[1] || "1");
    if(val2 === 0) return "#-1 DIVISION BY ZERO";
    return (val1 % val2).toString();
});
