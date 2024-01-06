export interface IConfig {
  server?: {
    telnet?: number;
    ws?: number;
    http?: number;
    db?: string;
    plugins?: string[];
  };
  game?: {
    name?: string;
    description?: string;
    version?: string;
    playerStart?: number;
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
