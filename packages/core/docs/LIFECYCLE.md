# Plugins and middleware lifecycle (1.0)

## Plugins

```typescript
registerPlugin(plugin);   // stage
await loadPlugins();      // topo-sort, check deps, init, register
await unloadPlugin(name); // remove() then drop from registry
```

### Rules

1. **`init()`** may return `true`, `false`, or `void`. `false` logs a
   warning but does not unload automatically.
2. **`remove()`** must undo side effects started in `init`
   (`gameHooks.off` with the **same function reference**, routes, etc.).
3. **Dependencies** use semver ranges against already-loaded plugins.
4. **`loadPlugins()`** runs once per process by default. Tests may use
   `forceLoadPlugins` after clearing the registry.
5. Unload does **not** reverse `addMiddleware` or `addHandler` unless
   the plugin removes them itself.

### Checklist for plugin authors

- Named handlers for every `gameHooks.on`  
- `remove()` mirrors `init()`  
- No relying on process exit for cleanup in long-running hosts  

## Middleware

```typescript
addMiddleware(fn);
removeMiddleware(fn);  // same reference
clearMiddleware();     // tests / full reset only
```

### Rules

1. Middleware runs in **registration order** before command handlers.
2. Call `await next()` to continue the chain (unless you fully handle input).
3. **`removeMiddleware` requires the same function reference** used in
   `addMiddleware`. Anonymous lambdas cannot be removed later.
4. Plugins that add middleware **must** call `removeMiddleware` in
   `remove()` if they support hot-unload. Otherwise document
   "restart required" (acceptable for 1.0).

## Handlers

```typescript
addHandler({ name, pattern, exec });
removeHandler(name);
```

Stable. Prefer unique `name` strings per package.
