export interface ISession {
  socketId:    string;
  sessionId:   string;
  connectedAt: number;
  lastInputAt: number;
  meta:        Record<string, unknown>;
}
