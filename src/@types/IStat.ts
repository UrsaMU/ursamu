import { Obj } from "../services/DBObjs/index.ts";

export interface IStat {
  name: string;
  type: string;
  values?: array;
  default?: number;
  category?: string;
  hasInstance?: boolean;
  splat?: string[];
  lock?: string;
  check?: (obj: Obj) => boolean;
  error?: string;
  hasSpecialties?: boolean;
  specialties?: IStat[];
}
