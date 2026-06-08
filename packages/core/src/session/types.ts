export interface ISession {
  socketId:    string;
  sessionId:   string;
  actorId?:    string;
  connectedAt: number;
  lastInputAt: number;
  meta:        Record<string, unknown>;
}
