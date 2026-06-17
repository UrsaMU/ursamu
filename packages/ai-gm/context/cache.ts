import type { ISessionSnapshot } from "./loader.ts";
import type { ILorePage } from "./loader.ts";
import { loadLorePages, loadSessionSnapshot } from "./loader.ts";

// ─── Section keys that can be individually invalidated ───────────────────────

export type CacheSection =
  | "characters"
  | "npcs"
  | "orgs"
  | "fronts"
  | "memories"
  | "reveals"
  | "jobs"
  | "downtime"
  | "lore"
  | "all";

// ─── In-memory session context cache ─────────────────────────────────────────
//
// Loaded once per server session (or on +gm/reload).
// Individual sections are invalidated via hook callbacks when underlying
// data changes (wiki:created, job:resolved, etc.).

interface ICacheEntry<T> {
  data: T;
  loadedAt: number;
}

class SessionContextCache {
  private snapshot: ICacheEntry<ISessionSnapshot> | null = null;
  private lore: ICacheEntry<ILorePage[]> | null = null;
  private dirty: Set<CacheSection> = new Set();
  private charCollection = "server.playbooks";

  setCharCollection(collection: string): void {
    if (this.charCollection !== collection) {
      this.charCollection = collection;
      this.invalidate("characters");
    }
  }

  async getSnapshot(): Promise<ISessionSnapshot> {
    if (!this.snapshot || this.dirty.has("all") || this.isDirtySome()) {
      const fresh = await loadSessionSnapshot(this.charCollection);
      this.snapshot = { data: fresh, loadedAt: Date.now() };
      this.dirty.clear();
    }
    return this.snapshot.data;
  }

  async getLore(baseUrl?: string): Promise<ILorePage[]> {
    if (!this.lore || this.dirty.has("lore") || this.dirty.has("all")) {
      const fresh = await loadLorePages(baseUrl);
      this.lore = { data: fresh, loadedAt: Date.now() };
      this.dirty.delete("lore");
    }
    return this.lore.data;
  }

  invalidate(section: CacheSection): void {
    if (section === "all") {
      this.dirty.add("all");
      this.snapshot = null;
      this.lore = null;
    } else {
      this.dirty.add(section);
    }
  }

  invalidateAll(): void {
    this.invalidate("all");
  }

  private isDirtySome(): boolean {
    return this.dirty.size > 0;
  }

  isLoaded(): boolean {
    return this.snapshot !== null;
  }

  loadedAt(): number | null {
    return this.snapshot?.loadedAt ?? null;
  }
}

// Singleton — one cache per server process
export const sessionCache = new SessionContextCache();
