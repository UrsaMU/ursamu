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

  export class Noise {
    constructor(seed: number);
    setSeed(seed: number): void;
    getSeed(): number;
    perlin1(x: number): number;
    perlin2(x: number, y: number): number;
    perlin3(x: number, y: number, z: number): number;
    simplex2(x: number, y: number): number;
    worley2(x: number, y: number): number;
    fbm2(
      x: number,
      y: number,
      octaves: number,
      persistence: number,
    ): number;
    ridged2(
      x: number,
      y: number,
      octaves: number,
      persistence: number,
    ): number;
    grid(
      width: number,
      height: number,
      scale: number,
      fn?: "perlin2" | "simplex2" | "worley2",
    ): number[];
  }

  export function createNoise(seed: number): Noise;
  export function resetNoiseState(): void;
  export function seedNoise(seed: number): void;
  export function buildPerm(seed: number): Uint8Array;
  export function perlin1(x: number): number;
  export function perlin2(x: number, y: number): number;
  export function perlin3(x: number, y: number, z: number): number;
  export function simplex2(xin: number, yin: number): number;
  export function worley2(x: number, y: number): number;
  export function fbm2(
    x: number,
    y: number,
    octaves: number,
    persistence: number,
  ): number;
  export function ridged2(
    x: number,
    y: number,
    octaves: number,
    persistence: number,
  ): number;
  export function noiseGrid(
    seed: number,
    width: number,
    height: number,
    scale: number,
    fn?: "perlin2" | "simplex2" | "worley2",
  ): number[];

  export type Vec3 = readonly [number, number, number];
  export function vreflect(v: Vec3, n: Vec3): [number, number, number];
  export function pointInAabb(p: Vec3, min: Vec3, max: Vec3): boolean;
  export function rayAabb(
    origin: Vec3,
    dir: Vec3,
    min: Vec3,
    max: Vec3,
  ): number;

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
