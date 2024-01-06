import { IConfig } from "./@types/IConfig.ts";

const config: IConfig = {
  server: {
    telnet: 4201,
    ws: 4202,
    http: 4203,
    db: "mongodb://root:root@mongo/",
  },
  game: {
    name: "Ursamu",
    description: "A Modern MUSH-Like engine written in Typescript.",
    version: "0.0.1",
    playerStart: 0,
  },
};

export default config;
