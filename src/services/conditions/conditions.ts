import { ConditionPlugin } from "../../index.ts";
import { Condition } from "../../index.ts";
import { getAttribute } from "../index.ts";
import { flags } from "../index.ts";
import { Obj } from "../index.ts";

export const conditionPlugins: Record<string, ConditionPlugin> = {};

export function registerConditionPlugin(plugin: ConditionPlugin) {
  if (conditionPlugins[plugin.key]) {
    throw new Error(`Plugin for key "${plugin.key}" is already registered.`);
  }
  conditionPlugins[plugin.key] = plugin;
}

export const checkCondition = async (
  condition: Condition,
  charObj: Obj,
): Promise<boolean> => {
  const keys = Object.keys(condition);

  if (keys.length > 1 && !keys.includes("error")) {
    throw new Error(
      `Invalid condition object with multiple keys: ${keys.join(", ")}`,
    );
  }

  const key = keys.find((k) => k !== "error");

  if (key === undefined || !(key in condition)) {
    throw new Error("Invalid condition: key is undefined or not in condition");
  }

  const value = condition[key];

  try {
    switch (key) {
      case "$and":
        for (const subCondition of value) {
          if (!await checkCondition(subCondition, charObj)) return false;
        }
        return true;
      case "$or":
        for (const subCondition of value) {
          if (await checkCondition(subCondition, charObj)) return true;
        }
        return false;
      case "$not":
        return !(await checkCondition(value, charObj));
      default:
        return await checkSingleCondition(key, value, charObj, condition.error);
    }
  } catch (error) {
    if (condition.error) {
      throw new Error(condition.error);
    }
    throw error;
  }
};

const checkSingleCondition = async (
  key: string,
  value: any,
  charObj: Obj,
  error?: string,
) => {
  if (conditionPlugins[key]) {
    return conditionPlugins[key].handle(value, charObj, error);
  }

  // Check for stats comparison condition
  const conditionKey = Object.keys(value)[0];
  const conditionValue = value[conditionKey];
  const charValue = getAttribute(charObj, conditionKey);
  let metCondition;
  switch (key) {
    case "$lt":
      metCondition = charValue < conditionValue;
      if (!metCondition && (error || value.error)) {
        throw new Error(error || value.error);
      }
      return metCondition;
    case "$lte":
      metCondition = charValue <= conditionValue;
      if (!metCondition && (error || value.error)) {
        throw new Error(error || value.error);
      }
      return metCondition;
    case "$gt":
      metCondition = charValue > conditionValue;
      if (!metCondition && (error || value.error)) {
        throw new Error(error || value.error);
      }
      return metCondition;
    case "$gte":
      metCondition = charValue >= conditionValue;
      if (!metCondition && (error || value.error)) {
        throw new Error(error || value.error);
      }
      return metCondition;
    case "$ne":
      metCondition = charValue !== conditionValue;
      if (!metCondition && (error || value.error)) {
        throw new Error(error || value.error);
      }
      return metCondition;
    case "$eq":
      metCondition = charValue === conditionValue;
      if (!metCondition && (error || value.error)) {
        throw new Error(error || value.error);
      }
      return metCondition;
    case "$in":
      metCondition = conditionValue.includes(charValue.value);
      if (!metCondition && (error || value.error)) {
        throw new Error(error || value.error);
      }
    case "$nin":
      metCondition = !conditionValue.includes(charValue.value);
      if (!metCondition && (error || value.error)) {
        throw new Error(error || value.error);
      }
    case "$flags":
      metCondition = flags.check(charObj.flags, conditionValue);
      if (!metCondition && (error || value.error)) {
        throw new Error(error || value.error);
      }
    case "$regex":
      metCondition = new RegExp(value[conditionKey]).test(charValue.value);
      if (!metCondition && (error || value.error)) {
        throw new Error(error || value.error);
      }
    default:
      throw new Error(`Invalid check condition: ${key}`);
  }
};
