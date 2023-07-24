import { IDBOBJ } from ".";

export interface IMStat {
  name: string;
  values: any[];
  type: string;
  splat?: string;
  lock?: string;
  category?: string;
  default?: any;
  data?: any;
  hasInstance?: boolean;
  instances?: string[];
  hasSpecialties?: boolean;
  specialties?: IMStat[];
  check?: (obj?: IDBOBJ) => boolean;
}
