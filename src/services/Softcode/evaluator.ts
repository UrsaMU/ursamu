// MUX softcode AST evaluator.
// Walks a parsed ASTNode tree produced by parser.ts and returns a string result.
// All %x substitutions, [eval blocks], and function calls are handled here.
// Side-effectful functions (pemit, remit, etc.) post messages via ctx.output.

import type {
  ASTNode,
  ArgNode,
  AtCommandNode,
  AttributeSetNode,
  BracedStringNode,
  CommandListNode,
  DollarPatternNode,
  EscapeNode,
  EvalBlockNode,
  FunctionCallNode,
  LiteralNode,
  SpecialVarNode,
  SubstitutionNode,
  TextNode,
  UserCommandNode,
} from "./types.ts";
import type { EvalContext } from "./context.ts";
import { isTimedOut, isTooDeep } from "./context.ts";
import { lookup } from "./stdlib/index.ts";
import { lookupSub } from "./stdlib/subRegistry.ts";
import { parse, SoftcodeSyntaxError } from "./parser.ts";

// ── Public entry point ────────────────────────────────────────────────────

/**
 * Evaluate a MUX softcode AST node and return its string result.
 * This is the single recursive entry point — all internal helpers call back
 * into this function so timeout/depth checks apply everywhere.
 */
export async function evaluate(node: ASTNode, ctx: EvalContext): Promise<string> {
  if (isTimedOut(ctx)) return "#-1 TIMEOUT";

  switch (node.type) {
    case "DollarPattern":   return evalDollarPattern(node, ctx);
    case "CommandList":     return evalCommandList(node, ctx);
    case "AtCommand":       return evalAtCommand(node, ctx);
    case "AttributeSet":    return evalAttributeSet(node, ctx);
    case "UserCommand":     return evalParts(node.parts, ctx);
    case "Text":            return evalParts((node as TextNode).parts, ctx);
    case "EvalBlock":       return evalEvalBlock(node, ctx);
    case "FunctionCall":    return evalFunctionCall(node, ctx);
    case "Arg":             return evalParts((node as ArgNode).parts, ctx);
    case "BracedString":    return evalBracedString(node, ctx);
    case "Literal":         return (node as LiteralNode).value;
    case "Substitution":    return evalSubstitution(node, ctx);
    case "SpecialVar":      return evalSpecialVar(node, ctx);
    case "Escape":          return (node as EscapeNode).char;

    // Lock nodes — serialise back to string (evaluated by evaluateLock.ts separately)
    case "LockOr":
    case "LockAnd":
    case "LockNot":
    case "LockMe":
    case "LockDbref":
    case "LockFlagCheck":
    case "LockTypeCheck":
    case "LockAttrCheck":
    case "LockPlayerName":
      return "";

    default: {
      const n = node as { type: string };
      return `#-1 UNKNOWN NODE (${n.type})`;
    }
  }
}

// ── Argument evaluation ───────────────────────────────────────────────────

/** Evaluate a sequence of tokens and concatenate results. */
async function evalParts(parts: ASTNode[], ctx: EvalContext): Promise<string> {
  const chunks: string[] = [];
  for (const part of parts) {
    if (isTimedOut(ctx)) return chunks.join("") + "#-1 TIMEOUT";
    chunks.push(await evaluate(part, ctx));
  }
  return chunks.join("");
}

/** Evaluate a FunctionCall argument node — same as evalParts but at Arg level. */
export async function evalArg(node: ArgNode, ctx: EvalContext): Promise<string> {
  return evalParts(node.parts, ctx);
}

// ── Node handlers ─────────────────────────────────────────────────────────

/** DollarPattern: evaluate the action side; pattern is for matching only. */
async function evalDollarPattern(node: DollarPatternNode, ctx: EvalContext): Promise<string> {
  return evaluate(node.action, ctx);
}

/**
 * CommandList: evaluate each command in sequence, separated by semicolons.
 * Returns the concatenated output (MUX normally discards intermediate output
 * but some functions like @switch return meaningful values).
 */
async function evalCommandList(node: CommandListNode, ctx: EvalContext): Promise<string> {
  const results: string[] = [];
  for (const cmd of node.commands) {
    if (isTimedOut(ctx)) break;
    results.push(await evaluate(cmd, ctx));
  }
  return results.join("");
}

/**
 * AtCommand: reconstitute the @command string and dispatch it.
 * The softcode worker's main thread handler (in SoftcodeService) intercepts
 * "softcode:atcmd" messages and routes them through cmdParser.
 */
