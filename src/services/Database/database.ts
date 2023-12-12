import { Datastore } from "../../../deps.ts";
import { IDBOBJ } from "../../@types/IDBObj.ts";
import config from "../../ursamu.config.ts";
import { IChannel } from "../../@types/Channels.ts";
import { IMail } from "../../@types/IMail.ts";
import { IArticle, IBoard } from "../../@types/index.ts";

export class DBO<T> {
  db: Datastore<T>;

  constructor(path: string) {
    this.db = Datastore.create(path);
  }

  async insert(data: T) {
    return await this.db.insert(data);
  }

  async find(query?: any) {
    return await this.db.find<T>(query);
  }

  async findAll() {
    return await this.db.find<T>({});
  }

  async findOne(query: any) {
    return await this.db.findOne<T>(query);
  }

  async update(query: any, data: any) {
    return await this.db.update<T>(query, data, {
      upsert: true,
      returnUpdatedDocs: true,
    });
  }

  async remove(query: any) {
    return await this.db.remove(query, { multi: true });
  }

  async count(query: any) {
    return await this.db.count(query);
  }
}

export interface ICounters {
  _id: string;
  seq: number;
}

export const counters = new DBO<ICounters>(`${config.server?.counters}`);
export const bboard = new DBO<IBoard>(`${config.server?.bboard}`);
export const dbojs = new DBO<IDBOBJ>(`${config.server?.db}`);
export const chans = new DBO<IChannel>(`${config.server?.chans}`);
export const mail = new DBO<IMail>(`${config.server?.mail}`);
export const wiki = new DBO<IArticle>(`${config.server?.wiki}`);
