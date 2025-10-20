"use client";
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import maplibregl, { Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

declare global {
  interface Window {
    maplibregl: any;
  }
}

interface Building {
  id: string;
  height: number;
  polygon: [number, number][];
}

interface Point {
  lng: number;
  lat: number;
}

interface Line {
  id: number;
  points: [number, number][];
}

interface Node {
  id: number;
  coordinates: [number, number];
  color: string;
}

interface PathLine {
  id: number;
  points: [number, number][];
  startNode: number;
  endNode: number;
  pathType: PathType;
}

interface CurrentPathLine {
  start: number;
  points: [number, number][];
  nodeIds: number[];
  pathType: PathType;
  isContinuingFromLine?: boolean;
  continuedLineId?: number;
  splitPoint?: [number, number];
}

type Mode = "view" | "drawBuildings" | "imageEdit" | "dragNodes" | "drawPaths";
type PathType = "main" | "sub";

function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return function(this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export default function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [currentPathType, setCurrentPathType] = useState<PathType>("main");

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [currentLines, setCurrentLines] = useState<Line[]>([]);
  const [currentLine, setCurrentLine] = useState<Line | null>(null);
  const [currentHeight, setCurrentHeight] = useState<number>(10);
  const [measurement, setMeasurement] = useState<string>('');
  const [showBuildingPanel, setShowBuildingPanel] = useState(true);

  const [pathLines, setPathLines] = useState<PathLine[]>([]);
  const [currentPathLine, setCurrentPathLine] = useState<CurrentPathLine | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);

  const uploadedImageRef = useRef<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const imageBoundsRef = useRef<[number, number][]>([
    [-74.0185, 40.7064],
    [-74.0173, 40.7064],
    [-74.0173, 40.7056],
    [-74.0185, 40.7056],
  ]);
  const imageId = 'custom-image-layer';

  const drawingSourceId = 'drawing-source';
  const previewSourceId = 'preview-source';
  const buildingsSourceId = 'buildings-source';

  const modeRef = useRef<Mode>(mode);
  const buildingsRef = useRef<Building[]>(buildings);
  const currentLinesRef = useRef<Line[]>(currentLines);
  const currentLineRef = useRef<Line | null>(currentLine);
  const currentPathLineRef = useRef<CurrentPathLine | null>(currentPathLine);
  const pathLinesRef = useRef<PathLine[]>(pathLines);
  const nodesRef = useRef<Node[]>(nodes);
  const lastClickTime = useRef<number>(0);
  const isDraggingNode = useRef(false);
  const draggedNodeRef = useRef<Node | null>(null);
  
  const eventListenersRef = useRef<{
    mousedown?: (e: any) => void;
    mousemove?: (e: any) => void;
    mouseup?: (e: any) => void;
    mouseout?: (e: any) => void;
  }>({});

  const colors = ["#FF9800"];

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { buildingsRef.current = buildings; }, [buildings]);
  useEffect(() => { currentLinesRef.current = currentLines; }, [currentLines]);
  useEffect(() => { currentLineRef.current = currentLine; }, [currentLine]);
  useEffect(() => { currentPathLineRef.current = currentPathLine; }, [currentPathLine]);
  useEffect(() => { pathLinesRef.current = pathLines; }, [pathLines]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string;
      
      const img = new Image();
      img.onload = () => {
        uploadedImageRef.current = imageUrl;
        setImageSize({ width: img.width, height: img.height });
        
        if (mapRef.current) {
          const center = mapRef.current.getCenter();
          const zoom = mapRef.current.getZoom();
          calculateImageBounds(center.lng, center.lat, img.width, img.height, zoom);
        }
      };
      img.src = imageUrl;
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }, []);

  const calculateImageBounds = useCallback((centerLng: number, centerLat: number, imgWidth: number, imgHeight: number, zoom: number) => {
    const scale = Math.pow(2, 17 - zoom);
    const aspectRatio = imgWidth / imgHeight;
    
    let widthDegrees = (imgWidth / 100000) * scale;
    let heightDegrees = (imgHeight / 100000) * scale;
    
    if (aspectRatio > 1) {
      heightDegrees = widthDegrees / aspectRatio;
    } else {
      widthDegrees = heightDegrees * aspectRatio;
    }
    
    const halfWidth = widthDegrees / 2;
    const halfHeight = heightDegrees / 2;
    
    const newBounds: [number, number][] = [
      [centerLng - halfWidth, centerLat + halfHeight],
      [centerLng + halfWidth, centerLat + halfHeight],
      [centerLng + halfWidth, centerLat - halfHeight],
      [centerLng - halfWidth, centerLat - halfHeight],
    ];
    
    imageBoundsRef.current = newBounds;
    
    if (mapRef.current) {
      updateImageSource(mapRef.current, newBounds, uploadedImageRef.current!);
    }
  }, []);

  const updateImageSource = useCallback((map: Map, bounds: [number, number][], imageUrl: string) => {
    if (map.getLayer(imageId)) map.removeLayer(imageId);
    if (map.getSource(imageId)) map.removeSource(imageId);
    
    map.addSource(imageId, {
      type: 'image',
      url: imageUrl,
      coordinates: bounds,
    });

    map.addLayer({
      id: imageId,
      type: 'raster',
      source: imageId,
      paint: { 'raster-opacity': 0.8 },
    });
  }, []);

  const removeImage = useCallback(() => {
    uploadedImageRef.current = null;
    setImageSize(null);
    if (mapRef.current && mapRef.current.getSource(imageId)) {
      mapRef.current.removeLayer(imageId);
      mapRef.current.removeSource(imageId);
    }
    setMode("view");
  }, []);

  const calculatePerimeter = useCallback((lines: Line[]): number => {
    if (lines.length === 0) return 0;
    
    const calculateDistance = (p1: Point, p2: Point): number => {
      const R = 6371e3;
      const φ1 = (p1.lat * Math.PI) / 180;
      const φ2 = (p2.lat * Math.PI) / 180;
      const Δφ = ((p2.lat - p1.lat) * Math.PI) / 180;
      const Δλ = ((p2.lng - p1.lng) * Math.PI) / 180;

      const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      return R * c;
    };

    let total = 0;
    lines.forEach(line => {
      for (let i = 0; i < line.points.length - 1; i++) {
        total += calculateDistance(
          { lng: line.points[i][0], lat: line.points[i][1] },
          { lng: line.points[i + 1][0], lat: line.points[i + 1][1] }
        );
      }
    });
    
    return total;
  }, []);

  const formatMeasurement = useCallback((lines: Line[]): string => {
    const perimeter = calculatePerimeter(lines);
    
    if (perimeter < 1000) {
      return `Perimeter: ${perimeter.toFixed(2)} m`;
    } else {
      return `Perimeter: ${(perimeter / 1000).toFixed(2)} km`;
    }
  }, [calculatePerimeter]);

  const updateDrawing = useCallback((map: Map, lines: Line[], previewLine: Line | null = null) => {
    const lineFeatures = lines.map(line => ({
      type: "Feature" as const,
      properties: { id: line.id },
      geometry: {
        type: "LineString" as const,
        coordinates: line.points
      }
    }));

    const pointFeatures: any[] = [];
    lines.forEach(line => {
      line.points.forEach(point => {
        pointFeatures.push({
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "Point" as const,
            coordinates: point
          }
        });
      });
    });

    const drawingSource = map.getSource(drawingSourceId) as maplibregl.GeoJSONSource;
    if (drawingSource) {
      drawingSource.setData({
        type: 'FeatureCollection',
        features: lineFeatures
      });
    } else if (lineFeatures.length > 0) {
      map.addSource(drawingSourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: lineFeatures
        }
      });

      map.addLayer({
        id: 'drawing-lines',
        type: 'line',
        source: drawingSourceId,
        paint: {
          'line-color': '#2563eb',
          'line-width': 3
        }
      });
    }

    const previewSource = map.getSource(previewSourceId) as maplibregl.GeoJSONSource;
    if (previewLine && previewLine.points.length > 0) {
      const previewData = {
        type: 'FeatureCollection' as const,
        features: [{
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: previewLine.points
          }
        }]
      };

      if (previewSource) {
        previewSource.setData(previewData);
      } else {
        map.addSource(previewSourceId, {
          type: 'geojson',
          data: previewData
        });

        map.addLayer({
          id: 'preview-line',
          type: 'line',
          source: previewSourceId,
          paint: {
            'line-color': '#ef4444',
            'line-width': 3,
            'line-dasharray': [2, 2]
          }
        });
      }
    } else if (previewSource) {
      previewSource.setData({
        type: 'FeatureCollection',
        features: []
      });
    }

    const pointsSource = map.getSource('drawing-points') as maplibregl.GeoJSONSource;
    if (pointsSource) {
      pointsSource.setData({
        type: 'FeatureCollection',
        features: pointFeatures
      });
    } else if (pointFeatures.length > 0) {
      map.addSource('drawing-points', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: pointFeatures
        }
      });

      map.addLayer({
        id: 'drawing-points',
        type: 'circle',
        source: 'drawing-points',
        paint: {
          'circle-radius': 6,
          'circle-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#2563eb'
        }
      });
    }
  }, []);

  const updatePreviewLine = useMemo(
    () => throttle((map: Map, mousePoint: Point | null) => {
      if (!currentLineRef.current || !mousePoint) {
        const previewSource = map.getSource(previewSourceId) as maplibregl.GeoJSONSource;
        if (previewSource) {
          previewSource.setData({
            type: 'FeatureCollection',
            features: []
          });
        }
        return;
      }

      const previewPoints = [...currentLineRef.current.points, [mousePoint.lng, mousePoint.lat]];
      
      const previewSource = map.getSource(previewSourceId) as maplibregl.GeoJSONSource;
      const previewData = {
        type: 'FeatureCollection' as const,
        features: [{
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: previewPoints
          }
        }]
      };

      if (previewSource) {
        previewSource.setData(previewData);
      } else {
        map.addSource(previewSourceId, {
          type: 'geojson',
          data: previewData
        });

        map.addLayer({
          id: 'preview-line',
          type: 'line',
          source: previewSourceId,
          paint: {
            'line-color': '#ef4444',
            'line-width': 3,
            'line-dasharray': [2, 2]
          }
        });
      }
    }, 16),
    []
  );

  const updatePathLinesOnMap = useCallback((map: any, lines: PathLine[]) => {
    const mainLines = lines.filter((l) => l.pathType === "main");
    const subLines = lines.filter((l) => l.pathType === "sub");

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

    map.getSource("main-path-lines")?.setData({
      type: "FeatureCollection",
      features: mainFeatures,
    });

    map.getSource("sub-path-lines")?.setData({
      type: "FeatureCollection",
      features: subFeatures,
    });
  }, []);

  const updatePathPreviewLine = useMemo(
    () => throttle((map: any, points: [number, number][] | null, pathType?: PathType) => {
      if (!points) {
        map.getSource("path-preview-line")?.setData({
          type: "FeatureCollection",
          features: [],
        });
        return;
      }

      const isMain = pathType === "main";
      map.getSource("path-preview-line")?.setData({
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
    }, 16),
    []
  );

  const updateNodesOnMap = useCallback((map: any, list: Node[]) => {
    const features = list.map((n) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: n.coordinates },
      properties: { color: n.color, id: n.id },
    }));
    map.getSource("path-nodes")?.setData({
      type: "FeatureCollection",
      features,
    });
  }, []);

  const findNodeAtPoint = useCallback((lngLat: { lng: number; lat: number }, nodesList: Node[]): Node | undefined => {
    const t = 0.00008;
    return nodesList.find(
      (n) =>
        Math.abs(n.coordinates[0] - lngLat.lng) < t &&
        Math.abs(n.coordinates[1] - lngLat.lat) < t
    );
  }, []);

  const findPathLineAtPoint = useCallback((lngLat: { lng: number; lat: number }, linesList: PathLine[]): { line: PathLine; closestPoint: [number, number]; segmentIndex: number } | undefined => {
    const tolerance = 0.00005;
    
    let closestLine: PathLine | undefined;
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
  }, []);

  const splitPathLineAtPoint = useCallback((line: PathLine, splitPoint: [number, number], segmentIndex: number, newNodeId: number): PathLine[] => {
    const firstSegmentPoints = [
      ...line.points.slice(0, segmentIndex + 1),
      splitPoint
    ];
    
    const secondSegmentPoints = [
      splitPoint,
      ...line.points.slice(segmentIndex + 1)
    ];

    const firstSegment: PathLine = {
      id: Date.now(),
      points: firstSegmentPoints,
      startNode: line.startNode,
      endNode: newNodeId,
      pathType: line.pathType
    };

    const secondSegment: PathLine = {
      id: Date.now() + 1,
      points: secondSegmentPoints,
      startNode: newNodeId,
      endNode: line.endNode,
      pathType: line.pathType
    };

    return [firstSegment, secondSegment];
  }, []);

  const finishCurrentPathLine = useCallback(() => {
    setCurrentPathLine(null);
    if (mapRef.current) {
      updatePathPreviewLine(mapRef.current, null);
    }
  }, [updatePathPreviewLine]);

  const updateBuildingsLayer = useCallback((map: Map, buildingsList: Building[]) => {
    const buildingsSource = map.getSource(buildingsSourceId) as maplibregl.GeoJSONSource;
    
    const features = buildingsList.map((building) => ({
      type: 'Feature' as const,
      properties: { height: building.height, id: building.id },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [building.polygon]
      }
    }));

    if (buildingsSource) {
      buildingsSource.setData({
        type: 'FeatureCollection',
        features: features
      });
    } else if (features.length > 0) {
      map.addSource(buildingsSourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: features
        }
      });

      map.addLayer({
        id: 'buildings-fill',
        type: 'fill',
        source: buildingsSourceId,
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0.5
        }
      });

      map.addLayer({
        id: 'buildings-line',
        type: 'line',
        source: buildingsSourceId,
        paint: {
          'line-color': '#059669',
          'line-width': 2
        }
      });

      map.addLayer({
        id: 'buildings-extrusion',
        type: 'fill-extrusion',
        source: buildingsSourceId,
        paint: {
          'fill-extrusion-color': '#4a90e2',
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-opacity': 0.9,
        }
      });
    }
  }, []);

  const startNewLine = useCallback((point: Point) => {
    const newLine: Line = {
      id: Date.now(),
      points: [[point.lng, point.lat]]
    };
    setCurrentLine(newLine);
  }, []);

  const addPointToCurrentLine = useCallback((point: Point) => {
    if (!currentLineRef.current) return;
    
    const updatedLine = {
      ...currentLineRef.current,
      points: [...currentLineRef.current.points, [point.lng, point.lat]]
    };
    setCurrentLine(updatedLine);
  }, []);

  const finishCurrentLine = useCallback(() => {
    if (currentLineRef.current && currentLineRef.current.points.length > 1) {
      const updatedLines = [...currentLinesRef.current, currentLineRef.current];
      setCurrentLines(updatedLines);
      setCurrentLine(null);
      
      if (mapRef.current) {
        updateDrawing(mapRef.current, updatedLines);
        setMeasurement(formatMeasurement(updatedLines));
      }
    }
  }, [updateDrawing, formatMeasurement]);

  const getDynamicThreshold = useCallback((map: Map, pixelThreshold: number = 10): number => {
    const center = map.getCenter();
    const zoom = map.getZoom();
    
    const metersPerPixel = 40075016.686 * Math.abs(Math.cos(center.lat * Math.PI / 180)) / Math.pow(2, zoom + 8);
    const degreesPerMeter = 1 / 111320;
    const thresholdInMeters = pixelThreshold * metersPerPixel;
    const thresholdInDegrees = thresholdInMeters * degreesPerMeter;
    
    return thresholdInDegrees;
  }, []);

  const isPointNearStart = useCallback((map: Map, point: Point, startPoint: Point, pixelThreshold: number = 10): boolean => {
    const threshold = getDynamicThreshold(map, pixelThreshold);
    return Math.abs(point.lng - startPoint.lng) < threshold && 
          Math.abs(point.lat - startPoint.lat) < threshold;
  }, [getDynamicThreshold]);

  const handleBuildingClick = useCallback((point: Point) => {
    const now = Date.now();
    const isDoubleClick = now - lastClickTime.current < 300;
    lastClickTime.current = now;

    if (!currentLineRef.current) {
      startNewLine(point);
    } else {
      const startPoint: Point = {
        lng: currentLineRef.current.points[0][0],
        lat: currentLineRef.current.points[0][1]
      };

      if (isPointNearStart(mapRef.current!, point, startPoint) || isDoubleClick) {
        const closedLine = {
          ...currentLineRef.current,
          points: [...currentLineRef.current.points, [startPoint.lng, startPoint.lat]]
        };
        
        const updatedLines = [...currentLinesRef.current, closedLine];
        setCurrentLines(updatedLines);
        setCurrentLine(null);
        
        if (mapRef.current) {
          updateDrawing(mapRef.current, updatedLines);
          setMeasurement(formatMeasurement(updatedLines));
        }
      } else {
        addPointToCurrentLine(point);
      }
    }
  }, [startNewLine, isPointNearStart, addPointToCurrentLine, updateDrawing, formatMeasurement]);

  const finishBuilding = useCallback(() => {
    if (currentLinesRef.current.length === 0) return;

    const closedShapes: [number, number][][] = [];
    
    currentLinesRef.current.forEach(line => {
      const points = line.points;
      
      const isClosed = points.length >= 4 && 
        points[0][0] === points[points.length - 1][0] &&
        points[0][1] === points[points.length - 1][1];
      
      if (isClosed) {
        const uniquePoints: [number, number][] = [];
        points.forEach((point, index) => {
          if (index === 0 || 
              point[0] !== points[index - 1][0] || 
              point[1] !== points[index - 1][1]) {
            uniquePoints.push(point);
          }
        });
        
        if (uniquePoints.length >= 4 && 
            uniquePoints[0][0] === uniquePoints[uniquePoints.length - 1][0] &&
            uniquePoints[0][1] === uniquePoints[uniquePoints.length - 1][1]) {
          closedShapes.push(uniquePoints);
        }
      }
    });

    if (closedShapes.length > 0) {
      const newBuildings: Building[] = closedShapes.map(polygon => ({
        id: `building-${Date.now()}-${Math.random()}`,
        height: currentHeight,
        polygon: polygon
      }));
      
      setBuildings(prev => [...prev, ...newBuildings]);
      
      setCurrentLines([]);
      setCurrentLine(null);
      setMeasurement('');
      
      if (mapRef.current) {
        updateDrawing(mapRef.current, []);
      }
      
      // setMode("view");
      removeImage();
    } else {
      const potentialBuildings = currentLinesRef.current.filter(line => 
        line.points.length >= 3
      );
      
      if (potentialBuildings.length > 0) {
        alert(`Found ${potentialBuildings.length} lines, but none are properly closed shapes.`);
      } else {
        alert('Please create at least one closed shape to form a building.');
      }
    }
  }, [currentHeight, updateDrawing, removeImage]);

  const clearDrawing = useCallback(() => {
    setCurrentLines([]);
    setCurrentLine(null);
    setMeasurement('');
    if (mapRef.current) {
      updateDrawing(mapRef.current, []);
    }
  }, [updateDrawing]);

  const undoLastPoint = useCallback(() => {
    if (currentLineRef.current && currentLineRef.current.points.length > 1) {
      const updatedLine = {
        ...currentLineRef.current,
        points: currentLineRef.current.points.slice(0, -1)
      };
      setCurrentLine(updatedLine);
      
      if (mapRef.current) {
        updateDrawing(mapRef.current, [...currentLinesRef.current, updatedLine]);
        setMeasurement(formatMeasurement([...currentLinesRef.current, updatedLine]));
      }
    } else if (currentLinesRef.current.length > 0) {
      const updatedLines = currentLinesRef.current.slice(0, -1);
      setCurrentLines(updatedLines);
      setCurrentLine(null);
      
      if (mapRef.current) {
        updateDrawing(mapRef.current, updatedLines);
        setMeasurement(formatMeasurement(updatedLines));
      }
    }
  }, [updateDrawing, formatMeasurement]);

  const clearAllBuildings = useCallback(() => {
    setBuildings([]);
    if (mapRef.current) {
      updateBuildingsLayer(mapRef.current, []);
    }
  }, [updateBuildingsLayer]);

  const copyToClipboard = useCallback(() => {
    const code = `const buildingsData: Building[] = ${JSON.stringify(buildings, null, 2)};`;
    navigator.clipboard.writeText(code);
    alert('Building data copied to clipboard!');
  }, [buildings]);

  const deleteBuilding = useCallback((id: string) => {
    setBuildings(prev => prev.filter(b => b.id !== id));
  }, []);

  const startBuildingDrawing = useCallback(() => {
    setMode("drawBuildings");
  }, []);

  const generateStressTestBuildings = useCallback((count: number = 500) => {
    const newBuildings: Building[] = [];
    const centerLng = -74.0179;
    const centerLat = 40.706;
    const spreadLng = 0.01;
    const spreadLat = 0.01;
    
    for (let i = 0; i < count; i++) {
      const bldgCenterLng = centerLng + (Math.random() - 0.5) * spreadLng;
      const bldgCenterLat = centerLat + (Math.random() - 0.5) * spreadLat;
      
      const sizeBase = 0.00005 + Math.random() * 0.0002;
      const rotation = Math.random() * Math.PI * 2;
      const width = sizeBase * (0.5 + Math.random());
      const height = sizeBase * (0.5 + Math.random());
      
      const corners: [number, number][] = [
        [-width, -height],
        [width, -height],
        [width, height],
        [-width, height],
        [-width, -height]
      ].map(([x, y]) => {
        const rotatedX = x * Math.cos(rotation) - y * Math.sin(rotation);
        const rotatedY = x * Math.sin(rotation) + y * Math.cos(rotation);
        return [
          bldgCenterLng + rotatedX,
          bldgCenterLat + rotatedY
        ] as [number, number];
      });
      
      newBuildings.push({
        id: `stress-test-building-${i}-${Date.now()}`,
        height: 10 + Math.random() * 190,
        polygon: corners
      });
    }
    
    setBuildings(prev => [...prev, ...newBuildings]);
    alert(`Generated ${count} test buildings!`);
  }, []);

  useEffect(() => {
    if (mapRef.current && mapRef.current.isStyleLoaded()) {
      updateBuildingsLayer(mapRef.current, buildings);
    }
  }, [buildings, updateBuildingsLayer]);

  useEffect(() => {
    if (mapRef.current && mapRef.current.isStyleLoaded()) {
      updatePathLinesOnMap(mapRef.current, pathLines);
    }
  }, [pathLines, updatePathLinesOnMap]);

  useEffect(() => {
    if (mapRef.current && mapRef.current.isStyleLoaded()) {
      updateNodesOnMap(mapRef.current, nodes);
    }
  }, [nodes, updateNodesOnMap]);

  const enableImageDragResize = useCallback((map: Map) => {
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

    const updateImageBounds = (bounds: [number, number][]) => {
      imageBoundsRef.current = bounds;
      const src = map.getSource(imageId) as maplibregl.ImageSource;
      if (src && src.setCoordinates) {
        src.setCoordinates(bounds);
      }
    };

    const onMouseDown = (e: maplibregl.MapMouseEvent & maplibregl.EventData) => {
      const click = e.lngLat.toArray() as [number, number];
      const currentBounds = imageBoundsRef.current;

      if (modeRef.current === "drawPaths") {
        const now = Date.now();
        const isDoubleClick = now - lastClickTime.current < 300;
        lastClickTime.current = now;

        if (isDoubleClick && currentPathLineRef.current) {
          finishCurrentPathLine();
          return;
        }

        const clickedNode = findNodeAtPoint(e.lngLat, nodesRef.current);
        const clickedLineInfo = findPathLineAtPoint(e.lngLat, pathLinesRef.current);

        if (currentPathLineRef.current && (clickedLineInfo || (clickedNode && clickedNode.id !== currentPathLineRef.current.start))) {
          let endNode: Node;
          
          if (clickedNode && clickedNode.id !== currentPathLineRef.current.start) {
            endNode = clickedNode;
          } else if (clickedLineInfo) {
            const { line, closestPoint, segmentIndex } = clickedLineInfo;
            
            endNode = {
              id: Date.now(),
              coordinates: [closestPoint[0], closestPoint[1]],
              color: colors[nodesRef.current.length % colors.length],
            };
            
            const splitLines = splitPathLineAtPoint(line, closestPoint, segmentIndex, endNode.id);
            const updatedLines = pathLinesRef.current.filter(l => l.id !== line.id);
            updatedLines.push(...splitLines);
            const updatedNodes = [...nodesRef.current, endNode];
            
            setNodes(updatedNodes);
            setPathLines(updatedLines);
          } else {
            return;
          }
          
          const finalLine: PathLine = {
            id: Date.now(),
            points: [
              currentPathLineRef.current.points[currentPathLineRef.current.points.length - 1],
              endNode.coordinates,
            ],
            startNode: currentPathLineRef.current.nodeIds[currentPathLineRef.current.nodeIds.length - 1],
            endNode: endNode.id,
            pathType: currentPathLineRef.current.pathType,
          };
          
          setPathLines(prev => [...prev, finalLine]);
          finishCurrentPathLine();
          return;
        }

        if (clickedLineInfo && !clickedNode && !currentPathLineRef.current) {
          const { line, closestPoint, segmentIndex } = clickedLineInfo;
          
          const splitNode: Node = {
            id: Date.now(),
            coordinates: [closestPoint[0], closestPoint[1]],
            color: colors[nodesRef.current.length % colors.length],
          };
          
          const splitLines = splitPathLineAtPoint(line, closestPoint, segmentIndex, splitNode.id);
          const updatedLines = pathLinesRef.current.filter(l => l.id !== line.id);
          updatedLines.push(...splitLines);
          const updatedNodes = [...nodesRef.current, splitNode];
          
          setNodes(updatedNodes);
          setPathLines(updatedLines);
          
          const newCurrentLine: CurrentPathLine = {
            start: splitNode.id,
            points: [splitNode.coordinates],
            nodeIds: [splitNode.id],
            pathType: currentPathType,
            isContinuingFromLine: true,
            continuedLineId: line.id,
            splitPoint: closestPoint
          };
          
          setCurrentPathLine(newCurrentLine);
          return;
        }

        if (clickedNode) {
          if (!currentPathLineRef.current) {
            const newCurrentLine: CurrentPathLine = {
              start: clickedNode.id,
              points: [clickedNode.coordinates],
              nodeIds: [clickedNode.id],
              pathType: currentPathType,
            };
            setCurrentPathLine(newCurrentLine);
          } else {
            if (clickedNode.id === currentPathLineRef.current.start) {
              const newLine: PathLine = {
                id: Date.now(),
                points: [
                  currentPathLineRef.current.points[currentPathLineRef.current.points.length - 1],
                  clickedNode.coordinates,
                ],
                startNode: currentPathLineRef.current.nodeIds[currentPathLineRef.current.nodeIds.length - 1],
                endNode: clickedNode.id,
                pathType: currentPathLineRef.current.pathType,
              };
              setPathLines(prev => [...prev, newLine]);
              finishCurrentPathLine();
            }
          }
        } else {
          const newNode: Node = {
            id: Date.now(),
            coordinates: [e.lngLat.lng, e.lngLat.lat],
            color: colors[nodesRef.current.length % colors.length],
          };
          setNodes(prev => [...prev, newNode]);

          if (!currentPathLineRef.current) {
            const newCurrentLine: CurrentPathLine = {
              start: newNode.id,
              points: [newNode.coordinates],
              nodeIds: [newNode.id],
              pathType: currentPathType,
            };
            setCurrentPathLine(newCurrentLine);
          } else {
            const newLine: PathLine = {
              id: Date.now(),
              points: [
                currentPathLineRef.current.points[currentPathLineRef.current.points.length - 1],
                newNode.coordinates,
              ],
              startNode: currentPathLineRef.current.nodeIds[currentPathLineRef.current.nodeIds.length - 1],
              endNode: newNode.id,
              pathType: currentPathLineRef.current.pathType,
            };
            setPathLines(prev => [...prev, newLine]);

            const updatedCurrentLine: CurrentPathLine = {
              ...currentPathLineRef.current,
              points: [...currentPathLineRef.current.points, newNode.coordinates],
              nodeIds: [...currentPathLineRef.current.nodeIds, newNode.id],
            };
            setCurrentPathLine(updatedCurrentLine);
          }
        }
        e.preventDefault();
        return;
      }

      if (modeRef.current === "drawBuildings") {
        const point: Point = { lng: click[0], lat: click[1] };
        handleBuildingClick(point);
        e.preventDefault();
        return;
      }

      if (modeRef.current === "dragNodes") {
        const clickedNode = findNodeAtPoint(e.lngLat, nodesRef.current);
        if (clickedNode) {
          draggedNodeRef.current = clickedNode;
          isDraggingNode.current = true;
          map.getCanvas().style.cursor = "grabbing";
          map.dragPan.disable();
          e.preventDefault();
          return;
        }
      }

      if (modeRef.current !== "imageEdit" || !uploadedImageRef.current) return;

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

      if (modeRef.current === "drawPaths") {
        if (currentPathLineRef.current) {
          const previewPoints = [
            ...currentPathLineRef.current.points,
            [e.lngLat.lng, e.lngLat.lat],
          ];
          updatePathPreviewLine(map, previewPoints, currentPathLineRef.current.pathType);
        }
        return;
      }

      if (modeRef.current === "drawBuildings") {
        map.getCanvas().style.cursor = 'crosshair';
        
        if (currentLineRef.current) {
          const mousePoint: Point = { lng: current[0], lat: current[1] };
          updatePreviewLine(map, mousePoint);
        }
        return;
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

        const updatedLines = pathLinesRef.current.map((l) => {
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

        setPathLines(updatedLines);
        return;
      }

      if (modeRef.current === "dragNodes") {
        const node = findNodeAtPoint(e.lngLat, nodesRef.current);
        map.getCanvas().style.cursor = node ? "pointer" : "";
        return;
      }

      if (modeRef.current === "imageEdit" && uploadedImageRef.current) {
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

      if (isDragging && dragStart) {
        const deltaLng = current[0] - dragStart[0];
        const deltaLat = current[1] - dragStart[1];
        const moved = currentBounds.map(([lng, lat]) => [lng + deltaLng, lat + deltaLat]) as [number, number][];
        
        updateImageBounds(moved);
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
        
        updateImageBounds(updated);
      }

      if (isRotating) {
        const center = getCenter(currentBounds);
        const currentAngle = getAngle(center, current);
        const rotationAngle = currentAngle - initialAngle;
        
        const rotated = currentBounds.map(corner => 
          rotatePoint(corner, center, rotationAngle)
        ) as [number, number][];
        
        updateImageBounds(rotated);
        initialAngle = currentAngle;
      }
    };

    const onMouseUp = () => {
      if (isDragging || isResizing || isRotating) {
        enableMapInteractions();
      }
      if (isDraggingNode.current) {
        isDraggingNode.current = false;
        draggedNodeRef.current = null;
        map.dragPan.enable();
      }
      isDragging = false;
      isResizing = false;
      isRotating = false;
      dragStart = null;
      activeCornerIndex = null;
      if (modeRef.current !== "imageEdit" && modeRef.current !== "drawBuildings" && modeRef.current !== "drawPaths") {
        map.getCanvas().style.cursor = '';
      }
    };

    eventListenersRef.current = {
      mousedown: onMouseDown,
      mousemove: onMouseMove,
      mouseup: onMouseUp,
      mouseout: onMouseUp
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    map.on('mouseout', onMouseUp);

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.off('mouseout', onMouseUp);
    };
  }, [handleBuildingClick, updatePreviewLine, currentPathType, findNodeAtPoint, findPathLineAtPoint, splitPathLineAtPoint, finishCurrentPathLine, updatePathPreviewLine]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
      center: [-74.0179, 40.706],
      zoom: 17,
    });

    mapRef.current = map;

    map.on("load", () => {
      map.addSource("main-path-lines", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "main-path-lines-border",
        type: "line",
        source: "main-path-lines",
        paint: {
          "line-color": "#1e5a99",
          "line-width": 10,
          "line-opacity": 0.8,
        },
      });

      map.addLayer({
        id: "main-path-lines-main",
        type: "line",
        source: "main-path-lines",
        paint: {
          "line-color": "#4285f4",
          "line-width": 8,
        },
      });

      map.addLayer({
        id: "main-path-lines-center",
        type: "line",
        source: "main-path-lines",
        paint: {
          "line-color": "#8ab4f8",
          "line-width": 2,
          "line-opacity": 0.6,
        },
      });

      map.addSource("sub-path-lines", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "sub-path-lines-border",
        type: "line",
        source: "sub-path-lines",
        paint: {
          "line-color": "#2d7a4a",
          "line-width": 8,
          "line-opacity": 0.8,
        },
      });

      map.addLayer({
        id: "sub-path-lines-main",
        type: "line",
        source: "sub-path-lines",
        paint: {
          "line-color": "#34a853",
          "line-width": 6,
        },
      });

      map.addLayer({
        id: "sub-path-lines-center",
        type: "line",
        source: "sub-path-lines",
        paint: {
          "line-color": "#81c995",
          "line-width": 1.5,
          "line-opacity": 0.6,
        },
      });

      map.addSource("path-preview-line", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "path-preview-border",
        type: "line",
        source: "path-preview-line",
        paint: {
          "line-color": ["get", "borderColor"],
          "line-width": ["get", "borderWidth"],
          "line-opacity": 0.5,
          "line-dasharray": [2, 2],
        },
      });

      map.addLayer({
        id: "path-preview-main",
        type: "line",
        source: "path-preview-line",
        paint: {
          "line-color": ["get", "mainColor"],
          "line-width": ["get", "mainWidth"],
          "line-opacity": 0.7,
          "line-dasharray": [2, 2],
        },
      });

      map.addSource("path-nodes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "path-nodes-glow",
        type: "circle",
        source: "path-nodes",
        paint: {
          "circle-radius": 12,
          "circle-color": ["get", "color"],
          "circle-opacity": 0.3,
          "circle-blur": 0.5,
        },
      });

      map.addLayer({
        id: "path-nodes-main",
        type: "circle",
        source: "path-nodes",
        paint: {
          "circle-radius": 8,
          "circle-color": ["get", "color"],
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });

      const cleanup = enableImageDragResize(map);
      
      return cleanup;
    });

    return () => {
      if (mapRef.current) {
        const listeners = eventListenersRef.current;
        if (listeners.mousedown) mapRef.current.off('mousedown', listeners.mousedown);
        if (listeners.mousemove) mapRef.current.off('mousemove', listeners.mousemove);
        if (listeners.mouseup) mapRef.current.off('mouseup', listeners.mouseup);
        if (listeners.mouseout) mapRef.current.off('mouseout', listeners.mouseout);
        
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [enableImageDragResize]);

  const clearAllPaths = useCallback(() => {
    setPathLines([]);
    setNodes([]);
    setCurrentPathLine(null);
    if (mapRef.current) {
      updatePathLinesOnMap(mapRef.current, []);
      updateNodesOnMap(mapRef.current, []);
      updatePathPreviewLine(mapRef.current, null);
    }
  }, [updatePathLinesOnMap, updateNodesOnMap, updatePathPreviewLine]);

  const mainPathCount = pathLines.filter((l) => l.pathType === "main").length;
  const subPathCount = pathLines.filter((l) => l.pathType === "sub").length;

  return (
    <div className="w-full h-screen bg-gray-900">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-gray-800/95 backdrop-blur-sm p-3 rounded-lg shadow-xl border border-gray-700 max-h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="text-white font-bold mb-2 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          Tools
        </div>
        
        <div className="mb-2">
          <label className="block text-white text-sm font-medium mb-1">
            Upload Image:
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="w-full text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {uploadedImageRef.current && (
            <button
              onClick={removeImage}
              className="w-full mt-2 px-3 py-2 bg-red-500 text-white rounded text-sm font-medium hover:bg-red-600 transition-all"
            >
              Remove Image
            </button>
          )}
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
        
        {uploadedImageRef.current &&
          <button
            onClick={() => setMode("imageEdit")}
            disabled={!uploadedImageRef.current}
            className={`px-4 py-2 rounded text-sm font-medium transition-all ${
              mode === "imageEdit"
                ? "bg-purple-500 text-white shadow-lg"
                : !uploadedImageRef.current 
                  ? "bg-gray-500 text-gray-400 cursor-not-allowed"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            🖼️ Edit Image
          </button>
        }
        
        <button
          onClick={startBuildingDrawing}
          className={`px-4 py-2 rounded text-sm font-medium transition-all ${
            mode === "drawBuildings"
              ? "bg-indigo-500 text-white shadow-lg"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          🏗️ Draw Buildings
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

        <div className="border-t border-gray-600 pt-2 mt-2">
          <div className="text-xs text-gray-400 font-semibold uppercase mb-2">
            🛣️ Road Tools
          </div>
          
          <button
            onClick={() => {
              setMode("drawPaths");
              setCurrentPathLine(null);
            }}
            className={`w-full px-4 py-2 rounded text-sm font-medium transition-all mb-2 ${
              mode === "drawPaths"
                ? "bg-blue-500 text-white shadow-lg"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            ✏️ Draw Roads
          </button>

          {mode === "drawPaths" && (
            <div className="ml-2 flex flex-col gap-2 border-l-2 border-gray-600 pl-3 mb-2">
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
                🔵 Main Path
              </button>
              <button
                onClick={() => setCurrentPathType("sub")}
                className={`px-3 py-2 rounded text-xs font-medium transition-all ${
                  currentPathType === "sub"
                    ? "bg-green-500 text-white shadow-lg"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                🟢 Sub Path
              </button>
            </div>
          )}

          {currentPathLine && (
            <button
              onClick={finishCurrentPathLine}
              className="w-full px-4 py-2 rounded text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-all mb-2"
            >
              ❌ Cancel Path
            </button>
          )}

          <button
            onClick={clearAllPaths}
            className="w-full px-4 py-2 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-all"
          >
            🗑️ Clear All Roads
          </button>

          <div className="text-xs text-gray-400 mt-2 space-y-1">
            <div>Main Paths: {mainPathCount}</div>
            <div>Sub Paths: {subPathCount}</div>
            <div>Nodes: {nodes.length}</div>
          </div>
        </div>

        <div className="border-t border-gray-600 pt-2 mt-2">
          <div className="text-white text-xs font-medium mb-2">⚡ Stress Test</div>
          <div className="flex gap-1">
            <button
              onClick={() => generateStressTestBuildings(100)}
              className="flex-1 px-2 py-1.5 bg-yellow-600 text-white rounded text-xs font-medium hover:bg-yellow-700 transition-all"
            >
              +100
            </button>
            <button
              onClick={() => generateStressTestBuildings(500)}
              className="flex-1 px-2 py-1.5 bg-orange-600 text-white rounded text-xs font-medium hover:bg-orange-700 transition-all"
            >
              +500
            </button>
            <button
              onClick={() => generateStressTestBuildings(1000)}
              className="flex-1 px-2 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition-all"
            >
              +1K
            </button>
          </div>
          <div className="text-white text-xs mt-2 opacity-75">
            Buildings: {buildings.length}
          </div>
        </div>
      </div>

      {(mode === "drawBuildings" || mode === "dragNodes") && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'white',
          padding: '15px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '13px',
          maxWidth: '320px',
          maxHeight: '90vh',
          overflowY: 'auto',
          zIndex: 1000
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <strong style={{ fontSize: '14px' }}>🏗️ Building Drawing</strong>
            <button 
              onClick={() => setShowBuildingPanel(!showBuildingPanel)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '2px 6px'
              }}
            >
              {showBuildingPanel ? '−' : '+'}
            </button>
          </div>
          
          {showBuildingPanel && (
            <>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                  Building Height: {currentHeight}m
                </label>
                <input
                  type="range"
                  min="5"
                  max="200"
                  value={currentHeight}
                  onChange={(e) => setCurrentHeight(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  <button
                    onClick={undoLastPoint}
                    disabled={!currentLineRef.current && currentLinesRef.current.length === 0}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: (!currentLineRef.current && currentLinesRef.current.length === 0) ? '#e5e7eb' : '#f59e0b',
                      color: (!currentLineRef.current && currentLinesRef.current.length === 0) ? '#9ca3af' : 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: (!currentLineRef.current && currentLinesRef.current.length === 0) ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}
                  >
                    ↶ Undo
                  </button>
                  <button
                    onClick={finishCurrentLine}
                    disabled={!currentLineRef.current || currentLineRef.current.points.length < 2}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: (!currentLineRef.current || currentLineRef.current.points.length < 2) ? '#e5e7eb' : '#3b82f6',
                      color: (!currentLineRef.current || currentLineRef.current.points.length < 2) ? '#9ca3af' : 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: (!currentLineRef.current || currentLineRef.current.points.length < 2) ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}
                  >
                    ✓ Finish Line
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  <button
                    onClick={finishBuilding}
                    disabled={currentLines.length === 0}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: currentLines.length === 0 ? '#e5e7eb' : '#10b981',
                      color: currentLines.length === 0 ? '#9ca3af' : 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: currentLines.length === 0 ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}
                  >
                    🏗️ Save Building
                  </button>
                  <button
                    onClick={clearDrawing}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}
                  >
                    ✕ Clear
                  </button>
                </div>
                
                <div style={{
                  padding: '10px',
                  background: '#eff6ff',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}>
                  <div style={{ marginBottom: '4px' }}>
                    <strong>Lines:</strong> {currentLinesRef.current.length}
                    {currentLineRef.current && ` (Current: ${currentLineRef.current.points.length} points)`}
                  </div>
                  {measurement && (
                    <div style={{ color: '#1e40af', fontWeight: '600' }}>
                      {measurement}
                    </div>
                  )}
                  <div style={{ marginTop: '6px', color: '#6b7280', fontSize: '11px' }}>
                    <div>• Click to start a line</div>
                    <div>• Click to add points to the line</div>
                    <div>• Click near start point or double-click to close line</div>
                    <div>• Click "Finish Line" to complete current line</div>
                    <div>• Create closed lines to form a building</div>
                  </div>
                </div>
              </div>

              <div style={{
                borderTop: '1px solid #e5e7eb',
                paddingTop: '12px',
                marginBottom: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '13px' }}>Buildings ({buildings.length})</strong>
                  {buildings.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={copyToClipboard}
                        style={{
                          padding: '4px 8px',
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '11px'
                        }}
                      >
                        📋 Copy
                      </button>
                      <button
                        onClick={clearAllBuildings}
                        style={{
                          padding: '4px 8px',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '11px'
                        }}
                      >
                        Clear All
                      </button>
                    </div>
                  )}
                </div>
                
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {buildings.map((building, idx) => (
                    <div key={building.id} style={{
                      padding: '8px',
                      background: '#f9fafb',
                      borderRadius: '4px',
                      marginBottom: '6px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '12px'
                    }}>
                      <div>
                        <div><strong>Building {idx + 1}</strong></div>
                        <div style={{ color: '#6b7280' }}>
                          Height: {building.height}m | Points: {building.polygon.length}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteBuilding(building.id)}
                        style={{
                          padding: '4px 8px',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '11px'
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
}