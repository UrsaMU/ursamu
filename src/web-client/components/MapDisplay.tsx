


interface IMapNode {
  id: string;
  name: string;
  color?: string;
  x: number;
  y: number;
  depth: number;
}

interface IMapEdge {
  from: string;
  to: string;
  dir: string;
}

interface IMapData {
  nodes: IMapNode[];
  edges: IMapEdge[];
  center: string;
}

interface MapDisplayProps {
  data: IMapData | null;
}

export default function MapDisplay({ data }: MapDisplayProps) {
  if (!data) return <div class="text-gray-500 text-xs italic text-center p-4">No map data available</div>;

  const getCoords = (node: IMapNode) => {
    // Center is 100,100. Scale is 40px per unit.
    return {
      x: 100 + node.x * 50,
      y: 100 + node.y * 50
    };
  };

  return (
    <div class="border border-gray-700 rounded bg-gray-900 overflow-hidden w-full h-48 flex items-center justify-center">
      <svg width="200" height="200" viewBox="0 0 200 200">
        {/* Edges */}
        {data.edges.map((edge, i) => {
          const fromNode = data.nodes.find(n => n.id === edge.from);
          const toNode = data.nodes.find(n => n.id === edge.to);
          if (!fromNode || !toNode) return null;
          
          const start = getCoords(fromNode);
          const end = getCoords(toNode);
          
          return (
            <line
              key={`edge-${i}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke="#4b5563"
              strokeWidth="2"
            />
          );
        })}

        {/* Nodes */}
        {data.nodes.map((node) => {
          const { x, y } = getCoords(node);
          const isCenter = node.id === data.center;
          
          return (
            <g key={node.id}>
              <circle
                cx={x}
                cy={y}
                r={isCenter ? 8 : 6}
                fill={isCenter ? "#a855f7" : "#374151"}
                stroke={isCenter ? "#d8b4fe" : "#1f2937"}
                strokeWidth="2"
              />
              {/* Tooltip or Label could go here */}
              <title>{node.name} (#{node.id})</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
