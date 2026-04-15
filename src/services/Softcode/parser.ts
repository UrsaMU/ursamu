// Thin re-export — delegates to @ursamu/mushcode so the 87 KB parser.cjs
// and the node:module createRequire shim are no longer needed.
export { parse }                        from "@ursamu/mushcode/parse";
export { ParseError as SoftcodeSyntaxError } from "@ursamu/mushcode/parse";
