export * as dpath from "https://deno.land/std@0.208.0/path/mod.ts";
export * as dfs from "https://deno.land/std@0.208.0/fs/mod.ts";

export { MongoClient } from "npm:mongodb@6.3.0"
export { Tags } from "npm:@digibear/tags@1.0.0"
export { Parser } from "npm:@ursamu/parser@1.2.4"
export { config } from "npm:dotenv@16.3.1"
export * as jwt from "npm:jsonwebtoken@9.0.1"
export { Socket, Server } from "npm:socket.io@4.7.1"
export { io } from "npm:socket.io-client@4.7.1"
export { VM } from "npm:vm2@3.9.19"

// @deno-types="npm:@types/express@4.17.21"
export { Router } from "npm:express@4.18.2"
export { default as express } from "npm:express@4.18.2"
export interface Request {}
export interface Response {}
export type { RequestHandler } from "npm:express@4.18.2"

import bcrypt from "npm:bcryptjs@2.4.3"
export const compare = bcrypt.compare
export const hash = bcrypt.hash

import lodash from "npm:lodash@4.17.21"
export const set = lodash.set
export const get = lodash.get
export const isnumber = lodash.isnumber
export const repeat = lodash.repeat
