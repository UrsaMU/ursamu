export interface IConfig {
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
    text: {
      connect: string;
    };
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
