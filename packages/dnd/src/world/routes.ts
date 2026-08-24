/**
 * Overland route defs + road corridor seed helpers.
 */
import routesJson from "../../resources/routes.json" with {
  type: "json",
};

export interface RouteLeg {
  key: string;
  name: string;
  description: string;
}

export interface RouteDef {
  slug: string;
  name: string;
  fromTown: string;
  toTown: string;
  fromRoom: string;
  toRoom: string;
  fromExit?: string;
  toExit?: string;
  legs: RouteLeg[];
  encounter?: string;
  book?: string;
}

export const ROUTES: Record<string, RouteDef> =
  routesJson as Record<string, RouteDef>;

export function listRoutes(): RouteDef[] {
  return Object.values(ROUTES);
}

export function routeBySlug(
  raw: string,
): RouteDef | undefined {
  const t = raw.toLowerCase().trim();
  return ROUTES[t] ??
    Object.values(ROUTES).find((r) =>
      r.name.toLowerCase().includes(t) ||
      r.toTown.includes(t) ||
      r.fromTown.includes(t)
    );
}

/** Find routes that touch a town id. */
export function routesForTown(townId: string): RouteDef[] {
  const id = townId.toLowerCase();
  return listRoutes().filter((r) =>
    r.fromTown.toLowerCase() === id ||
    r.toTown.toLowerCase() === id
  );
}
