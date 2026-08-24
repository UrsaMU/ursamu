import { plugin } from "./index.ts";

console.log("plugin.name", plugin.name);
console.log("plugin.version", plugin.version);
console.log("deps", JSON.stringify(plugin.dependencies));
const ok = plugin.init();
console.log("init", ok);
plugin.remove?.();
console.log("remove ok");
