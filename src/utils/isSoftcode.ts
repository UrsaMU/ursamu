import type { IAttribute } from "../@types/IAttribute.ts";

/**
 * Returns true if the attribute should be evaluated as MUX softcode rather
 * than TypeScript/JS via the sandbox.
 *
 * An attribute is softcode when:
 *   1. Its `type` field is explicitly `"softcode"`, OR
 *   2. Autodetect: the value contains MUX substitution/function syntax
 *      (%X, [func(...)]) but does NOT contain TypeScript-style tokens
 *      (import, export, const, let, var, function, =>, async).
 */
export function isSoftcode(attr: IAttribute): boolean {
  if (attr.type === "softcode") return true;
  if (attr.type && attr.type !== "attribute") return false;

  const v = attr.value;
  const hasMux = /\[.*\(|%[0-9a-zA-Z#!@+]/u.test(v);
  if (!hasMux) return false;

  const hasJS = /\b(import|export|const|let|var|function|=>|async\s+function)\b/.test(v);
  return !hasJS;
}
