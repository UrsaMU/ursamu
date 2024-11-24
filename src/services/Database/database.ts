import Datastore from "nedb-promises";
import { IDBOBJ } from "../../@types/IDBObj";
import { IChannel } from "../../@types/Channels";
import { IMail } from "../../@types/IMail";
import { IArticle, IBoard } from "../../@types";
import cfg from "../../ursamu.config";

export class DBO<T> {
  db: Datastore<T>;

  constructor(path: string) {
    this.db = Datastore.create({ filename: path, autoload: true });
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

    // if it's an Obj we need to .save()
    // else update the db
    if (data.save) {
      await data.save();
      return data;
    }

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

export const counters = new DBO<ICounters>(`${cfg.config.server?.counters}`);
export const bboard = new DBO<IBoard>(`${cfg.config.server?.bboard}`);
export const dbojs = new DBO<IDBOBJ>(`${cfg.config.server?.db}`);
export const chans = new DBO<IChannel>(`${cfg.config.server?.chans}`);
export const mail = new DBO<IMail>(`${cfg.config.server?.mail}`);
export const wiki = new DBO<IArticle>(`${cfg.config.server?.wiki}`);
