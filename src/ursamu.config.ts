import path from "path";
import { IConfig } from "./@types/IConfig";
import { deepMerge } from "./utils/deepMerge";

class Config {
  private _config: IConfig;

  constructor(cfg: IConfig) {
    this._config = cfg;
  }

  setConfig(config: Partial<IConfig>) {
    this._config = deepMerge(this._config, config);
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
    db: path.join(process.cwd(), "./data/ursamu.db"),
    counters: path.join(process.cwd(), "./data/counters.db"),
    chans: path.join(process.cwd(), "./data/chans.db"),
    mail: path.join(process.cwd(), "./data/mail.db"),
    bboard: path.join(process.cwd(), "./data/bboard.db"),
  },
  game: {
    name: "Ursamu",
    description: "A Modern MUSH-Like engine written in Typescript.",
    version: "0.0.1",
    playerStart: 1,
  },
  plugins: {
    // Example of a local plugin configuration
    wod: {
      enabled: false,
      path: path.join(process.cwd(), "./src/plugins/wod/index.ts"),
    },
    utopia: {
      enabled: true,
      path: path.join(process.cwd(), "./src/plugins/utopia/index.ts"),
    },
    // Example of how to configure an npm package plugin
    // "some-mush-plugin": {
    //   enabled: true,
    //   package: "@username/some-mush-plugin"
    // }
  },
});

export default cfg;
