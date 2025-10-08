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

type PathType = "main" | "sub";

interface Line {
  id: number;
  points: [number, number][];
  startNode: number;
  endNode: number;
  pathType: PathType;
}

interface CurrentLine {
  start: number;
  points: [number, number][];
  nodeIds: number[];
  pathType: PathType;
  isContinuingFromLine?: boolean;
  continuedLineId?: number;
  splitPoint?: [number, number]; // The exact point where the line was split
}

type ViewMode = "3d" | "map";
type Mode = "view" | "drawLines" | "dragNodes" | "dragBuildings" | "breakLines"; // Added breakLines mode

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
  const [currentPathType, setCurrentPathType] = useState<PathType>("main");

  const [lines, setLines] = useState<Line[]>([]);
  const [currentLine, setCurrentLine] = useState<CurrentLine | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const draggedNodeRef = useRef<Node | null>(null);
  const isDraggingNode = useRef(false);
  const lastClickTime = useRef<number>(0);

  const linesRef = useRef<Line[]>([]);
  const nodesRef = useRef<Node[]>([]);
  const modeRef = useRef<Mode>(mode);
  const currentLineRef = useRef<CurrentLine | null>(null);
  const currentPathTypeRef = useRef<PathType>(currentPathType);

  const colors = ["#FF9800"];

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
    currentPathTypeRef.current = currentPathType;
  }, [currentPathType]);

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
        pitch: 0,
        bearing: 0,
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
              "fill-extrusion-opacity": 0.5,
            },
          });
        });

        // Main Path Layers (Blue)
        map.addSource("main-lines", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: "main-lines-border",
          type: "line",
          source: "main-lines",
          paint: {
            "line-color": "#1e5a99",
            "line-width": 10,
            "line-opacity": 0.8,
          },
        });

        map.addLayer({
          id: "main-lines-main",
          type: "line",
          source: "main-lines",
          paint: {
            "line-color": "#4285f4",
            "line-width": 8,
          },
        });

        map.addLayer({
          id: "main-lines-center",
          type: "line",
          source: "main-lines",
          paint: {
            "line-color": "#8ab4f8",
            "line-width": 2,
            "line-opacity": 0.6,
          },
        });

        // Sub Path Layers (Green)
        map.addSource("sub-lines", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: "sub-lines-border",
          type: "line",
          source: "sub-lines",
          paint: {
            "line-color": "#2d7a4a",
            "line-width": 8,
            "line-opacity": 0.8,
          },
        });

        map.addLayer({
          id: "sub-lines-main",
          type: "line",
          source: "sub-lines",
          paint: {
            "line-color": "#34a853",
            "line-width": 6,
          },
        });

        map.addLayer({
          id: "sub-lines-center",
          type: "line",
          source: "sub-lines",
          paint: {
            "line-color": "#81c995",
            "line-width": 1.5,
            "line-opacity": 0.6,
          },
        });

        // Preview line (animated dashed)
        map.addSource("preview-line", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: "preview-border",
          type: "line",
          source: "preview-line",
          paint: {
            "line-color": ["get", "borderColor"],
            "line-width": ["get", "borderWidth"],
            "line-opacity": 0.5,
            "line-dasharray": [2, 2],
          },
        });

        map.addLayer({
          id: "preview-main",
          type: "line",
          source: "preview-line",
          paint: {
            "line-color": ["get", "mainColor"],
            "line-width": ["get", "mainWidth"],
            "line-opacity": 0.7,
            "line-dasharray": [2, 2],
          },
        });

        // Nodes
        map.addSource("nodes", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: "nodes-glow",
          type: "circle",
          source: "nodes",
          paint: {
            "circle-radius": 12,
            "circle-color": ["get", "color"],
            "circle-opacity": 0.3,
            "circle-blur": 0.5,
          },
        });

        map.addLayer({
          id: "nodes-main",
          type: "circle",
          source: "nodes",
          paint: {
            "circle-radius": 8,
            "circle-color": ["get", "color"],
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
          },
        });

        // Line highlight layer for continuing paths
        map.addSource("highlight-line", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: "highlight-line-border",
          type: "line",
          source: "highlight-line",
          paint: {
            "line-color": "#FFD700",
            "line-width": 12,
            "line-opacity": 0.3,
          },
        });

        map.addLayer({
          id: "highlight-line-main",
          type: "line",
          source: "highlight-line",
          paint: {
            "line-color": "#FFA500",
            "line-width": 10,
            "line-opacity": 0.5,
          },
        });
      });

      map.on("click", (e: any) => {
        const currentMode = modeRef.current;
        
        if (currentMode === "breakLines") {
          // Handle line breaking
          const clickedLineInfo = findLineAtPoint(e.lngLat, linesRef.current);
          if (clickedLineInfo) {
            const { line, closestPoint, segmentIndex } = clickedLineInfo;
            breakLineAtPoint(line, closestPoint, segmentIndex, map);
          }
          return;
        }

        if (currentMode !== "drawLines") return;

        const now = Date.now();
        const isDoubleClick = now - lastClickTime.current < 300;
        lastClickTime.current = now;

        if (isDoubleClick && currentLineRef.current) {
          setCurrentLine(null);
          currentLineRef.current = null;
          updatePreviewLine(map, null);
          updateHighlightLine(map, null);
          return;
        }

        const clickedNode = findNodeAtPoint(e.lngLat, nodesRef.current);
        const clickedLineInfo = findLineAtPoint(e.lngLat, linesRef.current);

        // If currently drawing and clicking on any line OR any node (except start node), finish the current line
        if (currentLineRef.current && (clickedLineInfo || (clickedNode && clickedNode.id !== currentLineRef.current.start))) {
          let endNode: Node;
          
          if (clickedNode && clickedNode.id !== currentLineRef.current.start) {
            // Clicked on an existing node (not the start node)
            endNode = clickedNode;
          } else if (clickedLineInfo) {
            // Clicked on a line - create new node at that point
            const { line, closestPoint, segmentIndex } = clickedLineInfo;
            
            endNode = {
              id: Date.now(),
              coordinates: [closestPoint[0], closestPoint[1]],
              color: colors[nodesRef.current.length % colors.length],
            };
            
            // Split the target line into two segments
            const splitLines = splitLineAtPoint(line, closestPoint, segmentIndex, endNode.id);
            
            // Replace the original line with the two split lines
            const updatedLines = linesRef.current.filter(l => l.id !== line.id);
            updatedLines.push(...splitLines);
            
            // Add the new end node
            const updatedNodes = [...nodesRef.current, endNode];
            
            setNodes(updatedNodes);
            nodesRef.current = updatedNodes;
            setLines(updatedLines);
            linesRef.current = updatedLines;
            
            updateNodesOnMap(map, updatedNodes);
            updateLinesOnMap(map, updatedLines);
          } else {
            return;
          }
          
          // Create the final segment from current line to the clicked node/line
          const finalLine: Line = {
            id: Date.now(),
            points: [
              currentLineRef.current.points[currentLineRef.current.points.length - 1],
              endNode.coordinates,
            ],
            startNode: currentLineRef.current.nodeIds[currentLineRef.current.nodeIds.length - 1],
            endNode: endNode.id,
            pathType: currentLineRef.current.pathType,
          };
          
          const updatedLines = [...linesRef.current, finalLine];
          setLines(updatedLines);
          linesRef.current = updatedLines;
          
          // Finish the current line
          finishCurrentLine();
          
          // Update map
          updateLinesOnMap(map, updatedLines);
          return;
        }

        // If clicking on a line (and not on a node), start continuing from that exact point
        if (clickedLineInfo && !clickedNode && !currentLineRef.current) {
          const { line, closestPoint, segmentIndex } = clickedLineInfo;
          
          // Create a new node at the exact click position
          const splitNode: Node = {
            id: Date.now(),
            coordinates: [closestPoint[0], closestPoint[1]],
            color: colors[nodesRef.current.length % colors.length],
          };
          
          // Split the original line into two segments
          const splitLines = splitLineAtPoint(line, closestPoint, segmentIndex, splitNode.id);
          
          // Replace the original line with the two split lines
          const updatedLines = linesRef.current.filter(l => l.id !== line.id);
          updatedLines.push(...splitLines);
          
          // Add the new split node
          const updatedNodes = [...nodesRef.current, splitNode];
          
          setNodes(updatedNodes);
          nodesRef.current = updatedNodes;
          setLines(updatedLines);
          linesRef.current = updatedLines;
          
          // Start drawing from the split point
          const newCurrentLine: CurrentLine = {
            start: splitNode.id,
            points: [splitNode.coordinates],
            nodeIds: [splitNode.id],
            pathType: currentPathTypeRef.current, // Use current selected path type
            isContinuingFromLine: true,
            continuedLineId: line.id,
            splitPoint: closestPoint
          };
          
          setCurrentLine(newCurrentLine);
          currentLineRef.current = newCurrentLine;
          
          // Update map
          updateNodesOnMap(map, updatedNodes);
          updateLinesOnMap(map, updatedLines);
          updateHighlightLine(map, line.points);
          return;
        }

        if (clickedNode) {
          if (!currentLineRef.current) {
            const newCurrentLine = {
              start: clickedNode.id,
              points: [clickedNode.coordinates],
              nodeIds: [clickedNode.id],
              pathType: currentPathTypeRef.current,
            };
            setCurrentLine(newCurrentLine);
            currentLineRef.current = newCurrentLine;
          } else {
            // If clicking on start node, finish the line (loop back) using the existing node
            if (clickedNode.id === currentLineRef.current.start) {
              // Add final segment to complete the loop using existing start node
              const newLine: Line = {
                id: Date.now(),
                points: [
                  currentLineRef.current.points[
                    currentLineRef.current.points.length - 1
                  ],
                  clickedNode.coordinates, // Use existing node coordinates
                ],
                startNode:
                  currentLineRef.current.nodeIds[
                    currentLineRef.current.nodeIds.length - 1
                  ],
                endNode: clickedNode.id, // Use existing node ID
                pathType: currentLineRef.current.pathType,
              };
              const updatedLines = [...linesRef.current, newLine];
              setLines(updatedLines);
              linesRef.current = updatedLines;
              updateLinesOnMap(map, updatedLines);
              
              // Finish the current line
              finishCurrentLine();
            }
            // Note: Clicking on other nodes is now handled in the condition above
          }
        } else {
          // Create new node and continue drawing
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
            const newCurrentLine = {
              start: newNode.id,
              points: [newNode.coordinates],
              nodeIds: [newNode.id],
              pathType: currentPathTypeRef.current,
            };
            setCurrentLine(newCurrentLine);
            currentLineRef.current = newCurrentLine;
          } else {
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
              pathType: currentLineRef.current.pathType,
            };
            const updatedLines = [...linesRef.current, newLine];
            setLines(updatedLines);
            linesRef.current = updatedLines;

            const updatedCurrentLine = {
              ...currentLineRef.current,
              points: [...currentLineRef.current.points, newNode.coordinates],
              nodeIds: [...currentLineRef.current.nodeIds, newNode.id],
            };
            setCurrentLine(updatedCurrentLine);
            currentLineRef.current = updatedCurrentLine;
            updateLinesOnMap(map, updatedLines);
          }
        }
      });

      map.on("mousemove", (e: any) => {
        const currentMode = modeRef.current;
        
        // Show pointer cursor when hovering over lines in draw mode
        if (currentMode === "drawLines" && !currentLineRef.current) {
          const lineInfo = findLineAtPoint(e.lngLat, linesRef.current);
          map.getCanvas().style.cursor = lineInfo ? "crosshair" : "";
        }

        // Show break cursor when hovering over lines in break mode
        if (currentMode === "breakLines") {
          const lineInfo = findLineAtPoint(e.lngLat, linesRef.current);
          map.getCanvas().style.cursor = lineInfo ? "no-drop" : "";
        }

        if (currentMode === "drawLines" && currentLineRef.current) {
          const previewPoints = [
            ...currentLineRef.current.points,
            [e.lngLat.lng, e.lngLat.lat],
          ];
          updatePreviewLine(map, previewPoints, currentLineRef.current.pathType);
        }

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
  }, [viewMode]);

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

  function findLineAtPoint(
    lngLat: { lng: number; lat: number },
    linesList: Line[]
  ): { line: Line; closestPoint: [number, number]; segmentIndex: number } | undefined {
    const tolerance = 0.00005;
    
    let closestLine: Line | undefined;
    let closestPoint: [number, number] | undefined;
    let closestSegmentIndex = -1;
    let minDistance = tolerance;

    linesList.forEach(line => {
      for (let i = 0; i < line.points.length - 1; i++) {
        const p1 = line.points[i];
        const p2 = line.points[i + 1];
        
        // Calculate distance from point to line segment
        const A = lngLat.lng - p1[0];
        const B = lngLat.lat - p1[1];
        const C = p2[0] - p1[0];
        const D = p2[1] - p1[1];
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) {
          param = dot / lenSq;
        }
        
        let xx, yy;
        
        if (param < 0) {
          xx = p1[0];
          yy = p1[1];
        } else if (param > 1) {
          xx = p2[0];
          yy = p2[1];
        } else {
          xx = p1[0] + param * C;
          yy = p1[1] + param * D;
        }
        
        const dx = lngLat.lng - xx;
        const dy = lngLat.lat - yy;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < minDistance) {
          minDistance = distance;
          closestLine = line;
          closestPoint = [xx, yy] as [number, number];
          closestSegmentIndex = i;
        }
      }
    });

    if (closestLine && closestPoint) {
      return {
        line: closestLine,
        closestPoint,
        segmentIndex: closestSegmentIndex
      };
    }
    
    return undefined;
  }

  function splitLineAtPoint(
    line: Line, 
    splitPoint: [number, number], 
    segmentIndex: number,
    newNodeId: number
  ): Line[] {
    const firstSegmentPoints = [
      ...line.points.slice(0, segmentIndex + 1),
      splitPoint
    ];
    
    const secondSegmentPoints = [
      splitPoint,
      ...line.points.slice(segmentIndex + 1)
    ];

    // For the first segment, start node remains the same, end node is the new split node
    const firstSegment: Line = {
      id: Date.now(),
      points: firstSegmentPoints,
      startNode: line.startNode,
      endNode: newNodeId,
      pathType: line.pathType
    };

    // For the second segment, start node is the new split node, end node remains the same
    const secondSegment: Line = {
      id: Date.now() + 1,
      points: secondSegmentPoints,
      startNode: newNodeId,
      endNode: line.endNode,
      pathType: line.pathType
    };

    return [firstSegment, secondSegment];
  }

  function breakLineAtPoint(
    line: Line,
    breakPoint: [number, number],
    segmentIndex: number,
    map: any
  ) {
    // Create a new node at the break point
    const breakNode: Node = {
      id: Date.now(),
      coordinates: [breakPoint[0], breakPoint[1]],
      color: colors[nodesRef.current.length % colors.length],
    };
    
    // Split the original line into two segments
    const splitLines = splitLineAtPoint(line, breakPoint, segmentIndex, breakNode.id);
    
    // Replace the original line with the two split lines
    const updatedLines = linesRef.current.filter(l => l.id !== line.id);
    updatedLines.push(...splitLines);
    
    // Add the new break node
    const updatedNodes = [...nodesRef.current, breakNode];
    
    setNodes(updatedNodes);
    nodesRef.current = updatedNodes;
    setLines(updatedLines);
    linesRef.current = updatedLines;
    
    // Update map
    updateNodesOnMap(map, updatedNodes);
    updateLinesOnMap(map, updatedLines);
    
    console.log(`Line broken at point: [${breakPoint[0]}, ${breakPoint[1]}]`);
  }

  function finishCurrentLine() {
    setCurrentLine(null);
    currentLineRef.current = null;
    if (mapRef.current) {
      updatePreviewLine(mapRef.current, null);
      updateHighlightLine(mapRef.current, null);
    }
  }

  function updateLinesOnMap(map: any, list: Line[]) {
    const mainLines = list.filter((l) => l.pathType === "main");
    const subLines = list.filter((l) => l.pathType === "sub");

    const mainFeatures = mainLines.map((l) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: l.points },
      properties: { id: l.id },
    }));

    const subFeatures = subLines.map((l) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: l.points },
      properties: { id: l.id },
    }));

    map.getSource("main-lines")?.setData({
      type: "FeatureCollection",
      features: mainFeatures,
    });

    map.getSource("sub-lines")?.setData({
      type: "FeatureCollection",
      features: subFeatures,
    });
  }

  function updatePreviewLine(
    map: any,
    points: [number, number][] | null,
    pathType?: PathType
  ) {
    if (!points) {
      map.getSource("preview-line")?.setData({
        type: "FeatureCollection",
        features: [],
      });
      return;
    }

    const isMain = pathType === "main";
    map.getSource("preview-line")?.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: points },
          properties: {
            borderColor: isMain ? "#1e5a99" : "#2d7a4a",
            mainColor: isMain ? "#4285f4" : "#34a853",
            borderWidth: isMain ? 10 : 8,
            mainWidth: isMain ? 8 : 6,
          },
        },
      ],
    });
  }

  function updateHighlightLine(
    map: any,
    points: [number, number][] | null
  ) {
    if (!points) {
      map.getSource("highlight-line")?.setData({
        type: "FeatureCollection",
        features: [],
      });
      return;
    }

    map.getSource("highlight-line")?.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: points },
        },
      ],
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

  const mainPathCount = lines.filter((l) => l.pathType === "main").length;
  const subPathCount = lines.filter((l) => l.pathType === "sub").length;

  return (
    <div className="w-full h-screen bg-gray-900">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-gray-800/95 backdrop-blur-sm p-3 rounded-lg shadow-xl border border-gray-700">
        <div className="text-white font-bold mb-2 flex items-center gap-2">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
          Tools
        </div>
        <button
          onClick={() => setMode("view")}
          className={`px-4 py-2 rounded text-sm font-medium transition-all ${
            mode === "view"
              ? "bg-green-500 text-white shadow-lg"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          👁️ View Mode
        </button>
        <button
          onClick={() => {
            setMode("drawLines");
            setCurrentLine(null);
            if (mapRef.current) {
              updateHighlightLine(mapRef.current, null);
            }
          }}
          className={`px-4 py-2 rounded text-sm font-medium transition-all ${
            mode === "drawLines"
              ? "bg-blue-500 text-white shadow-lg"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          ✏️ Draw Roads
        </button>

        {mode === "drawLines" && (
          <div className="ml-4 flex flex-col gap-2 border-l-2 border-gray-600 pl-3">
            <div className="text-xs text-gray-400 font-semibold uppercase">
              Path Type
            </div>
            <button
              onClick={() => setCurrentPathType("main")}
              className={`px-3 py-2 rounded text-xs font-medium transition-all ${
                currentPathType === "main"
                  ? "bg-blue-500 text-white shadow-lg"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              🔵 Main Path (Blue)
            </button>
            <button
              onClick={() => setCurrentPathType("sub")}
              className={`px-3 py-2 rounded text-xs font-medium transition-all ${
                currentPathType === "sub"
                  ? "bg-green-500 text-white shadow-lg"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              🟢 Sub Path (Green)
            </button>
            <div className="text-xs text-yellow-400 mt-2">
              💡 Click anywhere on existing lines or nodes to connect and finish drawing
            </div>
          </div>
        )}

        <button
          onClick={() => setMode("dragNodes")}
          className={`px-4 py-2 rounded text-sm font-medium transition-all ${
            mode === "dragNodes"
              ? "bg-yellow-500 text-white shadow-lg"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          🎯 Drag Nodes
        </button>

        {/* New Break Lines Button */}
        <button
          onClick={() => setMode("breakLines")}
          className={`px-4 py-2 rounded text-sm font-medium transition-all ${
            mode === "breakLines"
              ? "bg-red-500 text-white shadow-lg"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          ⛔ Break Lines
        </button>

        {currentLine && (
          <button
            onClick={finishCurrentLine}
            className="px-4 py-2 rounded text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-all"
          >
            ❌ Cancel Line
          </button>
        )}
        <div className="border-t border-gray-600 my-2"></div>
        <button
          onClick={() => {
            setLines([]);
            setNodes([]);
            setCurrentLine(null);
            linesRef.current = [];
            nodesRef.current = [];
            currentLineRef.current = null;
            if (mapRef.current) {
              updateLinesOnMap(mapRef.current, []);
              updateNodesOnMap(mapRef.current, []);
              updatePreviewLine(mapRef.current, null);
              updateHighlightLine(mapRef.current, null);
            }
          }}
          className="px-4 py-2 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-all"
        >
          🗑️ Clear All
        </button>
      </div>

      <div className="absolute top-4 right-4 z-10 bg-gray-800/95 backdrop-blur-sm text-white p-4 rounded-lg shadow-xl border border-gray-700 max-w-xs">
        <h3 className="font-bold mb-3 flex items-center gap-2">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Statistics
        </h3>
        <div className="text-sm space-y-2">
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">Buildings:</span>
            <span className="font-semibold">2</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">🔵 Main Paths:</span>
            <span className="font-semibold text-blue-400">
              {mainPathCount.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">🟢 Sub Paths:</span>
            <span className="font-semibold text-green-400">
              {subPathCount.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">Total Roads:</span>
            <span className="font-semibold text-purple-400">
              {lines.length.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">Nodes:</span>
            <span className="font-semibold text-orange-400">
              {nodes.length.toLocaleString()}
            </span>
          </div>

          {currentLine && (
            <div className="text-yellow-400 mt-3 pt-3 border-t border-gray-600">
              <div className="flex items-center gap-2 mb-1">
                <span className="animate-pulse">🔴</span>
                <span className="font-semibold">
                  Drawing{" "}
                  {currentLine.pathType === "main" ? "Main Path" : "Sub Path"}
                </span>
              </div>
              {currentLine.isContinuingFromLine && (
                <div className="text-xs text-orange-300 mt-1">
                  Continuing from split point on existing line
                </div>
              )}
              <div className="text-xs text-gray-300 mt-2">
                Click on existing line or node to finish drawing
              </div>
            </div>
          )}

          {mode === "drawLines" && !currentLine && (
            <div className="text-green-400 mt-3 pt-3 border-t border-gray-600">
              <div className="text-xs">
                💡 <strong>Tip:</strong> Click anywhere on existing lines to split and continue drawing
              </div>
            </div>
          )}

          {mode === "breakLines" && (
            <div className="text-red-400 mt-3 pt-3 border-t border-gray-600">
              <div className="text-xs">
                ⚠️ <strong>Break Mode Active:</strong> Click on any line to break it into two segments
              </div>
            </div>
          )}
        </div>
      </div>

      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
}