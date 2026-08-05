# DBO contract

`DBO<T>` is the stable collection API for `@ursamu/core`.
`T` must include `id: string`.

## Adapters

| Adapter | When | Notes |
|---------|------|--------|
| **TypeGraph + PGlite** | Default | `TypeGraphAdapter`; on-disk dir from path helpers |
| **Deno KV** | Optional | Set via `DBO.setAdapterFactory` |

Path resolution (TypeGraph default directory):

1. `server.db` config  
2. `URSAMU_TYPEGRAPH_DB` env  
3. `data/typegraph.db`  

Helpers: `resolveTypegraphDbPath`, `resolveDenokvDbPath`,
`absolutizeDbPath`, `ensureTypegraphDataDir`.

Tests may use in-memory / sanitized adapters. PGlite can leak
timers in Deno's sanitizer; core tests disable those sanitizers
when the runner is a `*.test.ts` module.

## Operators (modify)

| Op | Meaning |
|----|---------|
| `$set` | Set fields (supports dotted paths, e.g. `data.foo`) |
| `$inc` | Numeric increment |
| `$unset` | Remove fields |

Other operator strings are adapter-defined; stick to the three above
for portable code.

## Query

- `query(q?)` / `find(q?)` - array of matches  
- `queryOne(q?)` / `findOne(q?)` - first match or `undefined`  
- `all()` - entire namespace  

Supported condition shapes (TypeGraph path): equality on fields,
nested objects, and adapter-specific operators. Prefer simple
`{ id }` and equality filters in application code.

## Lifecycle

```typescript
const col = new DBO<MyRow>("myplugin.rows");
await col.create({ id: "1", ... });
await col.modify({ id: "1" }, "$set", { "data.n": 1 });
await col.delete({ id: "1" });
```

Namespaces should be prefixed with the owner (`pluginName.` or
`server.`) to avoid collisions.

## Atomic helpers

- `atomicModify(id, transform, retries?)`  
- `atomicIncrement(id)`  

Use for counters and race-sensitive updates.

## Stability (1.0)

The method names and `$set` / `$inc` / `$unset` semantics above are
**stable**. Adapter internals and exact SQL/KV encoding are not part
of the public contract.
