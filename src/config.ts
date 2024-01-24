import { dpath, join } from "../deps.ts";
import defaultConfig from "./ursamu.config.ts";
import { Config } from "./@types/index.ts";
import lodash from "npm:lodash@4.17.21";
const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url));
const __data = Deno.env.get("DATA") || join(__dirname, "..", "data");

export const gameConfig = new Config(defaultConfig);

// Pull config from data/ if it exists
const dataConfig = await (async () => {
  try {
    const ret = await import(join(__data, "config.ts"));
    return ret.default;
  } catch (e) {
    console.log("Unable to load data/config.ts:", e);
    return {};
  }
})();

dataConfig.server ||= {};
dataConfig.game ||= {};

// With the default ursamu.config.ts as the defaults
gameConfig.setConfig(lodash.merge(defaultConfig, dataConfig));
