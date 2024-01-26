import { Obj } from "../index.ts";

interface ConditionPart {
  error?: string; // Optional error message
}

interface BaseCondition extends ConditionPart {
  [key: string]: any;
  $lt?: Record<string, any>;
  $lte?: Record<string, any>;
  $gt?: Record<string, any>;
  $gte?: Record<string, any>;
  $ne?: Record<string, any>;
  $eq?: Record<string, any>;
  $in?: Record<string, any[]>;
  $nin?: Record<string, any[]>;
  $flags?: string;
  $regex?: Record<string, string>;
}

interface ComplexCondition extends BaseCondition {
  $and?: Condition[];
  $or?: Condition[];
  $not?: Condition;
}

export type Condition = ComplexCondition | BaseCondition;

export interface ConditionPlugin {
  key: string;
  handle: (value: any, charObj: Obj, error?: string) => Promise<boolean>;
}
