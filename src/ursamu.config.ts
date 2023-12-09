import { IConfig } from "./@types/IConfig";

class Config {
  private _config: IConfig;

  constructor(config: IConfig) {
    this._config = config;
  }

  setConfig(config: Partial<IConfig>) {
    this._config = { ...this._config, ...config };
  }

  get config() {
    return this._config;
  }
}

const cfg = new Config({
  server: {
    telnet: 4201,
    ws: 4202,
    http: 4203,
    db: "data/ursamu.db",
    counters: "data/counters.db",
    chans: "data/chans.db",
    mail: "data/mail.db",
    bboard: "data/bboard.db",
  },
  game: {
    name: "Ursamu",
    description: "A Modern MUSH-Like engine written in Typescript.",
    version: "0.0.1",
    text: {
      connect: "../text/default_connect.txt",
    },
    playerStart: 1,
  },
});

export default cfg;
