import { assert, assertEquals } from "@std/assert";
import {
  loadAmmoIntoGun,
  resolveAmmoRow,
} from "../engine/ammo-load.ts";
import {
  createItem,
  itemData,
} from "../engine/items.ts";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockU() {
  const objs = new Map<string, IDBObj>();
  let n = 1;
  const u = {
    me: { id: "p1" },
    db: {
      create: async (t: Partial<IDBObj>) => {
        const id = String(n++);
        const o = {
          id,
          name: t.name ?? "x",
          flags: t.flags ?? new Set(["thing"]),
          location: t.location ?? "p1",
          state: t.state ?? {},
          contents: [],
        } as IDBObj;
        objs.set(id, o);
        return o;
      },
      modify: async (
        id: string,
        _op: string,
        data: Record<string, unknown>,
      ) => {
        const o = objs.get(id);
        if (!o) return;
        const st = { ...(o.state as object) } as Record<
          string,
          unknown
        >;
        for (const [k, v] of Object.entries(data)) {
          if (k === "data.sprawl_item" || k === "state.sprawl_item") {
            st.sprawl_item = v;
          } else if (k.startsWith("data.")) {
            st[k.slice(5)] = v;
          } else {
            st[k] = v;
          }
        }
        o.state = st;
      },
      search: async (q: { location?: string }) => {
        return [...objs.values()].filter((o) =>
          !q.location || o.location === q.location
        );
      },
      destroy: async (id: string) => {
        objs.delete(id);
      },
    },
  } as unknown as IUrsamuSDK;
  return { u, objs };
}

Deno.test("resolveAmmoRow finds hellfires", OPTS, () => {
  const r = resolveAmmoRow("hellfires");
  assert(r);
  assertEquals(r!.slug, "hellfires");
  const r2 = resolveAmmoRow("Hellfire");
  assert(r2);
});

Deno.test("loadAmmoIntoGun chambers specialty", OPTS, async () => {
  const { u } = mockU();
  await createItem(u, "p1", {
    slug: "orchard-technologies-machine-link",
    name: "Machine Link",
    kind: "firearm",
    load: 1,
    bonus: 1,
  });
  const r = await loadAmmoIntoGun(
    u,
    "p1",
    "link=hellfires",
  );
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.ammoSlug, "hellfires");
  const d = itemData(r.gun);
  assertEquals(d?.ammoSlug, "hellfires");
});

Deno.test("loadAmmoIntoGun space form", OPTS, async () => {
  const { u } = mockU();
  await createItem(u, "p1", {
    slug: "pkd-45",
    name: "PKD-45",
    kind: "firearm",
    load: 1,
  });
  const r = await loadAmmoIntoGun(u, "p1", "pkd shredders");
  assert(r.ok);
  if (r.ok) assertEquals(r.ammoSlug, "shredders");
});
