# Host ESM module example

Build a single-file Vue component the staff console can
`import()` via `registerStaffPage({ module })`.

```bash
cd packages/web/examples/host-module
npm install
npm run build
# → packages/web/examples/dist/host-entry.js
```

Copy into a plugin:

```bash
cp ../dist/host-entry.js /path/to/plugin/admin/host-entry.js
```

Register:

```ts
web.registerStaffPage({
  id: "mytool",
  label: "My Tool",
  module: "/admin/mytool/host-entry.js",
  embed: "/admin/mytool/", // fallback
});
web.registerStaffStatic({
  id: "mytool",
  root: new URL("./admin/", import.meta.url),
});
```

Vue is **bundled** into the output so the host does not need an
import map. Production plugins may externalize `vue` if they ship
an import map with the host.
