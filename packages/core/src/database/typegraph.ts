import type { IDatabase, Query, DottedSetData } from "./types.ts";
import { z } from "zod";
import { defineNode, defineGraph, createStore } from "@nicia-ai/typegraph";
import { createLocalPgliteBackend } from "@nicia-ai/typegraph/postgres/pglite";
import { matchesQuery } from "./operators.ts";
import {
  ensureTypegraphDataDir,
  resolveTypegraphDbPath,
} from "./path.ts";

interface WithId {
  id: string;
}

// typegraph peers on zod@4. Cast avoids TS2740 when a monorepo
// workspace still resolves a second zod major for type-only imports.
const documentSchema = z.object({
  namespace: z.string(),
  originalId: z.string(),
  content: z.string(),
});
const DocumentNode = defineNode("Document", {
  // deno-lint-ignore no-explicit-any
  schema: documentSchema as any,
});

const DocumentGraph = defineGraph({
  id: "document_graph",
  nodes: {
    Document: { type: DocumentNode },
  },
  edges: {},
});

export class TypeGraphAdapter<T extends WithId> implements IDatabase<T> {
  // deno-lint-ignore no-explicit-any
  private static backend: any = null;
  // deno-lint-ignore no-explicit-any
  private static client: any = null;
  // deno-lint-ignore no-explicit-any
  private static store: any = null;
  // deno-lint-ignore no-explicit-any
  private static initPromise: Promise<any> | null = null;
  private readonly namespace: string;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  // deno-lint-ignore no-explicit-any
  private static async getStore(): Promise<any> {
    if (TypeGraphAdapter.store) return TypeGraphAdapter.store;
    if (TypeGraphAdapter.initPromise) {
      return await TypeGraphAdapter.initPromise;
    }

    TypeGraphAdapter.initPromise = (async () => {
      // Config first (server.db), then env, then default.
      // Callers must run initConfig() before the first DB op.
      const dbDir = resolveTypegraphDbPath();
      console.log(
        `[TypeGraphAdapter] Initializing database at: ${dbDir}`,
      );
      await ensureTypegraphDataDir(dbDir);

      const { backend, client } = await createLocalPgliteBackend({
        dataDir: dbDir,
        vector: false,
      });
      const store = await createStore(DocumentGraph, backend);

      TypeGraphAdapter.backend = backend;
      TypeGraphAdapter.client = client;
      TypeGraphAdapter.store = store;
      return store;
    })();

    return TypeGraphAdapter.initPromise;
  }

  private docId(id: string): string {
    return `${this.namespace}:${id}`;
  }

  async create(data: T): Promise<T> {
    const store = await TypeGraphAdapter.getStore();
    await store.nodes.Document.upsertById(this.docId(data.id), {
      namespace: this.namespace,
      originalId: data.id,
      content: JSON.stringify(data),
    });
    return data;
  }

  async query(query?: Query<T>): Promise<T[]> {
    const store = await TypeGraphAdapter.getStore();
    const docs = await store.nodes.Document.find({
      // deno-lint-ignore no-explicit-any
      where: (d: any) => d.namespace.eq(this.namespace),
      limit: 10000,
    });
    const results: T[] = [];
    for (const doc of docs) {
      const val = JSON.parse(doc.content) as T;
      if (matchesQuery(val, query)) {
        results.push(val);
      }
    }
    return results;
  }

  async queryOne(query?: Query<T>): Promise<T | undefined> {
    const results = await this.query(query);
    return results[0];
  }

  all(): Promise<T[]> {
    return this.query();
  }