async function evalAtCommand(node: AtCommandNode, ctx: EvalContext): Promise<string> {
  const name = node.name;
  const switches = node.switches.map((s) => `/${s}`).join("");
  const obj = node.object ? await evaluate(node.object, ctx) : "";
  const val = node.value ? await evaluate(node.value, ctx) : null;

  const body = val !== null ? `${obj}=${val}` : obj;
  const cmd = `@${name}${switches}${body ? " " + body : ""}`;

  // Post to main thread for dispatch through cmdParser.
  ctx.output.send(`\x00atcmd\x00${cmd}`, ctx.actor.id);
  return "";
}

/**
 * AttributeSet: &ATTR obj=value — set an attribute on an object.
 * Posts as an @set-equivalent to the main thread.
 */
async function evalAttributeSet(node: AttributeSetNode, ctx: EvalContext): Promise<string> {
  const obj = await evaluate(node.object, ctx);
  const val = await evaluate(node.value, ctx);
  ctx.output.send(`\x00atcmd\x00&${node.attribute} ${obj}=${val}`, ctx.actor.id);
  return "";
}

/**
 * EvalBlock [...]: evaluate inner content, concatenating function call results.
 * Innermost blocks are evaluated first by the recursive nature of the walker.
 */
async function evalEvalBlock(node: EvalBlockNode, ctx: EvalContext): Promise<string> {
  return evalParts(node.parts, ctx);
}

/**
 * BracedString {...}: evaluate content but protect semicolons/commas.
 * The grammar has already handled the protection at parse time — this just
 * evaluates the inner tokens normally.
 */
async function evalBracedString(node: BracedStringNode, ctx: EvalContext): Promise<string> {
  return evalParts(node.parts, ctx);
}

/**
 * FunctionCall: dispatch to stdlib, then to u() for user-defined functions.
 * Args are evaluated lazily — each stdlib function receives raw strings and
 * re-evaluates if needed (mirrors TinyMUX's lazy argument evaluation).
 *
 * Pre-evaluated values are in args[]; the original source text is in rawArgs[].
 * For "lazy" functions, the expression arg is NOT pre-evaluated (args[i] = "")
 * so side effects (setq, etc.) don't fire before the function takes control.
 */

// Arg indices that must NOT be pre-evaluated for specific functions.
// args[i] will be "" for these; the function uses rawArgs[i] instead.
const _LAZY: ReadonlyMap<string, ReadonlySet<number>> = new Map([
  ["localize",   new Set([0])],
  ["iter",       new Set([1])],
  ["parse",      new Set([1])],
  ["filter",     new Set([0])],
  ["filterbool", new Set([0])],
  ["fold",       new Set([0])],
  ["foreach",    new Set([1])],
  ["map",        new Set([0])],
]);

async function evalFunctionCall(node: FunctionCallNode, ctx: EvalContext): Promise<string> {
  if (isTimedOut(ctx)) return "#-1 TIMEOUT";

  const fnName = node.name.toLowerCase();

  // @@() is the inline comment — always returns empty string immediately.
  if (fnName === "@@") return "";

  const lazyIdx = _LAZY.get(fnName) ?? _EMPTY_SET;

  // Build args[] (evaluated) and rawArgs[] (source text).
  const args: string[]    = [];
  const rawArgs: string[] = [];
  for (let i = 0; i < node.args.length; i++) {
    if (isTimedOut(ctx)) return "#-1 TIMEOUT";
    rawArgs.push(argNodeToText(node.args[i]));
    args.push(lazyIdx.has(i) ? "" : await evalArg(node.args[i], ctx));
  }

  // Look up in built-in registry.
  const fn = lookup(fnName);
  if (fn) return fn(args, ctx, rawArgs);

  // Fall back to user-defined functions registered via @function.
  if (ctx.db.getUserFn) {
    const userCode = await ctx.db.getUserFn(fnName);
    if (userCode) {
      if (isTooDeep(ctx)) return "#-1 TOO DEEP";
      try {
        const ast = parse(userCode);
        // Build a sub-context with the caller's evaluated args as positional args.
        const subCtx: EvalContext = {
          ...ctx,
          args:     args,
          depth:    ctx.depth + 1,
          executor: ctx.executor,
          caller:   ctx.executor,
        };
        return await evaluate(ast as ASTNode, subCtx);
      } catch (err) {
        if (err instanceof SoftcodeSyntaxError) {
          return `#-1 FUNCTION (${node.name.toUpperCase()}) SYNTAX ERROR`;
        }
        throw err;
      }
    }
  }

  // Unknown function → TinyMUX-compatible error.
  return `#-1 FUNCTION (${node.name.toUpperCase()}) NOT FOUND`;
}

