import { IDBOBJ } from "../@types/index.ts";
import { flags, Obj } from "../services/index.ts";

export const checkFlags = (tar: IDBOBJ | Obj, flgs: string) =>
  flags.check(tar.flags, flgs = "");
