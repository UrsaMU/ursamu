import type { IDBOBJ } from "../../@types/IDBObj.ts";

export interface IParserContext {
  data: Record<string, unknown>;
  registers: Record<string, string>;
  args: string[];
  enactor?: IDBOBJ;
  executor?: IDBOBJ;
  caller?: IDBOBJ;
}
