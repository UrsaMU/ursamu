import { assertEquals } from "@std/assert";
import { DBO } from "../src/database/dbo.ts";
import type { IDatabase, Query, DottedSetData } from "../src/database/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

interface MockItem {
  id: string;
  name: string;
}

class MockAdapter implements IDatabase<MockItem> {
  public store = new Map<string, MockItem>();
  public counter = 0;

  async create(data: MockItem): Promise<MockItem> {
    await Promise.resolve();
    this.store.set(data.id, data);
    return data;
  }

  async query(_query?: Query<MockItem>): Promise<MockItem[]> {
    await Promise.resolve();
    return Array.from(this.store.values());
  }

  async queryOne(_query?: Query<MockItem>): Promise<MockItem | undefined> {
    await Promise.resolve();
    return Array.from(this.store.values())[0];
  }

  async all(): Promise<MockItem[]> {
    await Promise.resolve();
    return Array.from(this.store.values());
  }

  async modify(_query: Query<MockItem>, _operator: string, data: DottedSetData<MockItem>): Promise<MockItem[]> {
    await Promise.resolve();
    const item = Array.from(this.store.values())[0];
    if (item) {
      const updated = { ...item, ...data };
      this.store.set(item.id, updated);
    }
    return Array.from(this.store.values());
  }

  async delete(_query: Query<MockItem>): Promise<MockItem[]> {
    await Promise.resolve();
    const deleted = Array.from(this.store.values());
    this.store.clear();
    return deleted;
  }

  async clear(): Promise<void> {
    await Promise.resolve();
    this.store.clear();
  }

  async atomicModify(id: string, transform: (current: MockItem) => MockItem): Promise<MockItem> {
    await Promise.resolve();
    const current = this.store.get(id);
    if (!current) throw new Error("Not found");
    const updated = transform(current);
    this.store.set(id, updated);
    return updated;
  }

  async atomicIncrement(_id: string): Promise<number> {
    await Promise.resolve();
    this.counter++;
    return this.counter;
  }
}

Deno.test("DBO - Custom adapter registration and delegation", OPTS, async () => {
  // Save original factory
  const originalFactory = DBO.getAdapterFactory();

  const mockInstances = new Map<string, MockAdapter>();
  
  // Set custom factory
  DBO.setAdapterFactory(<T extends { id: string }>(namespace: string) => {
    const adapter = new MockAdapter();
    mockInstances.set(namespace, adapter);
    return adapter as unknown as IDatabase<T>;
  });

  const db = new DBO<MockItem>("test.mock-namespace");
  
  // Verify instantiation registered the mock adapter
  const adapter = mockInstances.get("test.mock-namespace");
  assertEquals(!!adapter, true, "Mock adapter should be registered for namespace");

  // Verify delegation works
  await db.create({ id: "1", name: "Alice" });
  assertEquals(adapter?.store.get("1")?.name, "Alice");

  const results = await db.query();
  assertEquals(results.length, 1);
  assertEquals(results[0].name, "Alice");

  await db.modify({ id: "1" }, "$set", { name: "Bob" });
  assertEquals(adapter?.store.get("1")?.name, "Bob");

  const val = await db.atomicIncrement("counter");
  assertEquals(val, 1);

  await db.delete({ id: "1" });
  assertEquals(adapter?.store.size, 0);

  // Restore factory
  DBO.setAdapterFactory(originalFactory);
});
