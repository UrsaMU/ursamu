import { chans, dbojs, flags, gameConfig, mail } from "../index.ts";
import * as utils from "../utils/index.ts";
export class UrsaaMU {
  config = gameConfig;
  db = {
    dbojs,
    mail,
    chans,
  };
  utils = utils;
  flags = flags;
}

export const ursa = new UrsaaMU();
