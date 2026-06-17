# @ursamu/core

Generic multiplayer text-server infrastructure. Provides WebSocket, Telnet,
and HTTP+SSE transports, a typed KV database (`DBO<T>`), an event bus
(`gameHooks`), an input dispatch pipeline, JWT sessions, a plugin loader,
rate limiting, broadcast rooms, a delayed-execution queue, config, logging,
and text asset registry. Zero game-world assumptions — no MUSH concepts, no
world model, no softcode. Layers like `@ursamu/mush` build on top of this.

## Install

```typescript
// Deno / JSR
import { createServer, addHandler, gameHooks, DBO } from "jsr:@ursamu/core";
```

## Quick start

```typescript
import {
  createServer,
  websocketTransport,
  telnetTransport,
  addHandler,
  send,
} from "jsr:@ursamu/core";

const server = await createServer({ port: 4201 });
server.addTransport(websocketTransport());
server.addTransport(telnetTransport({ port: 4202 }));

addHandler({
  name: "hello",
  pattern: /^hello\s*(.*)/i,
  exec: (ctx) => {
    ctx.send(`Hello, ${ctx.args[0] || "world"}!`);
  },
});

await server.listen();
```

## Key exports

| Export | Purpose |
|---|---|
| `createServer` | Build and configure the server |
| `websocketTransport` | WebSocket transport factory |
| `telnetTransport` | Telnet transport factory |
| `httpTransport` | HTTP + SSE transport factory |
| `registerRoute` | Add an HTTP route |
| `addHandler` | Register a pattern-matched input handler |
| `addMiddleware` | Add input middleware (runs before handlers) |
| `runPipeline` | Manually fire the dispatch pipeline |
| `gameHooks` | Typed EventEmitter for server lifecycle events |
| `DBO` | Generic typed KV collection — `new DBO<T>("namespace")` |
| `sessions` | Active session store |
| `createToken` / `verifyToken` | JWT helpers |
| `send` / `broadcastAll` / `notify` | Output helpers |
| `rooms` | Named broadcast rooms (join/leave/broadcast) |
| `queue` | Delayed execution queue |
| `getConfig` / `setConfig` | Config access |
| `registerPlugin` / `loadPlugins` | Plugin system |
| `log` | Structured logger |
| `registerText` / `getText` | Text asset registry (motd, banners) |

## What is NOT here

`@ursamu/core` has no knowledge of:

- `IDBObj`, players, rooms, exits, things
- MUSH flags or lock evaluation
- Softcode / TinyMUX evaluator
- `addCmd` or `IUrsamuSDK`
- MUSH color codes

For the full MUSH layer, see [`@ursamu/mush`](../mush/README.md).
