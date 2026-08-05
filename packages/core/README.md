# @ursamu/core

**Version 1.0.0** (stable).

Generic multiplayer text-server infrastructure: WebSocket, Telnet,
and HTTP+SSE transports, typed KV collections (`DBO<T>`), `gameHooks`,
input dispatch, JWT sessions, plugins, rate limiting, broadcast rooms,
a delayed queue, config, logging, and text assets.

Zero game-world assumptions. Layers like `@ursamu/mush` add MUSH concepts.

See `CHANGELOG.md`, `docs/DBO.md`, and `docs/LIFECYCLE.md`.

## Install

```typescript
import { createServer, addHandler, gameHooks, DBO } from "jsr:@ursamu/core@^1.0.0";
```

## Quick start

```typescript
import {
  createServer,
  websocketTransport,
  telnetTransport,
  addHandler,
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

## Stable API (1.0)

These exports are covered by semver. Breaking changes require 2.0.0.

| Area | Exports |
|------|---------|
| Server | `createServer`, `ICoreServer`, `ITransport` |
| Transports | `websocketTransport`, `telnetTransport`, `httpTransport`, `registerRoute`, `registerFallback` |
| Dispatch | `addHandler`, `removeHandler`, `addMiddleware`, `removeMiddleware`, `clearMiddleware`, `getMiddleware`, `runPipeline`, `ICoreHandler`, `ICoreContext`, `IMiddlewareFn` |
| Plugins | `registerPlugin`, `loadPlugins`, `unloadPlugin`, `listPlugins`, `getPlugin`, `IPlugin`, `IPluginDep` |
| Events | `gameHooks`, `CoreHookMap` (core keys + open index for plugins) |
| Database | `DBO`, `Query`, path helpers (`resolveTypegraphDbPath`, …) |
| Session | `sessions`, `createToken`, `verifyToken`, `ISession` |
| Output | `send`, `broadcastAll`, `notify`, `registerSender`, `trackSocket`, `untrackSocket`, `trackedSockets`, `setFormatter`, `rooms` |
| Queue | `queue`, `IQueueEntry`, `registerExecutor` (via queue module) |
| Config | `getConfig`, `setConfig`, `getAllConfig`, `initConfig` |
| Logging | `log`, `LogLevel` |
| Assets | `registerText`, `getText` |

### Internal / low-level (may change in minor)

Prefer stable wrappers above. These stay exported for advanced hosts:

- Raw telnet constants and byte helpers (`IAC`, `parseNawsBytes`,
  `stripIacBytes`, `accumulateNaws`, …)
- `handleWebSocketConnection`, `sendPayload`, `closeSocket`,
  `listSocketIds`, `isRateLimitedForAuth`, `clampTermWidth`
- `formatRemoteAddr`, `forceLoadPlugins`, `initializePlugins`
- `DBO.setAdapterFactory` (tests and custom backends)

## Dependency policy

Pinned majors in `deno.json` (upgrade deliberately):

| Package | Role |
|---------|------|
| `npm:@nicia-ai/typegraph@^0.31.0` | Default DBO backend |
| `npm:@electric-sql/pglite@^0.5.2` | Embedded Postgres for TypeGraph |
| `jsr:@zaubrik/djwt@^3.0.2` | JWT |
| `npm:zod@4.4.3` | Validation where used |

Patch/minor upgrades of these deps are allowed in core minors when
tests pass. Major bumps of typegraph/pglite/djwt warrant a core minor
or major depending on API fallout.

## What is NOT here

- `IDBObj`, players, rooms-as-world, exits, things  
- MUSH flags or lock evaluation  
- Softcode / TinyMUX evaluator  
- `addCmd` or `IUrsamuSDK`  
- MUSH color codes  

See [`@ursamu/mush`](https://jsr.io/@ursamu/mush).

## Lifecycle

Plugins and middleware teardown: **`docs/LIFECYCLE.md`**.  
DBO operators and adapters: **`docs/DBO.md`**.

## Develop

```bash
deno task test
deno task check
```
