import { registerFunction } from "./registry.ts";

// Equality and Logic
registerFunction("eq", (args) => {
    if (args.length < 2) return "0";
    return args[0] === args[1] ? "1" : "0";
});

registerFunction("neq", (args) => {
    if (args.length < 2) return "1";
    return args[0] !== args[1] ? "1" : "0";
});

registerFunction("not", (args) => {
    return (!args[0] || args[0] === "0") ? "1" : "0";
});

registerFunction("t", (args) => {
    return (args[0] && args[0] !== "0") ? "1" : "0";
});

registerFunction("gt", (args) => {
    return parseFloat(args[0]) > parseFloat(args[1]) ? "1" : "0";
});

registerFunction("lt", (args) => {
    return parseFloat(args[0]) < parseFloat(args[1]) ? "1" : "0";
});

registerFunction("gte", (args) => {
    return parseFloat(args[0]) >= parseFloat(args[1]) ? "1" : "0";
});

registerFunction("lte", (args) => {
    return parseFloat(args[0]) <= parseFloat(args[1]) ? "1" : "0";
});

registerFunction("and", (args) => {
    for (const arg of args) {
        if (!arg || arg === "0") return "0";
    }
    return "1";
});

registerFunction("or", (args) => {
    for (const arg of args) {
        if (arg && arg !== "0") return "1";
    }
    return "0";
});

registerFunction("xor", (args) => {
    const a = (args[0] && args[0] !== "0");
    const b = (args[1] && args[1] !== "0");
    return (a ? !b : b) ? "1" : "0";
});

// Control Flow
// Note: `if` and `switch` need special handling in Parser if we want lazy evaluation.
// But current Parser evaluates all args eagerly.
// So `if(1, [setq(0,1)], [setq(0,2)])` -> both setq run!
// To fix this, we need lazy evaluation or "no-parse" logic.
// MUX handles `if` specially, or uses `if(cond, then, else)` where then/else are EVALUATED only if chosen?
// Yes, `if` is a standard function but usually expects arguments to be strings that might be evaluated?
// No, in MUX: `[if(1, Yes, No)]`. `Yes` and `No` are evaluated?
// Standard Softcode: All arguments to a function are evaluated BEFORE the function runs.
// UNLESS the function is special/NO_PARSE (like `switch`, `cond`, `iter` sometimes).
// Implemented as Eager for now, but `switch` usually requires matching patterns.
// If we want MUX behavior, we need `parser` to support `NO_EVAL` args for specific functions.
// For now, I'll implement `if` as eager. This is a known limitation of simple parsers.
// Users usually wrap side-effects in `[element(..., index)]` or use `switch` with careful construction (or use `trigger`/`@switch` command).
// Or we simply check condition and return the string.
// If the user wants delayed eval, they must escape: `if(1, \[setq(0,1)\], ...)`?
// Then `if` would need to call `parser` on the result?
// MUX `if` DOES NOT EVALUATE RESULT. It expects result to be evaluated.
// `if(1, %q0, %q1)` -> if q0=A, q1=B. Arg list: ["1", "A", "B"]. Returns "A".
// This is correct behavior for Pure functions.
// But for side-effects (`setq`), eager eval means both run.
// MUX PROPERLY evaluates `switch` and `if` lazily (or rather, the parser handles them specially).
// Given our current parser is simple, we will implement `if` as returning the evaluated string.
// So `if` is just a selection function.

registerFunction("if", (args) => {
   const cond = args[0] && args[0] !== "0";
   return cond ? args[1] : (args[2] || ""); 
});

registerFunction("switch", (args) => {
    // switch(TEST, P1, R1, P2, R2, ..., DEFAULT)
    if (args.length < 2) return "";
    const test = args[0];
    // Iterate pairs
    for (let i = 1; i < args.length - 1; i += 2) {
        // Pattern match? MUX supports wildcards `*`.
        // Simplest: exact match.
        // TODO: Wildcard match (glob).
        if (args[i] === test) { // Exact match for now
            return args[i+1];
        }
    }
    // Default
    if (args.length % 2 === 0) {
        return args[args.length - 1];
    }
    return "";
});
