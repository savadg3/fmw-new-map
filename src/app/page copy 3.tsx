"use client";
import React, { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    maplibregl: any;
  }
}

interface Building {
  height: number;
  polygon: [number, number][];
}

interface Node {
  id: number;
  coordinates: [number, number];
  color: string;
}

interface Line {
  id: number;
  points: [number, number][];
  startNode: number;
  endNode: number;
}

interface CurrentLine {
  start: number;
  points: [number, number][];
  nodeIds: number[]; 
}

type ViewMode = "3d" | "map";
type Mode = "view" | "drawLines" | "dragNodes" | "dragBuildings";

const buildingsData: Building[] = [
  {
    height: 137,
    polygon: [
      [-74.01766, 40.70552],
      [-74.01752, 40.70572],
      [-74.01745, 40.70569],
      [-74.01732, 40.70563],
      [-74.01736, 40.7055],
      [-74.01752, 40.70549],
      [-74.0176, 40.70549],
      [-74.01767, 40.7055],
      [-74.01766, 40.70552],
    ],
  },
  {
    height: 29,
    polygon: [
      [-74.01852, 40.70652],
      [-74.0184, 40.70668],
      [-74.0182, 40.7066],
      [-74.01806, 40.70674],
      [-74.01829, 40.70683],
      [-74.01818, 40.70699],
      [-74.01773, 40.70682],
      [-74.01782, 40.7067],
      [-74.01795, 40.70652],
      [-74.01808, 40.70634],
      [-74.01852, 40.70652],
    ],
  },
];

