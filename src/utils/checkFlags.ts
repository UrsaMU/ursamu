import { IDBOBJ } from "../@types";
import { Obj, flags } from "../services";

export const checkFlags = (tar: IDBOBJ | Obj, flgs: string) =>
  flags.check(tar.flags, (flgs = ""));
