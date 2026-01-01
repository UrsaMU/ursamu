// @ts-nocheck: some dependencies do not have types or cause issues with Deno's type checker
export * as dpath from "jsr:@std/path@0.224.0";
export * as dfs from "jsr:@std/fs@0.224.0";
export type Kv = Deno.Kv;

export { Tags } from "@digibear/tags";
export { Parser } from "@ursamu/parser";
export { load } from "dotenv";
export * as djwt from "djwt";
export { getQuickJS } from "quickjs-emscripten";
export type { QuickJSWASMModule } from "quickjs-emscripten";

import * as bcrypt from "bcrypt";
export const compare = bcrypt.compare;
export const hash = bcrypt.hash;
export const genSalt = bcrypt.genSalt;

import lodash from "lodash";
export const set = lodash.set;
export const get = lodash.get;
export const isnumber = lodash.isnumber;
export const repeat = lodash.repeat;
