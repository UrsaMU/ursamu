// deno-lint-ignore-file no-explicit-any
/**
 * TSServer declaration shim for jsr:@ursamu/mushcode
 *
 * The Deno runtime resolves `@ursamu/mushcode` via deno.json import maps.
 * This declaration file only exists so TSServer can type-check imports of
 * `@ursamu/mushcode/eval` without needing the actual JSR source in the cache.
 */

declare module "@ursamu/mushcode/eval" {
  export interface IterFrame {
    item: string;
    pos: number;
  }

  export interface EvalContext {
    actor: any;
    executor: any;
    caller: any;
    args: string[];
    registers: Map<string, string>;
    iterStack: IterFrame[];
    depth: number;
    deadline: number;
    db: any;
    output: any;
  }

  export interface FunctionImpl {
    minArgs?: number;
    maxArgs?: number;
    eval?: "lazy" | "strict" | string;
    exec(args: (EvalThunk[] | string[]), context: EvalContext): Promise<string> | string;
  }

  export interface IEvalEngine {
    register(name: string, impl: FunctionImpl): void;
    registerFunction(name: string, impl: FunctionImpl): void;
    registerSub(name: string | ((code: string) => boolean), fn: (code: string, context: EvalContext) => string | Promise<string>): void;
    registerCommandFallback(fn: (name: string, switches: string[], object: string, value: string, context: EvalContext) => any): void;
    registerCommand(name: string, impl: any): void;
    evaluate(expr: string, context: EvalContext): Promise<string>;
    evalString(expr: string, context: EvalContext): Promise<string>;
  }

  export class EvalEngine implements IEvalEngine {
    constructor(accessor: ObjectAccessor);
    register(name: string, impl: FunctionImpl): void;
    registerFunction(name: string, impl: FunctionImpl): void;
    registerSub(name: string | ((code: string) => boolean), fn: (code: string, context: EvalContext) => string | Promise<string>): void;
    registerCommandFallback(fn: (name: string, switches: string[], object: string, value: string, context: EvalContext) => any): void;
    registerCommand(name: string, impl: any): void;
    evaluate(expr: string, context: EvalContext): Promise<string>;
    evalString(expr: string, context: EvalContext): Promise<string>;
  }

  export function registerStdlib(engine: EvalEngine): void;

  export interface ObjectAccessor {
    getAttr(id: string, attr: string): Promise<string | null>;
    resolveTarget(from: string, expr: string): Promise<string | null>;
    getName(id: string): Promise<string>;
    hasFlag(id: string, flag: string): Promise<boolean>;
    getMoniker(id: string): Promise<string | null>;
    [key: string]: any;
  }

  export type EvalThunk = () => Promise<string>;
}
