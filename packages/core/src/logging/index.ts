import type { LogLevel, LogSink } from "./types.ts";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
};

let _minLevel: LogLevel = "info";
let _sink: LogSink = (level, event, data) => {
  console.log(JSON.stringify({ level, event, data, ts: Date.now() }));
};

export function setLogSink(sink: LogSink): void {
  _sink = sink;
}

export function setMinLevel(level: LogLevel): void {
  _minLevel = level;
}

export function log(level: LogLevel, event: string, data?: unknown): void {
  if (LEVELS[level] < LEVELS[_minLevel]) return;
  try {
    _sink(level, event, data);
  } catch (e: unknown) {
    console.error("[logging] sink threw:", e);
  }
}