  async modify(query: Query<T>, operator: string, data: DottedSetData<T>): Promise<T[]> {
    const store = await TypeGraphAdapter.getStore();
    const { applyInc, applyPush, applySet, applyUnset } = await import("./operators.ts");

    // deno-lint-ignore no-explicit-any
    return await store.transaction(async (tx: any) => {
      const docs = await tx.nodes.Document.find({
        // deno-lint-ignore no-explicit-any
        where: (d: any) => d.namespace.eq(this.namespace),
        limit: 10000,
      });

      const items: T[] = [];
      for (const doc of docs) {
        const val = JSON.parse(doc.content) as T;
        if (matchesQuery(val, query)) {
          items.push(val);
        }
      }

      for (const item of items) {
        let updated: T;
        if (operator === "$push") {
          updated = applyPush(item, data);
        } else if (operator === "$set") {
          updated = applySet(item, data);
        } else if (operator === "$unset") {
          updated = applyUnset(item, data);
        } else if (operator === "$inc") {
          updated = applyInc(item, data);
        } else {
          updated = item;
        }

        await tx.nodes.Document.upsertById(this.docId(item.id), {
          namespace: this.namespace,
          originalId: item.id,
          content: JSON.stringify(updated),
        });
      }

      const finalDocs = await tx.nodes.Document.find({
        // deno-lint-ignore no-explicit-any
        where: (d: any) => d.namespace.eq(this.namespace),
        limit: 10000,
      });

      const results: T[] = [];
      for (const doc of finalDocs) {
        const val = JSON.parse(doc.content) as T;
        if (matchesQuery(val, query)) {
          results.push(val);
        }
      }
      return results;
    });
  }

  async delete(query: Query<T>): Promise<T[]> {
    const items = await this.query(query);
    await TypeGraphAdapter.getStore();
    const client = TypeGraphAdapter.client;
    for (const item of items) {
      await client.query("DELETE FROM typegraph_nodes WHERE id = $1;", [this.docId(item.id)]);
    }
    return items;
  }

  async clear(): Promise<void> {
    await TypeGraphAdapter.getStore();
    const client = TypeGraphAdapter.client;
    await client.query("DELETE FROM typegraph_nodes WHERE props->>'namespace' = $1;", [this.namespace]);
  }

  async atomicModify(id: string, transform: (current: T) => T, _retries = 3): Promise<T> {
    const store = await TypeGraphAdapter.getStore();
    const docId = this.docId(id);
    // deno-lint-ignore no-explicit-any
    return await store.transaction(async (tx: any) => {
      const doc = await tx.nodes.Document.getById(docId);
      if (!doc) throw new Error(`[TypeGraphAdapter] Record not found: ${id}`);
      const current = JSON.parse(doc.content) as T;
      const updated = transform(current);
      await tx.nodes.Document.upsertById(docId, {
        namespace: this.namespace,
        originalId: id,
        content: JSON.stringify(updated),
      });
      return updated;
    });
  }

  async atomicIncrement(id: string): Promise<number> {
    const store = await TypeGraphAdapter.getStore();
    const docId = this.docId(id);
    // deno-lint-ignore no-explicit-any
    return await store.transaction(async (tx: any) => {
      const doc = await tx.nodes.Document.getById(docId);
      // Counters historically use `value`; older KV code used `seq`.
      // Honor either so id allocation never collapses to 1 forever.
      const currentVal = doc
        ? (JSON.parse(doc.content) as {
          id: string;
          value?: number;
          seq?: number;
        })
        : { id };
      const prev = Number(currentVal.value ?? currentVal.seq ?? 0) || 0;
      const next = prev + 1;
      const updated = { ...currentVal, id, value: next, seq: next };
      await tx.nodes.Document.upsertById(docId, {
        namespace: this.namespace,
        originalId: id,
        content: JSON.stringify(updated),
      });
      return next;
    });
  }

  static async close(): Promise<void> {
    if (TypeGraphAdapter.backend) {
      await TypeGraphAdapter.backend.close();
      TypeGraphAdapter.backend = null;
      TypeGraphAdapter.client = null;
      TypeGraphAdapter.store = null;
      TypeGraphAdapter.initPromise = null;
    }
  }
}
