import type { Registry, RegistryEntry } from "../cli/types.ts";

export interface TxnDirRecord {
  kind: "dir";
  path: string;
}

export interface TxnRegRecord {
  kind: "reg";
  name: string;
  previous: RegistryEntry | undefined;
}

export type TxnRecord = TxnDirRecord | TxnRegRecord;

export class InstallTxn {
  private records: TxnRecord[] = [];
  private committed = false;

  /** Record a directory the txn created. Call AFTER the directory exists on disk. */
  recordDir(path: string): void {
    this.records.push({ kind: "dir", path });
  }

  /** Record a registry mutation. Call BEFORE writing the new entry,
   *  passing the current value (possibly undefined). */
  recordRegistry(name: string, previous: RegistryEntry | undefined): void {
    this.records.push({ kind: "reg", name, previous });
  }

  /** Marks committed; subsequent rollback() is a no-op. */
  commit(): void {
    this.committed = true;
  }

  /** Roll back in LIFO order. Mutates `reg` in place (restoring or deleting keys).
   *  Directory removals are best-effort; failures are logged via console.warn
   *  and never rethrown. Always safe to call multiple times. */
  async rollback(reg: Registry): Promise<void> {
    if (this.committed) return;
    for (let i = this.records.length - 1; i >= 0; i--) {
      const rec = this.records[i];
      if (rec.kind === "dir") {
        await this.removeDir(rec.path);
      } else {
        this.restoreReg(reg, rec);
      }
    }
    this.records = [];
  }

  private async removeDir(path: string): Promise<void> {
    try {
      await Deno.remove(path, { recursive: true });
    } catch (e: unknown) {
      console.warn(`InstallTxn: failed to remove ${path}:`, e);
    }
  }

  private restoreReg(reg: Registry, rec: TxnRegRecord): void {
    if (rec.previous === undefined) {
      delete reg[rec.name];
    } else {
      reg[rec.name] = rec.previous;
    }
  }
}
