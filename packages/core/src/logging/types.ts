export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogSink = (level: LogLevel, event: string, data: unknown) => void;
export interface ILogEntry {
  level: LogLevel;
  event: string;
  data:  unknown;
  ts:    number;
}
