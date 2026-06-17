/** A registered transport driver (WebSocket, Telnet, SSE, etc.). */
export interface ITransport {
  readonly name: string;
  /** When true, a start() failure logs a warning instead of crashing. */
  readonly optional?: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** The running server instance returned by createServer(). */
export interface ICoreServer {
  addTransport(t: ITransport): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
