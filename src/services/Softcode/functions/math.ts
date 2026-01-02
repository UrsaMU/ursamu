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
