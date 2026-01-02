import type { IDBOBJ } from "../@types/index.ts";
import { type Obj, flags } from "../services/index.ts";

export const checkFlags = (tar: IDBOBJ | Obj, flgs: string) =>
  flags.check(tar.flags, flgs);