const _EMPTY_SET: ReadonlySet<number> = new Set();

/**
 * Serialize an ArgNode back to its original softcode source text.
 * Used to provide rawArgs[] to stdlib functions that need lazy evaluation.
 */
function argNodeToText(node: ArgNode): string {
  return node.parts.map(nodeToText).join("");
}

function nodeToText(node: ASTNode): string {
  switch (node.type) {
    case "Literal":      return (node as LiteralNode).value;
    case "Escape":       return (node as EscapeNode).char;
    case "Substitution": return `%${(node as SubstitutionNode).code}`;
    case "SpecialVar":   return (node as SpecialVarNode).code; // "##" | "#@" | "#$"
    case "EvalBlock":    return `[${(node as EvalBlockNode).parts.map(nodeToText).join("")}]`;
    case "BracedString": return `{${(node as BracedStringNode).parts.map(nodeToText).join("")}}`;
    case "Arg":          return (node as ArgNode).parts.map(nodeToText).join("");
    case "Text":         return (node as TextNode).parts.map(nodeToText).join("");
    case "FunctionCall": {
      const fn = node as FunctionCallNode;
      const fnArgs = fn.args.map(a => a.parts.map(nodeToText).join("")).join(",");
      return `${fn.name}(${fnArgs})`;
    }
    default: return "";
  }
}

// ── Substitution expansion ────────────────────────────────────────────────

/**
 * %<code> substitution table.
 * Handles all codes from the grammar: identity, names, pronouns,
 * positional args, registers, iter, variable attrs, formatting, ANSI.
 */
async function evalSubstitution(node: SubstitutionNode, ctx: EvalContext): Promise<string> {
  const code = node.code;

  // ── Identity / executor context ──────────────────────────────────────
  if (code === "#") return `#${ctx.actor.id}`;
  if (code === "!") return `#${ctx.executor.id}`;
  if (code === "@") return ctx.caller ? `#${ctx.caller.id}` : "#-1";

  // ── Names ──────────────────────────────────────────────────────────────
  if (code === "N") return ctx.actor.name ?? "";
  if (code === "n") return (ctx.actor.name ?? "").toLowerCase();
  if (code === "L") return `#${ctx.actor.location ?? "-1"}`;

  // ── Pronouns (resolved from actor's SEX attribute) ────────────────────
  const sex = await getPronounSex(ctx);
  if (code === "s") return pronouns[sex].subj;
  if (code === "S") return capitalize(pronouns[sex].subj);
  if (code === "o") return pronouns[sex].obj;
  if (code === "O") return capitalize(pronouns[sex].obj);
  if (code === "p") return pronouns[sex].poss;
  if (code === "P") return capitalize(pronouns[sex].poss);
  if (code === "a") return pronouns[sex].abs;
  if (code === "A") return capitalize(pronouns[sex].abs);

  // ── Positional arguments %0–%9 ────────────────────────────────────────
  if (/^[0-9]$/.test(code)) return ctx.args[parseInt(code, 10)] ?? "";

  // ── Argument count ────────────────────────────────────────────────────
  if (code === "+") return String(ctx.args.length);

  // ── Registers %q0–%q9, %qa–%qz ───────────────────────────────────────
  if (code.length === 2 && code[0] === "q") return ctx.registers.get(code[1]) ?? "";

  // ── Bare %i — current iter stack item (alias for ##) ─────────────────
  if (code === "i") {
    return ctx.iterStack.length > 0 ? ctx.iterStack[ctx.iterStack.length - 1].item : "";
  }

  // ── Iteration registers %i0–%i9 ───────────────────────────────────────
  if (code.length === 2 && code[0] === "i") {
    const depth = parseInt(code[1], 10);
    const idx = ctx.iterStack.length - 1 - depth;
    return idx >= 0 ? ctx.iterStack[idx].item : "";
  }

  // ── Variable attributes %VA–%VZ, %va–%vz ─────────────────────────────
  if (code.length === 2 && (code[0] === "V" || code[0] === "v")) {
    const attrName = "V" + code[1].toUpperCase();
    return (await ctx.db.getAttribute(ctx.executor, attrName)) ?? "";
  }

  // ── Formatting ────────────────────────────────────────────────────────
  if (code === "r" || code === "R") return "\r\n";
  if (code === "t" || code === "T") return "\t";
  if (code === "b" || code === "B") return " ";
  if (code === "%") return "%";
  if (code === "\\") return "\\";
  if (code === "[") return "[";
  if (code === "]") return "]";
  if (code === ",") return ",";
  if (code === ";") return ";";

  // ── ANSI color codes (%xr, %cb, %ch, etc.) ───────────────────────────
  if (
    (code[0] === "x" || code[0] === "X" || code[0] === "c" || code[0] === "C") &&
    code.length >= 2
  ) {
    return resolveAnsiCode(code);
  }

  // ── Misc TinyMUX-specific ─────────────────────────────────────────────
  if (code === "l" || code === "M") return ctx.args[ctx.args.length - 1] ?? "";
  if (code === "w") return "";  // newline if from queue; stub
  if (code === "|") return "";  // piped output; stub

  // ── Plugin-registered substitutions ──────────────────────────────────
  const pluginSub = lookupSub(code);
  if (pluginSub) return pluginSub(ctx);

  return "";
}

