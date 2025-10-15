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

type Mode = "view" | "drawBuildings" | "imageEdit";

// Throttle utility
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

// Debounce utility
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return function(this: any, ...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

export default function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [mode, setMode] = useState<Mode>("view");

  // Building drawing state - using array with Map for efficient lookups
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [currentLines, setCurrentLines] = useState<Line[]>([]);
  const [currentLine, setCurrentLine] = useState<Line | null>(null);
  const [currentHeight, setCurrentHeight] = useState<number>(10);
  const [measurement, setMeasurement] = useState<string>('');
  const [showBuildingPanel, setShowBuildingPanel] = useState(true);

  // Convert buildings array to Map for O(1) lookups when needed
  // const buildingsMap = useMemo(() => {
  //   const map = new Map<string, Building>();
  //   buildings.forEach(b => map.set(b.id, b));
  //   return map;
  // }, [buildings]);

  // Image upload and manipulation state
  const uploadedImageRef = useRef<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const imageBoundsRef = useRef<[number, number][]>([
    [-74.0185, 40.7064],
    [-74.0173, 40.7064],
    [-74.0173, 40.7056],
    [-74.0185, 40.7056],
  ]);
  const imageId = 'custom-image-layer';

  // Drawing layer IDs
  const drawingSourceId = 'drawing-source';
  const previewSourceId = 'preview-source';
  const buildingsSourceId = 'buildings-source';

  // Refs for current state
  const modeRef = useRef<Mode>(mode);
  const buildingsRef = useRef<Building[]>(buildings);
  const currentLinesRef = useRef<Line[]>(currentLines);
  const currentLineRef = useRef<Line | null>(currentLine);
  const lastClickTime = useRef<number>(0);
  
  // Event listener cleanup refs
  const eventListenersRef = useRef<{
    mousedown?: (e: any) => void;
    mousemove?: (e: any) => void;
    mouseup?: (e: any) => void;
    mouseout?: (e: any) => void;
  }>({});

  // Update refs when state changes
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    buildingsRef.current = buildings;
  }, [buildings]);

  useEffect(() => {
    currentLinesRef.current = currentLines;
  }, [currentLines]);

  useEffect(() => {
    currentLineRef.current = currentLine;
  }, [currentLine]);

  // Image upload handler
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

  // Calculate image bounds
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

  // Update image source on the map
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

  // Remove uploaded image
  const removeImage = useCallback(() => {
    uploadedImageRef.current = null;
    setImageSize(null);
    if (mapRef.current && mapRef.current.getSource(imageId)) {
      mapRef.current.removeLayer(imageId);
      mapRef.current.removeSource(imageId);
    }
    setMode("view");
  }, []);

  // Calculate perimeter of lines - memoized
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

  // Update drawing on the map - OPTIMIZED with setData
  const updateDrawing = useCallback((map: Map, lines: Line[], previewLine: Line | null = null) => {
    // Create features for all completed lines
    const lineFeatures = lines.map(line => ({
      type: "Feature" as const,
      properties: { id: line.id },
      geometry: {
        type: "LineString" as const,
        coordinates: line.points
      }
    }));

    // Add points for all vertices
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

    // Update or create completed lines source
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

    // Update or create preview line
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

    // Update or create points
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

  // Update preview line when mouse moves - THROTTLED
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

  // Update buildings layer - OPTIMIZED with setData
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

      // 2D fill layer
      map.addLayer({
        id: 'buildings-fill',
        type: 'fill',
        source: buildingsSourceId,
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0.5
        }
      });

      // 2D outline layer
      map.addLayer({
        id: 'buildings-line',
        type: 'line',
        source: buildingsSourceId,
        paint: {
          'line-color': '#059669',
          'line-width': 2
        }
      });

      // 3D extrusion layer
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

  // Start drawing a new line
  const startNewLine = useCallback((point: Point) => {
    const newLine: Line = {
      id: Date.now(),
      points: [[point.lng, point.lat]]
    };
    setCurrentLine(newLine);
  }, []);

  // Add point to current line
  const addPointToCurrentLine = useCallback((point: Point) => {
    if (!currentLineRef.current) return;
    
    const updatedLine = {
      ...currentLineRef.current,
      points: [...currentLineRef.current.points, [point.lng, point.lat]]
    };
    setCurrentLine(updatedLine);
  }, []);

  // Finish current line and add it to the building
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

  const isPointNearStart = useCallback((map: Map, point: Point, startPoint: Point, pixelThreshold: number = 10): boolean => {
    const threshold = getDynamicThreshold(map, pixelThreshold);
    return Math.abs(point.lng - startPoint.lng) < threshold && 
          Math.abs(point.lat - startPoint.lat) < threshold;
  }, [getDynamicThreshold]);

  // Handle click for building drawing
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
      
      setMode("view");
      removeImage();
    } else {
      const potentialBuildings = currentLinesRef.current.filter(line => 
        line.points.length >= 3
      );
      
      if (potentialBuildings.length > 0) {
        alert(`Found ${potentialBuildings.length} lines, but none are properly closed shapes. Make sure each line starts and ends at the same point to form a closed polygon.`);
      } else {
        alert('Please create at least one closed shape to form a building. Draw lines that start and end at the same point.');
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
    clearDrawing();
    setMode("drawBuildings");
  }, [clearDrawing]);

  // Update buildings when they change
  useEffect(() => {
    if (mapRef.current ) {
      updateBuildingsLayer(mapRef.current, buildings);
    }
  }, [buildings, updateBuildingsLayer]);

  // Image manipulation functions
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

      if (modeRef.current === "drawBuildings") {
        const point: Point = { lng: click[0], lat: click[1] };
        handleBuildingClick(point);
        e.preventDefault();
        return;
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

      if (modeRef.current === "drawBuildings") {
        map.getCanvas().style.cursor = 'crosshair';
        
        if (currentLineRef.current) {
          const mousePoint: Point = { lng: current[0], lat: current[1] };
          updatePreviewLine(map, mousePoint);
        }
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
      isDragging = false;
      isResizing = false;
      isRotating = false;
      dragStart = null;
      activeCornerIndex = null;
      if (modeRef.current !== "imageEdit" && modeRef.current !== "drawBuildings") {
        map.getCanvas().style.cursor = '';
      }
    };

    // Store event listeners for cleanup
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

    // Return cleanup function
    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.off('mouseout', onMouseUp);
    };
  }, [handleBuildingClick, updatePreviewLine]);

  // Initialize map
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
      // Enable image drag/resize and store cleanup function
      const cleanup = enableImageDragResize(map);
      
      // Store cleanup in ref for later use
      return cleanup;
    });

    return () => {
      if (mapRef.current) {
        // Clean up event listeners
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

  return (
    <div className="w-full h-screen bg-gray-900">
      {/* Main Tools Panel */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-gray-800/95 backdrop-blur-sm p-3 rounded-lg shadow-xl border border-gray-700">
        <div className="text-white font-bold mb-2 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          Tools
        </div>
        
        {/* Image Upload Section */}
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
      </div>

      {/* Building Drawing Panel */}
      {mode === "drawBuildings" && (
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
            <strong style={{ fontSize: '14px' }}>🏗️ Line-Based Building Drawing</strong>
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
              {/* Height Control */}
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

              {/* Drawing Controls */}
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

              {/* Buildings List */}
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