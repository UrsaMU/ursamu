import { deepMerge } from "../utils/deepMerge";

export interface IPluginConfig {
  enabled: boolean;
  package?: string; // For npm package plugins
  path?: string;    // For local plugins
}

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
  plugins?: {
    [key: string]: IPluginConfig;
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

  get engine() {
    return this.config.engine;
  }

  get plugins() {
    return this.config.plugins || {};
  }

  setConfig = (config: IConfig) => {
    this.config = config;
  };
}
