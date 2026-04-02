// ESM wrapper around the CommonJS peggy-compiled parser.
// Deno 2.x supports CJS interop via node:module createRequire.
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
const _parser = _require("./parser.js") as {
  parse: (
    input: string,
    options?: { startRule?: "Start" | "LockExpr" }
  ) => unknown;
  SyntaxError: new (
    message: string,
    expected: unknown,
    found: unknown,
    location: unknown
  ) => Error;
  StartRules: string[];
};

/** Parse a MUX softcode attribute value. Returns an ASTNode tree. */
export const parse = _parser.parse;

/** Peggy parse error — thrown when input is syntactically invalid. */
export const SoftcodeSyntaxError = _parser.SyntaxError;
