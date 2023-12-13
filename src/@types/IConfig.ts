import { directory } from "../main";
import { deepMerge } from "../utils/deepMerge";

export interface IConfig {
  engine?: {
    main: string;
  };
  server?: {
    telnet?: number;
    ws?: number;
    http?: number;
    db?: string;
    counters?: string;
    chans?: string;
    mail?: string;
    wiki?: string;
    bboard?: string;
  };
  game?: {
    name?: string;
    description?: string;
    version?: string;
    playerStart?: number;
    text?: {
      connect: string;
    };
  };
}

export class Config {
  constructor(public config: IConfig) {
    if (directory) {
      this.config = deepMerge(
        config,
        require(`${directory}/ursamu.config.json`) as IConfig
      );
    } else {
      this.config = config;
    }

    this.config = config;
  }

  get server() {
    return this.config.server;
  }

  get game() {
    return this.config.game;
  }

  get engine() {
    return this.config.engine;
  }

  setConfig = (config: IConfig) => {
    this.config = config;
  };
}
