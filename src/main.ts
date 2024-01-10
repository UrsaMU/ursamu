import { join } from "../deps.ts";
import { __data, __dirname, mu } from "./services/server/mu.ts";
const arg = Deno.args[0];
const data = join(__dirname, "..", arg || "");

const dataConfig = await (async () => {
  try {
    const raw = await Deno.readTextFile(join(__data, "config.json"));
    return JSON.parse(raw);
  } catch (e) {
    console.log("Unable to load data configuration, using defaults!", e);
    return {};
  }
})();

if (import.meta.main) {
  mu.cfg.setConfig(dataConfig);
  mu.start();
}
