import { IDBOBJ } from "./index.ts";
import { Obj } from "../services/index.ts";

export interface IMStat {
  name: string;
  values: any[];
  calcValue?: (obj: IDBOBJ) => Promise<any>;
  type: string;
  splat?: string[];
  lock?: string;
  category?: string;
  default?: any;
  data?: any;
  hasInstance?: boolean;
  instances?: string[];
  hasSpecialties?: boolean;
  specialties?: IMStat[];
  error?: string;
  check?: (obj: Obj) => boolean | Promise<boolean>;
  callback?: (obj: Obj) => Promise<void>;
}
