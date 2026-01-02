import type { IAttribute } from "./IAttribute.ts";

export interface IDBOBJ {
  id: string;
  description?: string;
  location?: string;
  flags: string;
  data?: {
    attributes?: IAttribute[];
    name?: string;
    password?: string;
    moniker?: string;
    money?: number;
    quota?: number;
    [key: string]: unknown;
  };
}
