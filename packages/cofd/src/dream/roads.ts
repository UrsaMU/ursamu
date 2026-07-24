// Dreaming Roads — multi-room graph on room.state.dream (CtL p.220).

export interface RoadLink {
  /** Destination room id. */
  to: string;
  /** Exit label (path, arch, stair). */
  label: string;
}

/** Room tag: state.dream when on the Dreaming Roads. */
export interface DreamRoadRoom {
  road: true;
  name: string;
  /** Optional Bastion attached to this node. */
  bastionOwnerId?: string;
  bastionName?: string;
  fortification?: number;
  links: RoadLink[];
  flavor?: string;
  createdAt: number;
}

export function parseDreamRoom(raw: unknown): DreamRoadRoom | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.road !== true && o.bastion !== true) return null;
  const linksRaw = Array.isArray(o.links) ? o.links : [];
  const links: RoadLink[] = [];
  for (const L of linksRaw) {
    if (!L || typeof L !== "object") continue;
    const x = L as Record<string, unknown>;
    if (typeof x.to !== "string" || !x.to) continue;
    links.push({
      to: x.to,
      label: typeof x.label === "string" && x.label
        ? x.label
        : "path",
    });
  }
  return {
    road: true,
    name: typeof o.name === "string" && o.name
      ? o.name
      : "Dreaming Road",
    bastionOwnerId: typeof o.ownerId === "string"
      ? o.ownerId
      : typeof o.bastionOwnerId === "string"
      ? o.bastionOwnerId
      : undefined,
    bastionName: typeof o.bastionName === "string"
      ? o.bastionName
      : undefined,
    fortification: typeof o.fortification === "number"
      ? o.fortification
      : undefined,
    links,
    flavor: typeof o.flavor === "string" ? o.flavor : undefined,
    createdAt: typeof o.createdAt === "number"
      ? o.createdAt
      : Date.now(),
  };
}

export function findLink(
  room: DreamRoadRoom,
  labelOrId: string,
): RoadLink | null {
  const q = labelOrId.toLowerCase().trim();
  return (
    room.links.find((l) => {
      const lab = l.label.toLowerCase();
      const to = l.to.toLowerCase();
      return (
        lab === q ||
        to === q ||
        to.endsWith(q) ||
        lab.includes(q)
      );
    }) ?? null
  );
}

export function addRoadLink(
  room: DreamRoadRoom,
  to: string,
  label: string,
): DreamRoadRoom {
  const others = room.links.filter((l) => l.to !== to);
  return {
    ...room,
    links: [...others, { to, label: label.slice(0, 40) || "path" }],
  };
}

export function roadStatusLines(room: DreamRoadRoom): string[] {
  const lines = [
    `  Road node: %cy${room.name}%cn`,
  ];
  if (room.bastionName || room.bastionOwnerId) {
    lines.push(
      `  Bastion here: ${room.bastionName ?? "Bastion"}` +
        (room.fortification != null
          ? ` (Fort ${room.fortification})`
          : ""),
    );
  }
  if (!room.links.length) {
    lines.push("  Exits: (none — staff +dream/link)");
  } else {
    lines.push("  Exits:");
    for (const l of room.links) {
      lines.push(`    %cy${l.label}%cn → ${l.to.slice(-8)}`);
    }
  }
  if (room.flavor) {
    lines.push(`  ${room.flavor.slice(0, 70)}`);
  }
  return lines;
}
