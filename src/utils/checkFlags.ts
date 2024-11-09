import { IDBOBJ } from "../@types";
import { flags, Obj } from "../services";

export const checkFlags = (tar: IDBOBJ | Obj, flgs: string) =>
  flags.check(tar.flags, flgs = "");
