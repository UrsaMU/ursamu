
import { dbojs } from "../Database/index.ts";

export interface IMapNode {
  id: string;
  name: string;
  color?: string; // e.g. based on flags
  x: number;
  y: number;
  depth: number;
}

export interface IMapEdge {
  from: string;
  to: string;
  dir: string; // n, s, e, w, etc.
}

export interface IMapData {
  nodes: IMapNode[];
  edges: IMapEdge[];
  center: string;
}

// Standard directions and their opposite coordinate modifiers (using screen coords: N = y-1, E = x+1)
const DIR_OFFSETS: Record<string, { x: number; y: number }> = {
  n: { x: 0, y: -1 },
  north: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  south: { x: 0, y: 1 },
  e: { x: 1, y: 0 },
  east: { x: 1, y: 0 },
  w: { x: -1, y: 0 },
  west: { x: -1, y: 0 },
  nw: { x: -1, y: -1 },
  ne: { x: 1, y: -1 },
  sw: { x: -1, y: 1 },
  se: { x: 1, y: 1 },
  u: { x: 0, y: 0 }, // Up/Down/Out/In typically don't map well to 2D grid, ignore for now or keep same coord?
  d: { x: 0, y: 0 },
  up: { x: 0, y: 0 },
  down: { x: 0, y: 0 },
};

export const getMapData = async (centerId: string, depth = 2): Promise<IMapData> => {
  const nodes: IMapNode[] = [];
  const edges: IMapEdge[] = [];
  const visited = new Map<string, { x: number; y: number }>(); 
  
  // Clean centerId (remove # if present)
  centerId = centerId.replace("#", "");

  // Queue for BFS: { id, x, y, currentDepth }
  const queue = [{ id: centerId, x: 0, y: 0, depth: 0 }];
  visited.set(centerId, { x: 0, y: 0 });
  
  while (queue.length > 0) {
    const curr = queue.shift();
    if (!curr) break;
    
    // Fetch room data
    const room = await dbojs.queryOne({ id: curr.id });
    if (!room) continue;

    // Add node
    nodes.push({
      id: room.id,
      name: room.data?.name || "Unknown",
      x: curr.x,
      y: curr.y,
      depth: curr.depth
    });

    // If we reached expected depth, we still scan exits to create edges to KNOWN nodes,
    // but we don't queue new nodes.
    // Actually, usually we only query neighbors up to depth-1 to expand?
    // Let's expand up to `depth`. If current is `depth`, we generally stop expanding.
    if (curr.depth >= depth) continue;

    const exits = await dbojs.query({ location: room.id, flags: /exit/i });
    
    for (const exit of exits) {
       // Check destination
       // deno-lint-ignore no-explicit-any
       const destId = (exit.data as any)?.destination;
       if (!destId) continue;
       
       const cleanDest = destId.replace("#", "");
       
       // Determine direction
       const rawName = exit.data?.name || "";
       const nameParts = rawName.split(";");
       const alias = nameParts.length > 1 ? nameParts[nameParts.length - 1].toLowerCase() : nameParts[0].toLowerCase();
       
       // Clean alias (just first letter if n/s/e/w?) or use map
       let dir = "";
       let offset = { x: 0, y: 0 };
       
       if (DIR_OFFSETS[alias]) {
           dir = alias;
           offset = DIR_OFFSETS[alias];
       } else if (DIR_OFFSETS[alias[0]]) {
           // Fallback to first char if it matches? Careful with 'u'/'d'.
           if (['n','s','e','w'].includes(alias[0])) {
               dir = alias[0];
               offset = DIR_OFFSETS[dir];
           }
       }
       
       if (!dir && !['u','d','out','in'].includes(alias)) {
           // Treat as generic link?
           // For visual map, maybe only standard cardinal directions matter?
           // If we have an exit "tavern", we might not want to map it spatially unless we know where.
           continue; 
       }
       
       // Add Edge
       edges.push({
           from: room.id,
           to: cleanDest,
           dir: dir || alias
       });
       
       // Queue destination if valid direction and not visited
       if (dir && (offset.x !== 0 || offset.y !== 0)) {
           if (!visited.has(cleanDest)) {
               const newX = curr.x + offset.x;
               const newY = curr.y + offset.y;
               visited.set(cleanDest, { x: newX, y: newY });
               queue.push({ id: cleanDest, x: newX, y: newY, depth: curr.depth + 1 });
           }
       }
    }
  }

  return { nodes, edges, center: centerId };
};
