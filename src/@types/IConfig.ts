export interface IConfig {
  server: {
    telnet: number;
    ws: number;
    http: number;
    db: string;
  };
  game: {
    name: string;
    description: string;
    version: string;
    playerStart: number;
  };
}
