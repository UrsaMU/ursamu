# Town seed definitions

Each JSON file is a `TownDef` (see `src/world/types.ts`):

- `rooms` / `exits` / `vendors` / `npcs` — MUSH graph
- `map` — optional footprint for `@ursamu/map-plugin`

**Havenbrook** lives in `../starter-world.json`.
**Millhaven** / **Ashford** are sibling JSON towns. All
seed on `engine:ready` via `seedCampaign()` with road
legs from `../routes.json` (Whisperwood + Hill Road).

```ts
import town from "./my-town.json" with { type: "json" };
import { seedTown } from "../src/world/seed.ts";
await seedTown(town);
```

Place `map.origin` far from Havenbrook `(128,128)` so tiles
do not collide (Millhaven uses `(200, 80, 0)`).
