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
  };
  game?: {
    name?: string;
    description?: string;
    version?: string;
    playerStart?: number;
  };
}
