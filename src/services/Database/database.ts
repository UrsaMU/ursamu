import { IDBOBJ } from "../../@types/IDBObj.ts";
import { getConfig } from "../Config/mod.ts";
import { IChannel } from "../../@types/Channels.ts";
import { IMail } from "../../@types/IMail.ts";
import { IArticle, IBoard } from "../../@types/index.ts";
import { dpath } from "../../../deps.ts";
// @ts-ignore: Deno namespace is available at runtime

interface WithId {
  id: string;
}

type QueryCondition = {
  [key: string]: string | number | boolean | RegExp | QueryCondition | QueryCondition[];
};

type QueryOperator<T> = {
  $or?: QueryCondition[];
  $and?: QueryCondition[];
  $where?: (this: T) => boolean;
};

type Query<T> = QueryCondition | QueryOperator<T>;

export class DBO<T extends WithId> {
  private static kv: Deno.Kv | null = null;
  private prefix: string;

  constructor(path: string) {
    this.prefix = path.replace('.', '_');
  }

  private async getKv(): Promise<Deno.Kv> {
    if (!DBO.kv) {
      // Create the data directory if it doesn't exist
      try {
        await Deno.mkdir("./data", { recursive: true });
      } catch (error) {
        if (!(error instanceof Deno.errors.AlreadyExists)) {
          throw error;
        }
      }
      
      // Use a persistent path for the KV store
      const path = "./data/ursamu.db";
      console.log(`Opening KV database at: ${path}`);
      DBO.kv = await Deno.openKv(path);
    }
    return DBO.kv;
  }

  async clear() {
    const kv = await this.getKv();
    const entries = kv.list({ prefix: [this.prefix] });
    for await (const entry of entries) {
      await kv.delete(entry.key);
    }
  }

  private getKey(id: string): Deno.KvKey {
    return [this.prefix, id];
  }

  async create(data: T) {
    const kv = await this.getKv();
    const plainData = { ...data };
    await kv.set(this.getKey(data.id), plainData);
    return data;
  }

  async query(query?: Query<T>) {
    const kv = await this.getKv();
    const entries = kv.list({ prefix: [this.prefix] });
    const results: T[] = [];
    for await (const entry of entries) {
      const value = entry.value as T;
      if (this.matchesQuery(value, query)) {
        results.push(value);
      }
    }
    return results;
  }

  async queryOne(query?: Query<T>) {
    const results = await this.query(query);
    return results.length ? results[0] : false;
  }

  async all() {
    const kv = await this.getKv();
    const entries = kv.list({ prefix: [this.prefix] });
    const results: T[] = [];
    for await (const entry of entries) {
      results.push(entry.value as T);
    }
    return results;
  }

  async modify(query: Query<T>, operator: string, data: Partial<T>) {
    const items = await this.query(query);
    const kv = await this.getKv();
    for (const item of items) {
      const updated = { ...item };
      if (operator === "$set") {
        Object.assign(updated, data);
      } else if (operator === "$inc") {
        for (const [key, value] of Object.entries(data)) {
          const currentValue = ((updated as unknown) as Record<string, number>)[key] || 0;
          ((updated as unknown) as Record<string, number>)[key] = currentValue + (value as number);
        }
      }
      const plainData = { ...updated };
      await kv.set(this.getKey(item.id), plainData);
    }
    return await this.query(query);
  }

  async delete(query: Query<T>) {
    const items = await this.query(query);
    const kv = await this.getKv();
    for (const item of items) {
      await kv.delete(this.getKey(item.id));
    }
    return items;
  }

  private matchesQuery(value: T, query?: Query<T>): boolean {
    if (!query) return true;
    
    if ('$or' in query && Array.isArray(query.$or)) {
      return query.$or.some((cond: QueryCondition) => this.matchesQuery(value, cond));
    }
    
    if ('$and' in query && Array.isArray(query.$and)) {
      return query.$and.every((cond: QueryCondition) => this.matchesQuery(value, cond));
    }
    
    if ('$where' in query && typeof query.$where === 'function') {
      return query.$where.call(value);
    }
    
    for (const [key, condition] of Object.entries(query)) {
      if (condition instanceof RegExp) {
        if (!condition.test(value[key as keyof T] as string)) {
          return false;
        }
      } else if (typeof condition === "object") {
        if (!this.matchesQuery(value[key as keyof T] as T, condition as Query<T>)) {
          return false;
        }
      } else if (value[key as keyof T] !== condition) {
        return false;
      }
    }
    return true;
  }
}

export interface ICounters extends WithId {
  seq: number;
}

export const counters = new DBO<ICounters>(`${getConfig<string>("server.counters")}`);
export const bboard = new DBO<IBoard>(`${getConfig<string>("server.bboard")}`);
export const dbojs = new DBO<IDBOBJ>(`${getConfig<string>("server.db")}`);
export const chans = new DBO<IChannel>(`${getConfig<string>("server.chans")}`);
export const mail = new DBO<IMail>(`${getConfig<string>("server.mail")}`);
export const wiki = new DBO<IArticle>(`${getConfig<string>("server.wiki")}`);