export default function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [mode, setMode] = useState<Mode>("view");

  const [lines, setLines] = useState<Line[]>([]);
  const [currentLine, setCurrentLine] = useState<CurrentLine | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const draggedNodeRef = useRef<Node | null>(null);
  const isDraggingNode = useRef(false);
  const lastClickTime = useRef<number>(0);

  // Use refs for arrays that are accessed in event handlers
  const linesRef = useRef<Line[]>([]);
  const nodesRef = useRef<Node[]>([]);
  const modeRef = useRef<Mode>(mode);
  const currentLineRef = useRef<CurrentLine | null>(null);

  const colors = [
    "#FF9800",
    //  "#4CAF50", "#9C27B0", "#2196F3", "#9E9E9E"
  ];

  // Keep refs in sync with state
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    currentLineRef.current = currentLine;
  }, [currentLine]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (viewMode !== "map" || !mapContainer.current || mapRef.current) return;

    const script = document.createElement("script");
    script.src = "https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js";
    script.async = true;
    script.onload = () => {
      const link = document.createElement("link");
      link.href = "https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css";
      link.rel = "stylesheet";
      document.head.appendChild(link);

      const maplibregl = window.maplibregl;
      const map = new maplibregl.Map({
        container: mapContainer.current,
        style:
          "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
        center: [-74.0179, 40.706],
        zoom: 17,
        pitch: 60,
        bearing: -17.6,
        maxBounds: [
          [-74.019, 40.705],
          [-74.016, 40.707],
        ],
      });

      mapRef.current = map;

      map.on("load", () => {
        // Add building extrusions
        buildingsData.forEach((b, i) => {
          const coords = [...b.polygon, b.polygon[0]];
          map.addSource(`building-${i}`, {
            type: "geojson",
            data: {
              type: "Feature",
              geometry: { type: "Polygon", coordinates: [coords] },
            },
          });
          map.addLayer({
            id: `building-${i}-extrusion`,
            type: "fill-extrusion",
            source: `building-${i}`,
            paint: {
              "fill-extrusion-color": "#4a90e2",
              "fill-extrusion-height": b.height,
              "fill-extrusion-opacity": 0.9,
            },
          });
        });

        // Line + node layers
        map.addSource("lines", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "lines-layer",
          type: "line",
          source: "lines",
          paint: { "line-color": "#ff0000", "line-width": 3 },
        });

        map.addSource("nodes", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "nodes-layer",
          type: "circle",
          source: "nodes",
          paint: {
            "circle-radius": 8,
            "circle-color": ["get", "color"],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#000",
          },
        });
      });

      // Drawing logic
      map.on("click", (e: any) => {
        const currentMode = modeRef.current;
        if (currentMode !== "drawLines") return;

        const now = Date.now();
        const isDoubleClick = now - lastClickTime.current < 300;
        lastClickTime.current = now;

        if (isDoubleClick && currentLineRef.current) {
          // Double-click ends the current line without adding a point
          setCurrentLine(null);
          currentLineRef.current = null;
          return;
        }

        const clickedNode = findNodeAtPoint(e.lngLat, nodesRef.current);

        if (clickedNode) {
          // Clicked on existing node
          if (!currentLineRef.current) {
            // Start new line from existing node
            const newCurrentLine = {
              start: clickedNode.id,
              points: [clickedNode.coordinates],
              nodeIds: [clickedNode.id],
            };
            setCurrentLine(newCurrentLine);
            currentLineRef.current = newCurrentLine;
          } else {
            // Check if clicking on the starting node (close the loop)
            if (clickedNode.id === currentLineRef.current.start) {
              setCurrentLine(null);
              currentLineRef.current = null;
              return;

              // Create a closed line segment from last point to start
              const newLine: Line = {
                id: Date.now(),
                points: [
                  ...currentLineRef.current.points,
                  clickedNode.coordinates,
                ],
                startNode:
                  currentLineRef.current.nodeIds[
                    currentLineRef.current.nodeIds.length - 1
                  ],
                endNode: clickedNode.id,
              };
              const updatedLines = [...linesRef.current, newLine];
              setLines(updatedLines);
              linesRef.current = updatedLines;
              setCurrentLine(null);
              currentLineRef.current = null;
              updateLinesOnMap(map, updatedLines);
            } else {
              // Continue the line to this node
              const newLine: Line = {
                id: Date.now(),
                points: [
                  currentLineRef.current.points[
                    currentLineRef.current.points.length - 1
                  ],
                  clickedNode.coordinates,
                ],
                startNode:
                  currentLineRef.current.nodeIds[
                    currentLineRef.current.nodeIds.length - 1
                  ],
                endNode: clickedNode.id,
              };
              const updatedLines = [...linesRef.current, newLine];
              setLines(updatedLines);
              linesRef.current = updatedLines;

              // Continue drawing from this node
              const updatedCurrentLine = {
                start: currentLineRef.current.start,
                points: [
                  ...currentLineRef.current.points,
                  clickedNode.coordinates,
                ],
                nodeIds: [...currentLineRef.current.nodeIds, clickedNode.id],
              };
              setCurrentLine(updatedCurrentLine);
              currentLineRef.current = updatedCurrentLine;
              updateLinesOnMap(map, updatedLines);
            }
          }
        } else {
          // Create new node at click location
          const newNode: Node = {
            id: Date.now(),
            coordinates: [e.lngLat.lng, e.lngLat.lat],
            color: colors[nodesRef.current.length % colors.length],
          };
          const updatedNodes = [...nodesRef.current, newNode];
          setNodes(updatedNodes);
          nodesRef.current = updatedNodes;
          updateNodesOnMap(map, updatedNodes);

          if (!currentLineRef.current) {
            // Start new continuous line
            const newCurrentLine = {
              start: newNode.id,
              points: [newNode.coordinates],
              nodeIds: [newNode.id],
            };
            setCurrentLine(newCurrentLine);
            currentLineRef.current = newCurrentLine;
          } else {
            // Add segment to existing line
            const newLine: Line = {
              id: Date.now(),
              points: [
                currentLineRef.current.points[
                  currentLineRef.current.points.length - 1
                ],
                newNode.coordinates,
              ],
              startNode:
                currentLineRef.current.nodeIds[
                  currentLineRef.current.nodeIds.length - 1
                ],
              endNode: newNode.id,
            };
            const updatedLines = [...linesRef.current, newLine];
            setLines(updatedLines);
            linesRef.current = updatedLines;

            // Continue drawing from this new node
            const updatedCurrentLine = {
              start: currentLineRef.current.start,
              points: [...currentLineRef.current.points, newNode.coordinates],
              nodeIds: [...currentLineRef.current.nodeIds, newNode.id],
            };
            setCurrentLine(updatedCurrentLine);
            currentLineRef.current = updatedCurrentLine;
            updateLinesOnMap(map, updatedLines);
          }
        }
      });

      // Preview during drawing
      map.on("mousemove", (e: any) => {
        const currentMode = modeRef.current;
        if (currentMode === "drawLines" && currentLineRef.current) {
          const preview: Line = {
            id: -1,
            points: [
              ...currentLineRef.current.points,
              [e.lngLat.lng, e.lngLat.lat],
            ],
            startNode: currentLineRef.current.start,
            endNode: -1,
          };
          updateLinesOnMap(map, [...linesRef.current, preview]);
        }

        // Drag nodes
        if (isDraggingNode.current && draggedNodeRef.current) {
          const updatedNodes = nodesRef.current.map((n) =>
            n.id === draggedNodeRef.current!.id
              ? {
                  ...n,
                  coordinates: [e.lngLat.lng, e.lngLat.lat] as [number, number],
                }
              : n
          );
          setNodes(updatedNodes);
          nodesRef.current = updatedNodes;

          const updatedLines = linesRef.current.map((l) => {
            const updatedPoints = l.points.map((p, idx) => {
              if (
                (idx === 0 && l.startNode === draggedNodeRef.current!.id) ||
                (idx === l.points.length - 1 &&
                  l.endNode === draggedNodeRef.current!.id)
              )
                return [e.lngLat.lng, e.lngLat.lat] as [number, number];
              return p;
            });
            return { ...l, points: updatedPoints };
          });

          setLines(updatedLines);
          linesRef.current = updatedLines;
          updateNodesOnMap(map, updatedNodes);
          updateLinesOnMap(map, updatedLines);
        }

        // Cursor change for drag mode
        if (mode === "dragNodes") {
          const node = findNodeAtPoint(e.lngLat, nodesRef.current);
          map.getCanvas().style.cursor = node ? "pointer" : "";
        }
      });

      map.on("mousedown", (e: any) => {
        if (modeRef.current === "dragNodes") {
          const clickedNode = findNodeAtPoint(e.lngLat, nodesRef.current);
          if (clickedNode) {
            draggedNodeRef.current = clickedNode;
            isDraggingNode.current = true;
            map.getCanvas().style.cursor = "grabbing";
            map.dragPan.disable();
          }
        }
      });

      map.on("mouseup", () => {
        if (isDraggingNode.current) {
          isDraggingNode.current = false;
          draggedNodeRef.current = null;
          if (mapRef.current) {
            mapRef.current.getCanvas().style.cursor = "";
            mapRef.current.dragPan.enable();
          }
        }
      });
    };
    document.head.appendChild(script);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [viewMode]); // Removed 'mode' from dependencies

  // Utility functions
  function findNodeAtPoint(
    lngLat: { lng: number; lat: number },
    nodesList: Node[]
  ): Node | undefined {
    const t = 0.00008;
    return nodesList.find(
      (n) =>
        Math.abs(n.coordinates[0] - lngLat.lng) < t &&
        Math.abs(n.coordinates[1] - lngLat.lat) < t
    );
  }

  function updateLinesOnMap(map: any, list: Line[]) {
    const features = list.map((l) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: l.points },
      properties: { id: l.id },
    }));
    map.getSource("lines")?.setData({
      type: "FeatureCollection",
      features,
    });
  }

  function updateNodesOnMap(map: any, list: Node[]) {
    const features = list.map((n) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: n.coordinates },
      properties: { color: n.color, id: n.id },
    }));
    map.getSource("nodes")?.setData({
      type: "FeatureCollection",
      features,
    });
  }

  return (
    <div className="w-full h-screen bg-gray-900">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-gray-800 p-3 rounded-lg">
        <div className="text-white font-bold mb-2">Tools</div>
        <button
          onClick={() => setMode("view")}
          className={`px-3 py-2 rounded text-sm transition-colors ${
            mode === "view"
              ? "bg-green-500 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          View Mode
        </button>
        <button
          onClick={() => {
            setMode("drawLines");
            setCurrentLine(null);
          }}
          className={`px-3 py-2 rounded text-sm transition-colors ${
            mode === "drawLines"
              ? "bg-blue-500 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          Draw Lines
        </button>
        <button
          onClick={() => setMode("dragNodes")}
          className={`px-3 py-2 rounded text-sm transition-colors ${
            mode === "dragNodes"
              ? "bg-yellow-500 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          Drag Nodes
        </button>
        {currentLine && (
          <button
            onClick={() => {
              setCurrentLine(null);
              currentLineRef.current = null;
            }}
            className="px-3 py-2 rounded text-sm bg-orange-500 text-white hover:bg-orange-600"
          >
            Cancel Line
          </button>
        )}
      </div>

      <div className="absolute top-4 right-4 z-10 bg-gray-800 text-white p-4 rounded-lg shadow-lg">
        <h3 className="font-bold mb-2">Info</h3>
        <div className="text-sm space-y-1">
          <div>Buildings: 2</div>
          <div>Lines: {lines.length}</div>
          <div>Nodes: {nodes.length}</div>
          {currentLine && (
            <div className="text-yellow-400 mt-2 pt-2 border-t border-gray-600">
              <div>Drawing...</div>
              <div className="text-xs mt-1">
                Double-click or click start node to finish
              </div>
            </div>
          )}
        </div>
      </div>

      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
}
