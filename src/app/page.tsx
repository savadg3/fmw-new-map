"use client";
import React, { useEffect, useRef, useState } from "react";
import maplibregl, { Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

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
type Mode = "view" | "drawLines" | "dragNodes" | "dragBuildings" | "imageEdit";

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
  const mapRef = useRef<Map | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [mode, setMode] = useState<Mode>("view");

  const [lines, setLines] = useState<Line[]>([]);
  const [currentLine, setCurrentLine] = useState<CurrentLine | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const draggedNodeRef = useRef<Node | null>(null);
  const isDraggingNode = useRef(false);
  const lastClickTime = useRef<number>(0);

  // Image manipulation state
  const imageBoundsRef = useRef<[number, number][]>([
    // [77.58, 12.94],
    // [77.60, 12.94],
    // [77.60, 12.92],
    // [77.58, 12.92],


    [-74.0185, 40.7064],
    [-74.0173, 40.7064],
    [-74.0173, 40.7056],
    [-74.0185, 40.7056],
  ]);
  const imageId = 'custom-image-layer';

  // Refs for current state
  const linesRef = useRef<Line[]>([]);
  const nodesRef = useRef<Node[]>([]);
  const modeRef = useRef<Mode>(mode);
  const currentLineRef = useRef<CurrentLine | null>(null);

  const colors = ["#FF9800"];

  // Update refs when state changes
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

  // Image manipulation functions
  const enableImageDragResize = (map: Map) => {
    let dragStart: [number, number] | null = null;
    let isDragging = false;
    let isResizing = false;
    let isRotating = false;
    let activeCornerIndex: number | null = null;
    let initialAngle: number = 0;

    const cornerThreshold = 0.0001;
    const edgeThreshold = 0.0001;

    const disableMapInteractions = () => {
      map.dragPan.disable();
      map.scrollZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoomRotate.disable();
    };

    const enableMapInteractions = () => {
      map.dragPan.enable();
      map.scrollZoom.enable();
      map.doubleClickZoom.enable();
      map.touchZoomRotate.enable();
    };

    const isPointInBounds = (point: [number, number], bounds: [number, number][]) => {
      const [lng, lat] = point;
      const lngs = bounds.map(b => b[0]);
      const lats = bounds.map(b => b[1]);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      
      return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
    };

    const isPointNearEdge = (point: [number, number], bounds: [number, number][]) => {
      const [lng, lat] = point;
      
      for (let i = 0; i < 4; i++) {
        const p1 = bounds[i];
        const p2 = bounds[(i + 1) % 4];
        
        const A = lng - p1[0];
        const B = lat - p1[1];
        const C = p2[0] - p1[0];
        const D = p2[1] - p1[1];
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        const param = lenSq !== 0 ? dot / lenSq : -1;
        
        if (param >= 0 && param <= 1) {
          const xx = p1[0] + param * C;
          const yy = p1[1] + param * D;
          const dist = Math.sqrt((lng - xx) ** 2 + (lat - yy) ** 2);
          
          if (dist < edgeThreshold) {
            return true;
          }
        }
      }
      return false;
    };

    const getCenter = (bounds: [number, number][]) => {
      const centerLng = (bounds[0][0] + bounds[2][0]) / 2;
      const centerLat = (bounds[0][1] + bounds[2][1]) / 2;
      return [centerLng, centerLat] as [number, number];
    };

    const getAngle = (center: [number, number], point: [number, number]) => {
      return Math.atan2(point[1] - center[1], point[0] - center[0]);
    };

    const rotatePoint = (point: [number, number], center: [number, number], angle: number): [number, number] => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const dx = point[0] - center[0];
      const dy = point[1] - center[1];
      
      return [
        center[0] + (dx * cos - dy * sin),
        center[1] + (dx * sin + dy * cos)
      ];
    };

    const updateImageSource = (bounds: [number, number][]) => {
      imageBoundsRef.current = bounds;
      const src = map.getSource(imageId) as maplibregl.ImageSource;
      if (src && src.setCoordinates) {
        src.setCoordinates(bounds);
      }
    };

    const onMouseDown = (e: maplibregl.MapMouseEvent & maplibregl.EventData) => {
      const click = e.lngLat.toArray() as [number, number];
      const currentBounds = imageBoundsRef.current;

      // Only handle image interactions in imageEdit mode
      if (modeRef.current !== "imageEdit") return;

      activeCornerIndex = currentBounds.findIndex(([lng, lat]) =>
        Math.abs(lng - click[0]) < cornerThreshold &&
        Math.abs(lat - click[1]) < cornerThreshold
      );

      if (activeCornerIndex !== -1) {
        isResizing = true;
        disableMapInteractions();
        map.getCanvas().style.cursor = 'nwse-resize';
        e.preventDefault();
      } else if (isPointNearEdge(click, currentBounds)) {
        isRotating = true;
        const center = getCenter(currentBounds);
        initialAngle = getAngle(center, click);
        disableMapInteractions();
        map.getCanvas().style.cursor = 'crosshair';
        e.preventDefault();
      } else if (isPointInBounds(click, currentBounds)) {
        isDragging = true;
        dragStart = click;
        disableMapInteractions();
        map.getCanvas().style.cursor = 'move';
        e.preventDefault();
      }
    };

    const onMouseMove = (e: maplibregl.MapMouseEvent & maplibregl.EventData) => {
      const current = e.lngLat.toArray() as [number, number];
      const currentBounds = imageBoundsRef.current;

      // Handle cursor changes for image editing
      if (modeRef.current === "imageEdit") {
        if (!isDragging && !isResizing && !isRotating) {
          const nearCorner = currentBounds.some(([lng, lat]) =>
            Math.abs(lng - current[0]) < cornerThreshold &&
            Math.abs(lat - current[1]) < cornerThreshold
          );
          
          if (nearCorner) {
            map.getCanvas().style.cursor = 'nwse-resize';
          } else if (isPointNearEdge(current, currentBounds)) {
            map.getCanvas().style.cursor = 'crosshair';
          } else if (isPointInBounds(current, currentBounds)) {
            map.getCanvas().style.cursor = 'move';
          } else {
            map.getCanvas().style.cursor = '';
          }
          return;
        }
      }

      // Image manipulation logic
      if (isDragging && dragStart) {
        const deltaLng = current[0] - dragStart[0];
        const deltaLat = current[1] - dragStart[1];
        const moved = currentBounds.map(([lng, lat]) => [lng + deltaLng, lat + deltaLat]) as [number, number][];
        
        updateImageSource(moved);
        dragStart = current;
      }

      if (isResizing && activeCornerIndex !== null) {
        const center = getCenter(currentBounds);
        const dx = current[0] - center[0];
        const dy = current[1] - center[1];
        const newDist = Math.sqrt(dx * dx + dy * dy);
        
        const origDx = currentBounds[activeCornerIndex][0] - center[0];
        const origDy = currentBounds[activeCornerIndex][1] - center[1];
        const origDist = Math.sqrt(origDx * origDx + origDy * origDy);
        
        const scale = newDist / origDist;
        
        const updated = currentBounds.map(corner => {
          const cdx = corner[0] - center[0];
          const cdy = corner[1] - center[1];
          return [
            center[0] + cdx * scale,
            center[1] + cdy * scale
          ] as [number, number];
        });
        
        updateImageSource(updated);
      }

      if (isRotating) {
        const center = getCenter(currentBounds);
        const currentAngle = getAngle(center, current);
        const rotationAngle = currentAngle - initialAngle;
        
        const rotated = currentBounds.map(corner => 
          rotatePoint(corner, center, rotationAngle)
        ) as [number, number][];
        
        updateImageSource(rotated);
        initialAngle = currentAngle;
      }
    };

    const onMouseUp = () => {
      if (isDragging || isResizing || isRotating) {
        enableMapInteractions();
      }
      isDragging = false;
      isResizing = false;
      isRotating = false;
      dragStart = null;
      activeCornerIndex = null;
      if (modeRef.current !== "imageEdit") {
        map.getCanvas().style.cursor = '';
      }
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    map.on('mouseout', onMouseUp);
  };

  // Node and line functions from first code
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

  function updateLinesOnMap(map: Map, list: Line[]) {
    const features = list.map((l) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: l.points },
      properties: { id: l.id },
    }));
    (map.getSource("lines") as maplibregl.GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features,
    });
  }

  function updatePreviewLine(map: Map, points: [number, number][] | null) {
    if (!points) {
      (map.getSource("preview-line") as maplibregl.GeoJSONSource)?.setData({
        type: "FeatureCollection",
        features: [],
      });
      return;
    }

    (map.getSource("preview-line") as maplibregl.GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: points },
          properties: {},
        },
      ],
    });
  }

  function updateNodesOnMap(map: Map, list: Node[]) {
    const features = list.map((n) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: n.coordinates },
      properties: { color: n.color, id: n.id },
    }));
    (map.getSource("nodes") as maplibregl.GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features,
    });
  }

  useEffect(() => {
    if (viewMode !== "map" || !mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style:
        "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
      center: [-74.0179, 40.706],
      zoom: 17,
      // pitch: 60,
      // bearing: -17.6,
      // maxBounds: [
      //   [-74.019, 40.705],
      //   [-74.016, 40.707],
      // ],
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

      // Add image layer
      map.addSource(imageId, {
        type: 'image',
        url: '/Bee-icon.png',
        coordinates: imageBoundsRef.current,
      });

      map.addLayer({
        id: imageId,
        type: 'raster',
        source: imageId,
        paint: { 'raster-opacity': 0.8 },
      });

      // Enable image drag/resize
      enableImageDragResize(map);

      // Google Maps style road layers
      map.addSource("lines", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Outer border (darker blue)
      map.addLayer({
        id: "lines-border",
        type: "line",
        source: "lines",
        paint: {
          "line-color": "#1e5a99",
          "line-width": 10,
          "line-opacity": 0.8,
        },
      });

      // Main road (bright blue)
      map.addLayer({
        id: "lines-main",
        type: "line",
        source: "lines",
        paint: {
          "line-color": "#4285f4",
          "line-width": 8,
        },
      });

      // Center line (lighter blue)
      map.addLayer({
        id: "lines-center",
        type: "line",
        source: "lines",
        paint: {
          "line-color": "#8ab4f8",
          "line-width": 2,
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
          "line-color": "#1e5a99",
          "line-width": 10,
          "line-opacity": 0.5,
          "line-dasharray": [2, 2],
        },
      });

      map.addLayer({
        id: "preview-main",
        type: "line",
        source: "preview-line",
        paint: {
          "line-color": "#4285f4",
          "line-width": 8,
          "line-opacity": 0.7,
          "line-dasharray": [2, 2],
        },
      });

      // Nodes
      map.addSource("nodes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Node shadow/glow
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

      // Node main
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
    });

    // Combined event handlers
    map.on("click", (e: maplibregl.MapMouseEvent) => {
      const currentMode = modeRef.current;
      
      if (currentMode === "drawLines") {
        const now = Date.now();
        const isDoubleClick = now - lastClickTime.current < 300;
        lastClickTime.current = now;

        if (isDoubleClick && currentLineRef.current) {
          setCurrentLine(null);
          currentLineRef.current = null;
          updatePreviewLine(map, null);
          return;
        }

        const clickedNode = findNodeAtPoint(e.lngLat, nodesRef.current);

        if (clickedNode) {
          if (!currentLineRef.current) {
            const newCurrentLine = {
              start: clickedNode.id,
              points: [clickedNode.coordinates],
              nodeIds: [clickedNode.id],
            };
            setCurrentLine(newCurrentLine);
            currentLineRef.current = newCurrentLine;
          } else {
            if (clickedNode.id === currentLineRef.current.start) {
              setCurrentLine(null);
              currentLineRef.current = null;
              updatePreviewLine(map, null);
              return;
            } else {
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
            };
            const updatedLines = [...linesRef.current, newLine];
            setLines(updatedLines);
            linesRef.current = updatedLines;

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
      }
    });

    map.on("mousemove", (e: maplibregl.MapMouseEvent) => {
      const currentMode = modeRef.current;
      
      if (currentMode === "drawLines" && currentLineRef.current) {
        const previewPoints = [
          ...currentLineRef.current.points,
          [e.lngLat.lng, e.lngLat.lat],
        ];
        updatePreviewLine(map, previewPoints);
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

      if (currentMode === "dragNodes") {
        const node = findNodeAtPoint(e.lngLat, nodesRef.current);
        map.getCanvas().style.cursor = node ? "pointer" : "";
      }
    });

    map.on("mousedown", (e: maplibregl.MapMouseEvent) => {
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

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [viewMode]);

  return (
    <div className="w-full h-screen bg-gray-900">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-gray-800/95 backdrop-blur-sm p-3 rounded-lg shadow-xl border border-gray-700">
        <div className="text-white font-bold mb-2 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
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
          }}
          className={`px-4 py-2 rounded text-sm font-medium transition-all ${
            mode === "drawLines"
              ? "bg-blue-500 text-white shadow-lg"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          ✏️ Draw Roads
        </button>
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
        <button
          onClick={() => setMode("imageEdit")}
          className={`px-4 py-2 rounded text-sm font-medium transition-all ${
            mode === "imageEdit"
              ? "bg-purple-500 text-white shadow-lg"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          🖼️ Edit Image
        </button>
        {currentLine && (
          <button
            onClick={() => {
              setCurrentLine(null);
              currentLineRef.current = null;
              if (mapRef.current) {
                updatePreviewLine(mapRef.current, null);
              }
            }}
            className="px-4 py-2 rounded text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-all"
          >
            ❌ Cancel Line
          </button>
        )}
      </div>

      <div className="absolute top-4 right-4 z-10 bg-gray-800/95 backdrop-blur-sm text-white p-4 rounded-lg shadow-xl border border-gray-700">
        <h3 className="font-bold mb-3 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Info
        </h3>
        <div className="text-sm space-y-2">
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">Buildings:</span>
            <span className="font-semibold">2</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">Roads:</span>
            <span className="font-semibold text-blue-400">{lines.length}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">Nodes:</span>
            <span className="font-semibold text-orange-400">{nodes.length}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">Mode:</span>
            <span className="font-semibold text-purple-400 capitalize">{mode}</span>
          </div>
          {currentLine && (
            <div className="text-yellow-400 mt-3 pt-3 border-t border-gray-600">
              <div className="flex items-center gap-2 mb-1">
                <span className="animate-pulse">🔴</span>
                <span className="font-semibold">Drawing...</span>
              </div>
              <div className="text-xs text-gray-300 mt-2">
                Double-click or click start node to finish
              </div>
            </div>
          )}
          {mode === "imageEdit" && (
            <div className="text-green-400 mt-3 pt-3 border-t border-gray-600">
              <div className="flex items-center gap-2 mb-1">
                <span>🖼️</span>
                <span className="font-semibold">Image Edit Mode</span>
              </div>
              <div className="text-xs text-gray-300 mt-2">
                Drag to move, corners to resize, edges to rotate
              </div>
            </div>
          )}
        </div>
      </div>

      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
}