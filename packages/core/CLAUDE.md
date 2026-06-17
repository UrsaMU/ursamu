# @ursamu/core — Claude Code Instructions

## What this package IS and IS NOT

**IS**: WebSocket server, Telnet server, HTTP+SSE server, generic `DBO<T>` database, `gameHooks` event bus, `IPlugin` system, JWT+sessions, rate limiting, input dispatch (`addHandler`), input middleware, output transport abstraction, named socket rooms, queue (delayed execution), config, structured logging, text asset registry, graceful shutdown/hot-reload.

**IS NOT and NEVER WILL BE**: `IDBObj`, MUSH flags, MUSH locks, softcode/sandbox, `addCmd`, `IUrsamuSDK`, rooms/exits/players/things as concepts, MUSH color codes. If a concept belongs to a text-adventure world model, it belongs in `@ursamu/mush`, not here.

## Hard boundary rule

`packages/core/` must **never** import from `packages/mush/` or reference `@ursamu/mush`. CI enforces this with `tools/check-boundaries.ts`. A violation breaks the entire architecture — treat it as a build failure.

## Key types (canonical; source of truth once implemented)

```typescript
interface ICoreHandler {
  name:    string;
  pattern: RegExp | string;
  exec:    (ctx: ICoreContext) => void | Promise<void>;
}

interface ICoreContext {
  socketId:  string;
  sessionId: string | null;   // null = unauthenticated
  input:     string;
  args:      string[];        // regex capture groups
  send:      (msg: string) => void;
}

interface IMiddlewareFn {
  (ctx: ICoreContext, next: () => Promise<void>): Promise<void>;
}

interface IPlugin {
  name:          string;
  version:       string;
  description?:  string;
  dependencies?: IPluginDep[];
  init:          () => boolean | Promise<boolean>;
  remove:        () => void | Promise<void>;
}

interface IPluginDep { name: string; version: string; }

interface ISession {
  socketId:    string;
  sessionId:   string;
  connectedAt: number;
  lastInputAt: number;
  meta:        Record<string, unknown>; // world layers hang actor ID here
}
```

## Directory map

```
packages/core/
├── mod.ts                     public API — only import from here
├── deno.json                  @ursamu/core package config
├── src/
│   ├── server/                WebSocket, Telnet, HTTP, SSE transports
│   ├── database/              DBO<T> generic typed KV collections
│   ├── plugins/               IPlugin loader, dep graph, semver checks
│   ├── events/                gameHooks event bus, CoreHookMap
│   ├── session/               JWT, active session store
│   ├── queue/                 delayed execution
│   ├── broadcast/             send(), rooms.join/leave/broadcast
│   ├── config/                getConfig/setConfig
│   ├── dispatch/              addHandler, addMiddleware, pipeline
│   ├── logging/               log(level, event, data)
│   └── assets/                registerText/getText (motd, banners, etc.)
└── tests/
```

Every public export goes through `mod.ts`. Never import from `src/` paths directly — consumers and internal cross-module imports both use the public surface.

## Transport abstraction

Each transport (WebSocket, Telnet, SSE) implements `ITransport`. Core fires the same output pipeline regardless of transport. Adding a new transport = registering an `ITransport` — zero core changes required.

## addHandler vs addCmd

`addHandler` is core — pattern match on raw input, receive `ICoreContext`. `addCmd` (in `@ursamu/mush`) is a MUSH-flavored wrapper that adds lock evaluation and `IUrsamuSDK` construction on top of `addHandler`. Core has no concept of locks, flags, or the SDK object.

## Pre-commit checklist

```bash
deno check mod.ts --unstable-kv                          # type check
deno lint                                                 # lint
deno test tests/ --allow-all --unstable-kv --no-check    # unit tests
deno run -A ../../tools/check-boundaries.ts              # boundary check
```

All four steps map to CI. A commit is not ready if any step fails.

## Code style (non-negotiable)

- No file > 200 lines — split. No function > 50 lines — decompose.
- No bare `catch` — always `catch (e: unknown)`.
- Early return over nested conditions. Max 3 levels of nesting.
- Types in `types.ts` per module, implementations separate.
- Named exports only — no default exports.
- No comments unless the WHY is non-obvious.
