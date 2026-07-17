// Read / write Icons on CofdSheet.

import type { CofdSheet } from "../stats/sheet.ts";
import type { IconKind, IconRecord, IconStatus } from "./types.ts";
import { ICON_KINDS } from "./types.ts";

export function readIcons(sheet: CofdSheet): IconRecord[] {
  const raw = (sheet as CofdSheet & { icons?: unknown }).icons;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x) => normalizeIcon(x as Record<string, unknown>))
    .filter((i): i is IconRecord => i !== null);
}

function normalizeIcon(
  o: Record<string, unknown>,
): IconRecord | null {
  const id = String(o.id ?? "").trim();
  const name = String(o.name ?? "").trim();
  if (!id || !name) return null;
  const kindRaw = String(o.kind ?? "other").toLowerCase();
  const kind = (ICON_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as IconKind)
    : "other";
  const statusRaw = String(o.status ?? "lost") as IconStatus;
  const status: IconStatus =
    (["lost", "held", "spent", "recovered"] as IconStatus[])
        .includes(statusRaw)
      ? statusRaw
      : "lost";
  return {
    id,
    name,
    kind,
    heldBy: String(o.heldBy ?? "Unknown"),
    description: String(o.description ?? ""),
    status,
    skillKey: o.skillKey ? String(o.skillKey) : undefined,
    createdAt: Number(o.createdAt) || 0,
    spentAt: o.spentAt ? Number(o.spentAt) : undefined,
    recoveredAt: o.recoveredAt
      ? Number(o.recoveredAt)
      : undefined,
    spentNote: o.spentNote ? String(o.spentNote) : undefined,
  };
}

export function writeIcons(
  sheet: CofdSheet,
  icons: IconRecord[],
): CofdSheet {
  return { ...sheet, icons };
}

export function activeIcons(sheet: CofdSheet): IconRecord[] {
  return readIcons(sheet).filter(
    (i) => i.status === "lost" || i.status === "held",
  );
}

export function findIcon(
  sheet: CofdSheet,
  idOrName: string,
): IconRecord | null {
  const q = idOrName.toLowerCase().trim();
  return (
    readIcons(sheet).find(
      (i) =>
        i.id === idOrName ||
        i.id.toLowerCase() === q ||
        i.id.endsWith(q) ||
        i.name.toLowerCase() === q,
    ) ?? null
  );
}

export function addIcon(
  sheet: CofdSheet,
  partial: Omit<IconRecord, "id" | "status" | "createdAt"> & {
    id?: string;
    status?: IconStatus;
  },
  now: number = Date.now(),
): { sheet: CofdSheet; icon: IconRecord } {
  const icon: IconRecord = {
    id: partial.id ??
      `icon-${now}-${Math.floor(Math.random() * 1e5)}`,
    name: partial.name.slice(0, 60),
    kind: partial.kind,
    heldBy: partial.heldBy.slice(0, 80),
    description: partial.description.slice(0, 400),
    status: partial.status ?? "lost",
    skillKey: partial.skillKey,
    createdAt: now,
  };
  const next = writeIcons(sheet, [...readIcons(sheet), icon]);
  return { sheet: next, icon };
}

export function setIconStatus(
  sheet: CofdSheet,
  id: string,
  status: IconStatus,
  extra: Partial<IconRecord> = {},
): { sheet: CofdSheet; icon: IconRecord | null } {
  const list = readIcons(sheet);
  const idx = list.findIndex(
    (i) =>
      i.id === id ||
      i.id.endsWith(id) ||
      i.name.toLowerCase() === id.toLowerCase(),
  );
  if (idx < 0) return { sheet, icon: null };
  const icon: IconRecord = {
    ...list[idx],
    ...extra,
    status,
  };
  const next = [...list];
  next[idx] = icon;
  return { sheet: writeIcons(sheet, next), icon };
}
