// AST node types produced by mux-softcode.pegjs → parser.js (Peggy 5.x).
// These mirror the `node(type, props)` calls in the grammar exactly.

// ── Union ─────────────────────────────────────────────────────────────────

export type ASTNode =
  | DollarPatternNode
  | PatternAltsNode
  | PatternNode
  | WildcardNode
  | CommandListNode
  | AtCommandNode
  | AttributeSetNode
  | UserCommandNode
  | TextNode
  | EvalBlockNode
  | FunctionCallNode
  | ArgNode
  | BracedStringNode
  | LiteralNode
  | SubstitutionNode
  | SpecialVarNode
  | EscapeNode
  | LockOrNode
  | LockAndNode
  | LockNotNode
  | LockMeNode
  | LockDbrefNode
  | LockFlagCheckNode
  | LockTypeCheckNode
  | LockAttrCheckNode
  | LockPlayerNameNode;

// ── Top-level ─────────────────────────────────────────────────────────────

/** $<pattern>:<action> — a softcoded user command definition. */
export interface DollarPatternNode {
  type: "DollarPattern";
  pattern: PatternNode | PatternAltsNode;
  action: ASTNode;
}

/** Multiple glob alternatives before the colon: $hi;hello;hey * */
export interface PatternAltsNode {
  type: "PatternAlts";
  patterns: PatternNode[];
}

/** One glob pattern — may contain * ? wildcards and escape sequences. */
export interface PatternNode {
  type: "Pattern";
  parts: Array<WildcardNode | LiteralNode>;
}

export interface WildcardNode {
  type: "Wildcard";
  wildcard: "*" | "?";
}

/** A semicolon-separated list of commands. */
export interface CommandListNode {
  type: "CommandList";
  commands: ASTNode[];
}

// ── Commands ──────────────────────────────────────────────────────────────

/** @name[/switch]* [object[=value]] */
export interface AtCommandNode {
  type: "AtCommand";
  name: string;
  switches: string[];
  object: TextNode | null;
  value: ASTNode | null;
}

/** &ATTRNAME object=value */
export interface AttributeSetNode {
  type: "AttributeSet";
  attribute: string;
  object: TextNode;
  value: ASTNode;
}

/** Any command that isn't @ or &. */
export interface UserCommandNode {
  type: "UserCommand";
  parts: ASTNode[];
}

/** Object-position text (before = in a command). */
export interface TextNode {
  type: "Text";
  parts: ASTNode[];
}

// ── Expressions ───────────────────────────────────────────────────────────

/** [...] — evaluated and result replaces the block. */
export interface EvalBlockNode {
  type: "EvalBlock";
  parts: ASTNode[];
}

/** name(arg, arg, ...) */
export interface FunctionCallNode {
  type: "FunctionCall";
  name: string;
  args: ArgNode[];
}

/** A single function argument (zero or more tokens). */
export interface ArgNode {
  type: "Arg";
  parts: ASTNode[];
}

/** {...} — protects content from semicolon splitting and comma splitting. */
export interface BracedStringNode {
  type: "BracedString";
  parts: ASTNode[];
}

/** Plain literal text (already coalesced by the grammar). */
export interface LiteralNode {
  type: "Literal";
  value: string;
}

// ── Substitutions ─────────────────────────────────────────────────────────

/**
 * %<code> — substitution.
 * code is the raw string after % (e.g. "#", "N", "q0", "xr", "r", "0").
 */
export interface SubstitutionNode {
  type: "Substitution";
  code: string;
}

/** ## (current iter item), #@ (iter position), #$ (last dbref from name lookup). */
export interface SpecialVarNode {
  type: "SpecialVar";
  code: "##" | "#@" | "#$";
}

/** \<char> — escape sequence preventing one level of evaluation. */
export interface EscapeNode {
  type: "Escape";
  char: string;
}

// ── Lock expression nodes ─────────────────────────────────────────────────

export interface LockOrNode   { type: "LockOr";        operands: ASTNode[]; }
export interface LockAndNode  { type: "LockAnd";       operands: ASTNode[]; }
export interface LockNotNode  { type: "LockNot";       operand:  ASTNode; }
export interface LockMeNode   { type: "LockMe"; }
export interface LockDbrefNode      { type: "LockDbref";      dbref:     string; }
export interface LockFlagCheckNode  { type: "LockFlagCheck";  flag:      string; }
export interface LockTypeCheckNode  { type: "LockTypeCheck";  typeName:  string; }
export interface LockAttrCheckNode  { type: "LockAttrCheck";  attribute: string; }
export interface LockPlayerNameNode { type: "LockPlayerName"; name:      string; }
