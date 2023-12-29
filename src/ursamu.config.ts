import { IConfig } from "./@types/IConfig.ts";

const config: IConfig = {
  server: {
    telnet: 4201,
    ws: 4202,
    http: 4203,
    db: "mongodb://root:root@mongo/",
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
    playerStart: 0,
  },
};

export default config;
