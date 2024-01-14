import { DBO } from "../index.ts";
import { IStat } from "./IStat.ts";

export interface IConfig {
  server?: {
    telnet?: number;
    ws?: number;
    http?: number;
    db?: string;
    dbModel?: {
      [key: string]: DBO<any>;
    };
    counters?: string;
    chans?: string;
    mail?: string;
    wiki?: string;
    bboard?: string;
    plugins?: string[];
    allStats?: IStat[];
  };
  game?: {
    name?: string;
    description?: string;
    version?: string;
    playerStart?: number;
    text: {
      connect: string;
    };
    [key: string]: any;
  };
}

export class Config {
  constructor(public config: IConfig) {
    this.config = config;
  }

  get server() {
    return this.config.server;
  }

  get game() {
    return this.config.game;
  }

  setConfig = (config: IConfig) => {
    this.config = config;
  };
}
