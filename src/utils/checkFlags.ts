import { IDBOBJ } from "../@types/index.ts";
import { Obj, flags } from "../services/index.ts";

export const checkFlags = (tar: IDBOBJ | Obj, flgs: string) =>
  flags.check(tar.flags, flgs = "");