function evalSpecialVar(node: SpecialVarNode, ctx: EvalContext): string {
  if (node.code === "##") {
    return ctx.iterStack.length > 0
      ? ctx.iterStack[ctx.iterStack.length - 1].item
      : "";
  }
  if (node.code === "#@") {
    return ctx.iterStack.length > 0
      ? String(ctx.iterStack[ctx.iterStack.length - 1].pos)
      : "";
  }
  if (node.code === "#$") return "";  // last dbref from name lookup; stub
  return "";
}

// ── Pronoun helpers ───────────────────────────────────────────────────────

type PronounSex = "male" | "female" | "neutral" | "plural";

interface PronounSet {
  subj: string; obj: string; poss: string; abs: string;
}

const pronouns: Record<PronounSex, PronounSet> = {
  male:    { subj: "he",   obj: "him",  poss: "his",  abs: "his"  },
  female:  { subj: "she",  obj: "her",  poss: "her",  abs: "hers" },
  neutral: { subj: "it",   obj: "it",   poss: "its",  abs: "its"  },
  plural:  { subj: "they", obj: "them", poss: "their",abs: "theirs"},
};

async function getPronounSex(ctx: EvalContext): Promise<PronounSex> {
  const raw = (await ctx.db.getAttribute(ctx.actor, "SEX") ?? "").toLowerCase();
  if (raw.startsWith("m"))  return "male";
  if (raw.startsWith("f"))  return "female";
  if (raw.startsWith("p") || raw.startsWith("t")) return "plural";
  return "neutral";
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// ── ANSI color resolution ─────────────────────────────────────────────────
// Maps TinyMUX %cx / %xN codes to ANSI escape sequences.
// %ch = bold, %cn = reset, %cr = red fg, etc.

const ANSI_RESET = "\x1b[0m";

const ANSI_MAP: Record<string, string> = {
  // foreground colors
  r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m",
  b: "\x1b[34m", m: "\x1b[35m", c: "\x1b[36m",
  w: "\x1b[37m", x: "\x1b[30m",
  // background
  R: "\x1b[41m", G: "\x1b[42m", Y: "\x1b[43m",
  B: "\x1b[44m", M: "\x1b[45m", C: "\x1b[46m",
  W: "\x1b[47m", X: "\x1b[40m",
  // attributes
  h: "\x1b[1m",   // bold/bright
  i: "\x1b[3m",   // italic
  u: "\x1b[4m",   // underline
  f: "\x1b[5m",   // blink
  n: ANSI_RESET,  // normal/reset
};

function resolveAnsiCode(code: string): string {
  // code is e.g. "xr", "cb", "ch", "cn", "x<red>", "c<#ff0000>"
  const letter = code.slice(1);

  // angle-bracket spec: %x<red>, %x<#RRGGBB>, %x<R G B>
  if (letter.startsWith("<") && letter.endsWith(">")) {
    const spec = letter.slice(1, -1);
    // 24-bit hex: #RRGGBB
    const hex = /^#([0-9a-fA-F]{6})$/.exec(spec);
    if (hex) {
      const r = parseInt(hex[1].slice(0,2), 16);
      const g = parseInt(hex[1].slice(2,4), 16);
      const b = parseInt(hex[1].slice(4,6), 16);
      return `\x1b[38;2;${r};${g};${b}m`;
    }
    return ANSI_RESET;
  }

  return ANSI_MAP[letter] ?? ANSI_RESET;
}
