"use client";
import { useAppSelector } from "@/store/hooks";
import { Map } from "maplibre-gl";
import React, { useCallback, useEffect, useRef, useState } from "react";

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

export type PathType = "main" | "sub";

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
  splitPoint?: [number, number];
}

interface MapImage {
  id: string;
  url: string;
  coordinates: [[number, number], [number, number], [number, number], [number, number]]; // Top-left, top-right, bottom-right, bottom-left
  opacity: number;
}

interface DrawingShape {
  id: string;
  type: 'line' | 'polygon' | 'circle';
  coordinates: [number, number][];
  color: string;
  width?: number;
}

type Mode = "view" | "drawLines" | "dragNodes" | "dragBuildings" | "breakLines" | "moveImage" | "resizeImage" | "selectStartNode" | "selectEndNode";

interface ShortestPathResult {
  path: number[];
  distance: number;
  lines: Line[];
}

// Add these new interfaces
interface GraphNode {
  id: number;
  coordinates: [number, number];
}

interface GraphEdge {
  from: number;
  to: number;
  weight: number;
  pathType: PathType;
  lineId: number;
}

interface ShortestPathResult {
  path: number[]; // node IDs
  distance: number;
  lines: Line[];
}

const buildingsData: Building[] = [
  
];

export default function NavigatorPage() {
  const { selectedLocation } = useAppSelector((state) => state.location);

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [currentPathType, setCurrentPathType] = useState<PathType>("main");
  
  const [lines, setLines] = useState<Line[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [currentLine, setCurrentLine] = useState<CurrentLine | null>(null);
  const [mapImage, setMapImage] = useState<MapImage | null>(null);
  const [drawingShapes, setDrawingShapes] = useState<DrawingShape[]>([]);
  const [currentDrawing, setCurrentDrawing] = useState<[number, number][]>([]);
  const [startNode, setStartNode] = useState<number | null>(null);
  const [endNode, setEndNode] = useState<number | null>(null);
  const [shortestPath, setShortestPath] = useState<ShortestPathResult | null>(null);
  const [isFindingPath, setIsFindingPath] = useState(false);
  
  const draggedNodeRef = useRef<Node | null>(null);
  const isDraggingNode = useRef(false);
  const lastClickTime = useRef<number>(0);
  
  const linesRef = useRef<Line[]>([]);
  const nodesRef = useRef<Node[]>([]);
  const modeRef = useRef<Mode>(mode);
  const currentLineRef = useRef<CurrentLine | null>(null);
  const currentPathTypeRef = useRef<PathType>(currentPathType);
  const mapImageRef = useRef<MapImage | null>(null);
  const drawingShapesRef = useRef<DrawingShape[]>([]);
  const currentDrawingRef = useRef<[number, number][]>([]);
  
  const startNodeRef = useRef<number | null>(null);
  const endNodeRef = useRef<number | null>(null);
  const shortestPathRef = useRef<ShortestPathResult | null>(null);
  
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
    finishCurrentLine()
  }, [currentPathType]);
  
  useEffect(() => {
    mapImageRef.current = mapImage;
  }, [mapImage]);
  
  useEffect(() => {
    drawingShapesRef.current = drawingShapes;
  }, [drawingShapes]);
  
  useEffect(() => {
    currentDrawingRef.current = currentDrawing;
  }, [currentDrawing]);
  
  useEffect(() => {
    startNodeRef.current = startNode;
  }, [startNode]);
  
  useEffect(() => {
    endNodeRef.current = endNode;
  }, [endNode]);
  
  useEffect(() => {
    shortestPathRef.current = shortestPath;
  }, [shortestPath]);
  
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    
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
      
      if(selectedLocation){
        const { longitude, latitude } = selectedLocation;
        map.setCenter([longitude, latitude]);
      }else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { longitude, latitude } = position.coords;
            
            // Center the map on user's location
            map.setCenter([longitude, latitude]);
            
            // Add a marker for current location
            // new maplibregl.Marker({ color: "blue" })
            //   .setLngLat([longitude, latitude])
            //   .setPopup(new maplibregl.Popup().setText("You are here"))
            //   .addTo(map);
          },
          (error) => {
            console.error("Error getting location:", error);
          }
        );
      } else {
        console.warn("Geolocation not supported");
      }
      
      map.on("load", () => {
        // Add building extrusions
        const buildingsData: Building[] = JSON.parse(localStorage.getItem("buildings") || "[]");
        
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
        
        // Line highlight layer
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
        
        // Drawing shapes layer
        map.addSource("drawing-shapes", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        
        map.addLayer({
          id: "drawing-shapes-line",
          type: "line",
          source: "drawing-shapes",
          filter: ["==", ["get", "shapeType"], "line"],
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["get", "width"],
          },
        });
        
        map.addLayer({
          id: "drawing-shapes-fill",
          type: "fill",
          source: "drawing-shapes",
          filter: ["==", ["get", "shapeType"], "polygon"],
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": 0.3,
          },
        });
        
        map.addLayer({
          id: "drawing-shapes-outline",
          type: "line",
          source: "drawing-shapes",
          filter: ["==", ["get", "shapeType"], "polygon"],
          paint: {
            "line-color": ["get", "color"],
            "line-width": 2,
          },
        });
        
        // Preview drawing layer
        map.addSource("preview-drawing", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        
        map.addLayer({
          id: "preview-drawing-line",
          type: "line",
          source: "preview-drawing",
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["get", "width"],
            "line-dasharray": [2, 2],
          },
        });
        
        // Resize handles layer
        map.addSource("resize-handles", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        
        map.addLayer({
          id: "resize-handles",
          type: "circle",
          source: "resize-handles",
          paint: {
            "circle-radius": 8,
            "circle-color": "#ffffff",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#4285f4",
          },
        });
        
        map.addSource("shortest-path", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        
        map.addLayer({
          id: "shortest-path-line",
          type: "line",
          source: "shortest-path",
          paint: {
            "line-color": "#FF00FF",
            "line-width": 6,
            "line-opacity": 0.8,
            "line-dasharray": [1, 0], // Solid line
          },
        });
      });

      map.on("click", (e: any) => {
        const currentMode = modeRef.current;
        

        if (currentMode === "selectStartNode" || currentMode === "selectEndNode") {
          const clickedNode = findNodeAtPoint(e.lngLat, nodesRef.current);
          if (clickedNode) {
            if (currentMode === "selectStartNode") {
              setStartNode(clickedNode.id);
              setMode("selectEndNode"); // Automatically switch to end node selection
            } else {
              setEndNode(clickedNode.id);
              setMode("view");
              
              // Calculate shortest path
              if (startNodeRef.current && clickedNode.id) {
                setIsFindingPath(true);
                setTimeout(() => {
                  const pathResult = findShortestPath(startNodeRef.current!, clickedNode.id!);
                  setShortestPath(pathResult);
                  shortestPathRef.current = pathResult;
                  highlightShortestPath(map, pathResult);
                  setIsFindingPath(false);
                }, 0);
              }
            }
          }
          return;
        }
        
        if (currentMode === "breakLines") {
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
        
        if (currentLineRef.current && (clickedLineInfo || (clickedNode && clickedNode.id !== currentLineRef.current.start))) {
          
          let endNode: Node;
          // console.log({clickedNode,clickedLineInfo,currentLineRef:currentLineRef.current}, clickedNode.id , currentLineRef.current.start,"sdfnsdjkf");
          if (clickedNode && clickedNode?.id ) {
            endNode = clickedNode;
          } else if (clickedLineInfo) {
            const { line, closestPoint, segmentIndex } = clickedLineInfo;            
            endNode = {
              id: Date.now(),
              coordinates: [closestPoint[0], closestPoint[1]],
              color: colors[nodesRef.current.length % colors.length],
            };
            
            const splitLines = splitLineAtPoint(line, closestPoint, segmentIndex, endNode.id);
            const updatedLines = linesRef.current.filter(l => l.id !== line.id);
            updatedLines.push(...splitLines);
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
          
          // if (clickedNode && clickedNode.id !== currentLineRef.current.start) {
          //   endNode = clickedNode;
          //   console.log("here1");
          // } else if (clickedLineInfo) {
          //   const { line, closestPoint, segmentIndex } = clickedLineInfo;
          //   console.log("here2");
          
          //   endNode = {
          //     id: Date.now(),
          //     coordinates: [closestPoint[0], closestPoint[1]],
          //     color: colors[nodesRef.current.length % colors.length],
          //   };
          
          //   const splitLines = splitLineAtPoint(line, closestPoint, segmentIndex, endNode.id);
          //   const updatedLines = linesRef.current.filter(l => l.id !== line.id);
          //   updatedLines.push(...splitLines);
          //   const updatedNodes = [...nodesRef.current, endNode];
          
          //   setNodes(updatedNodes);
          //   nodesRef.current = updatedNodes;
          //   setLines(updatedLines);
          //   linesRef.current = updatedLines;
          
          //   updateNodesOnMap(map, updatedNodes);
          //   updateLinesOnMap(map, updatedLines);
          // } else {
            //   return;
          // }
          
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
          finishCurrentLine();
          updateLinesOnMap(map, updatedLines);
          return;
        }
        
        if (clickedLineInfo && !clickedNode && !currentLineRef.current) {
          const { line, closestPoint, segmentIndex } = clickedLineInfo;
          
          const splitNode: Node = {
            id: Date.now(),
            coordinates: [closestPoint[0], closestPoint[1]],
            color: colors[nodesRef.current.length % colors.length],
          };
          
          const splitLines = splitLineAtPoint(line, closestPoint, segmentIndex, splitNode.id);
          const updatedLines = linesRef.current.filter(l => l.id !== line.id);
          updatedLines.push(...splitLines);
          const updatedNodes = [...nodesRef.current, splitNode];
          
          setNodes(updatedNodes);
          nodesRef.current = updatedNodes;
          setLines(updatedLines);
          linesRef.current = updatedLines;
          
          const newCurrentLine: CurrentLine = {
            start: splitNode.id,
            points: [splitNode.coordinates],
            nodeIds: [splitNode.id],
            pathType: currentPathTypeRef.current,
            isContinuingFromLine: true,
            continuedLineId: line.id,
            splitPoint: closestPoint
          };
          
          setCurrentLine(newCurrentLine);
          currentLineRef.current = newCurrentLine;
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
            if (clickedNode.id === currentLineRef.current.start) {
              const newLine: Line = {
                id: Date.now(),
                points: [
                  currentLineRef.current.points[currentLineRef.current.points.length - 1],
                  clickedNode.coordinates,
                ],
                startNode: currentLineRef.current.nodeIds[currentLineRef.current.nodeIds.length - 1],
                endNode: clickedNode.id,
                pathType: currentLineRef.current.pathType,
              };
              const updatedLines = [...linesRef.current, newLine];
              setLines(updatedLines);
              linesRef.current = updatedLines;
              updateLinesOnMap(map, updatedLines);
              finishCurrentLine();
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
              pathType: currentPathTypeRef.current,
            };
            setCurrentLine(newCurrentLine);
            currentLineRef.current = newCurrentLine;
          } else {
            const newLine: Line = {
              id: Date.now(),
              points: [
                currentLineRef.current.points[currentLineRef.current.points.length - 1],
                newNode.coordinates,
              ],
              startNode: currentLineRef.current.nodeIds[currentLineRef.current.nodeIds.length - 1],
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
        if (currentMode === "dragNodes" && isDraggingNode.current) {
          highlightShortestPath(map, null);
        }
        if (currentMode === "drawLines" && !currentLineRef.current) {
          const lineInfo = findLineAtPoint(e.lngLat, linesRef.current);
          map.getCanvas().style.cursor = lineInfo ? "crosshair" : "";
        }
        
        if (currentMode === "breakLines") {
          const lineInfo = findLineAtPoint(e.lngLat, linesRef.current);
          map.getCanvas().style.cursor = lineInfo ? "no-drop" : "";
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
      
      map.on("mousedown", (e: any) => {
        const currentMode = modeRef.current;
        
        if (currentMode === "dragNodes") {
          const threshold = getDynamicThreshold(map, 10);
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
        const currentMode = modeRef.current;
        if (isDraggingNode.current) {
          isDraggingNode.current = false;
          draggedNodeRef.current = null;
          if (mapRef.current) {
            mapRef.current.getCanvas().style.cursor = "";
            mapRef.current.dragPan.enable();
          }

          if(startNodeRef.current && endNodeRef.current && currentMode === "dragNodes"){
            const pathResult = findShortestPath(startNodeRef.current!, endNodeRef.current);
            setShortestPath(pathResult);
            shortestPathRef.current = pathResult;
            highlightShortestPath(map, pathResult);
            setIsFindingPath(false);
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
  }, [selectedLocation]);

  // Dynamic threshold based on screen pixels and zoom level
    const getDynamicThreshold = useCallback((map: Map, pixelThreshold: number = 10): number => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      
      const metersPerPixel = 40075016.686 * Math.abs(Math.cos(center.lat * Math.PI / 180)) / Math.pow(2, zoom + 8);
      const degreesPerMeter = 1 / 111320;
      const thresholdInMeters = pixelThreshold * metersPerPixel;
      const thresholdInDegrees = thresholdInMeters * degreesPerMeter;
      
      return thresholdInDegrees;
    }, []);
  
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
    
    const firstSegment: Line = {
      id: Date.now(),
      points: firstSegmentPoints,
      startNode: line.startNode,
      endNode: newNodeId,
      pathType: line.pathType
    };
    
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
    const breakNode: Node = {
      id: Date.now(),
      coordinates: [breakPoint[0], breakPoint[1]],
      color: colors[nodesRef.current.length % colors.length],
    };
    
    const splitLines = splitLineAtPoint(line, breakPoint, segmentIndex, breakNode.id);
    const updatedLines = linesRef.current.filter(l => l.id !== line.id);
    updatedLines.push(...splitLines);
    const updatedNodes = [...nodesRef.current, breakNode];
    
    setNodes(updatedNodes);
    nodesRef.current = updatedNodes;
    setLines(updatedLines);
    linesRef.current = updatedLines;
    
    updateNodesOnMap(map, updatedNodes);
    updateLinesOnMap(map, updatedLines);
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
  
  function buildGraph(): Map<number, GraphEdge[]> {
    const graph = new Map<number, GraphEdge[]>();
    
    // Initialize graph with all nodes
    nodesRef.current.forEach(node => {
      graph.set(node.id, []);
    });
    
    // Add edges from lines
    linesRef.current.forEach(line => {
      // Calculate distance between points (you can use Haversine for real distances)
      const distance = calculateLineDistance(line.points);
      
      // Apply priority: main paths have lower weight (higher priority)
      const weight = line.pathType === "main" ? distance * 0.8 : distance;
      
      // Add edge from start to end
      if (!graph.has(line.startNode)) {
        graph.set(line.startNode, []);
      }
      graph.get(line.startNode)!.push({
        from: line.startNode,
        to: line.endNode,
        weight,
        pathType: line.pathType,
        lineId: line.id
      });
      
      // Add edge from end to start (undirected graph)
      if (!graph.has(line.endNode)) {
        graph.set(line.endNode, []);
      }
      graph.get(line.endNode)!.push({
        from: line.endNode,
        to: line.startNode,
        weight,
        pathType: line.pathType,
        lineId: line.id
      });
    });
    
    return graph;
  }
  
  function calculateLineDistance(points: [number, number][]): number {
    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const [lng1, lat1] = points[i];
      const [lng2, lat2] = points[i + 1];
      // Simple Euclidean distance (for small areas, good enough)
      const dx = lng2 - lng1;
      const dy = lat2 - lat1;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }
    return totalDistance;
  }
  
  function findShortestPath(startId: number, endId: number): ShortestPathResult | null {
    const graph = buildGraph();
    
    
    if (!graph.has(startId) || !graph.has(endId)) {
      return null;
    }
    
    // Priority queue using a min-heap (simulated with array and sorting)
    const distances = new Map<number, number>();
    const previous = new Map<number, { node: number; edge: GraphEdge | null }>();
    const visited = new Set<number>();
    
    // Initialize distances
    graph.forEach((_, nodeId) => {
      distances.set(nodeId, Infinity);
    });
    distances.set(startId, 0);
    
    const unvisited = Array.from(graph.keys());
    
    while (unvisited.length > 0) {
      // Get node with smallest distance
      unvisited.sort((a, b) => distances.get(a)! - distances.get(b)!);
      const currentNode = unvisited.shift()!;
      
      if (currentNode === endId) {
        break;
      }
      
      if (distances.get(currentNode) === Infinity) {
        break;
      }
      
      visited.add(currentNode);
      
      // Update distances to neighbors
      const edges = graph.get(currentNode) || [];
      for (const edge of edges) {
        if (visited.has(edge.to)) continue;
        
        const newDistance = distances.get(currentNode)! + edge.weight;
        if (newDistance < distances.get(edge.to)!) {
          distances.set(edge.to, newDistance);
          previous.set(edge.to, { node: currentNode, edge });
        }
      }
    }
    
    // Reconstruct path
    if (distances.get(endId) === Infinity) {
      return null;
    }
    
    const path: number[] = [];
    const pathLines: Line[] = [];
    let current: number | undefined = endId;
    
    
    while (current !== undefined) {
      path.unshift(current);
      const prev = previous.get(current);
      if (prev && prev.edge) {
        // Find the line for this edge
        const line = linesRef.current.find(l => l.id === prev.edge.lineId);
        if (line) {
          pathLines.unshift(line);
        }
      }
      current = prev?.node;
    }
    
    return {
      path,
      distance: distances.get(endId)!,
      lines: pathLines
    };
  }
  
  // Function to highlight the shortest path on the map
  function highlightShortestPath(map: any, pathResult: ShortestPathResult | null) {
    if (!pathResult) {
      map.getSource("shortest-path")?.setData({
        type: "FeatureCollection",
        features: [],
      });
      return;
    }
    
    // Create a continuous line from the path
    const pathCoordinates: [number, number][] = [];
    
    pathResult.path.forEach(nodeId => {
      const node = nodesRef.current.find(n => n.id === nodeId);
      if (node) {
        pathCoordinates.push(node.coordinates);
      }
    });
    
    // console.log(pathCoordinates,"pathCoordinates");
    map.getSource("shortest-path")?.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: pathCoordinates
          },
          properties: {}
        }
      ],
    });
  }
  
  // Function to clear the current path finding
  function clearPathFinding() {
    setStartNode(null);
    setEndNode(null);
    setShortestPath(null);
    startNodeRef.current = null;
    endNodeRef.current = null;
    shortestPathRef.current = null;
    if (mapRef.current) {
      highlightShortestPath(mapRef.current, null);
    }
  }
  
  function startPathFinding() {
    clearPathFinding();
    setMode("selectStartNode");
  }
  
    return (
      <div className="w-full h-screen bg-gray-900">
      
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-gray-800/95 backdrop-blur-sm p-3 rounded-lg shadow-xl border border-gray-700 max-h-[calc(100vh-2rem)] overflow-y-auto">
         
          <div className="">
        
            <button
              onClick={() => {
                setMode("drawLines");
                setCurrentLine(null);
                if (mapRef.current) {
                  updateHighlightLine(mapRef.current, null); 
                }
              }}
              className={`w-full px-4 py-2 rounded text-sm font-medium transition-all mb-2 ${
                mode === "drawLines"
                ? "bg-blue-500 text-white shadow-lg"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
             Draw Roads
            </button>
        
            {mode === "drawLines" && (
              <div className="ml-2 flex flex-col gap-2  pl-3 mb-2"> 
                <button
                  onClick={() => {
                    setCurrentPathType("main")
                  }} 
                  className={`px-3 py-2 rounded text-xs font-medium transition-all ${
                    currentPathType === "main"
                    ? "bg-blue-500 text-white shadow-lg"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  Main Path
                </button>
                <button
                  onClick={() => setCurrentPathType("sub")}
                  className={`px-3 py-2 rounded text-xs font-medium transition-all ${
                    currentPathType === "sub"
                    ? "bg-green-500 text-white shadow-lg"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                Sub Path
                </button>
              </div>
            )}
            
            <button
              onClick={() => setMode("dragNodes")}
              className={`w-full px-4 py-2 rounded text-sm font-medium transition-all mb-2 ${
                mode === "dragNodes"
                ? "bg-yellow-500 text-white shadow-lg"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              Drag Nodes
            </button>
          </div>
      
          {currentLine && (
            <button
            onClick={finishCurrentLine}
            className="px-4 py-2 rounded text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-all"
            >
              Cancel Line
            </button>
          )}
      
          {linesRef.current && linesRef.current?.length > 1 && (<button
            onClick={startPathFinding}
            disabled={isFindingPath}
            className={`w-full px-4 py-2 rounded text-sm font-medium transition-all mb-2 ${
              isFindingPath
              ? "bg-gray-600 text-gray-400 cursor-not-allowed"
              : "bg-purple-500 text-white hover:bg-purple-600"
            }`}
          >
              {isFindingPath ? "Finding Path..." : " Find Shortest Path"}
          </button>)}

          {(mode === "selectStartNode" || mode === "selectEndNode") && (
            <div className="text-xs text-yellow-400 bg-yellow-900 p-2 rounded">
              {mode === "selectStartNode" ? "Click on a node to set START point" : "Click on a node to set END point"}
            </div>
          )}
      
          <div className="border-t border-gray-600 my-2"></div>
          <button
            onClick={() => {
              // setLines([]);
              // setNodes([]);
              // setCurrentLine(null);
              // setMapImage(null);
              // setDrawingShapes([]);
              // setCurrentDrawing([]);
              // linesRef.current = [];
              // nodesRef.current = [];
              // currentLineRef.current = null;
              // mapImageRef.current = null;
              // drawingShapesRef.current = [];
              // currentDrawingRef.current = [];
              // if (mapRef.current) {
              //   updateLinesOnMap(mapRef.current, []);
              //   updateNodesOnMap(mapRef.current, []);
              //   updatePreviewLine(mapRef.current, null);
              //   updateHighlightLine(mapRef.current, null);
              
              // }
              
              setLines([]);
              setNodes([]);
              setCurrentLine(null);
              setMapImage(null);
              setDrawingShapes([]);
              setCurrentDrawing([]);
              setStartNode(null);
              setEndNode(null);
              setShortestPath(null);
              linesRef.current = [];
              nodesRef.current = [];
              currentLineRef.current = null;
              mapImageRef.current = null;
              drawingShapesRef.current = [];
              currentDrawingRef.current = [];
              startNodeRef.current = null;
              endNodeRef.current = null;
              shortestPathRef.current = null;
              if (mapRef.current) {
                updateLinesOnMap(mapRef.current, []);
                updateNodesOnMap(mapRef.current, []);
                updatePreviewLine(mapRef.current, null);
                updateHighlightLine(mapRef.current, null);
                highlightShortestPath(mapRef.current, null);
              }
            }}
            className="px-4 py-2 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-all"
          >
            Clear All
          </button> 
        </div>

        <div ref={mapContainer} className="w-full h-full" />
      </div>
    );
}