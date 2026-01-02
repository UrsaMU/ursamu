import { registerFunction } from "./registry.ts";

registerFunction("cat", (args) => {
  return args.join("");
});

registerFunction("strlen", (args) => {
  return (args[0] || "").length.toString();
});

registerFunction("ucase", (args) => {
    return (args[0] || "").toUpperCase();
});

registerFunction("lcase", (args) => {
    return (args[0] || "").toLowerCase();
});
