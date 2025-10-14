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

interface Point {
  lng: number;
  lat: number;
}

type ViewMode = "3d" | "map";
type Mode = "view" | "drawLines" | "dragNodes" | "imageEdit" | "drawBuildings";

// Initial buildings data
const initialBuildingsData: Building[] = [];

export default function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [mode, setMode] = useState<Mode>("view");

  // Road drawing state
  const [lines, setLines] = useState<Line[]>([]);
  const [currentLine, setCurrentLine] = useState<CurrentLine | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const draggedNodeRef = useRef<Node | null>(null);
  const isDraggingNode = useRef(false);
  const lastClickTime = useRef<number>(0);

  // Building drawing state
  const [buildings, setBuildings] = useState<Building[]>(initialBuildingsData);
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);
  const [currentHeight, setCurrentHeight] = useState<number>(30);
  const [measurement, setMeasurement] = useState<string>('');
  const [showBuildingPanel, setShowBuildingPanel] = useState(true);
  const [showCode, setShowCode] = useState(false);

  // Image upload and manipulation state
  // const [uploadedImage, setUploadedImage] = useState<string | null>(null);
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
  const drawingPointsSourceId = 'drawing-points-source';
  const buildingsSourceId = 'buildings-source';

  // Refs for current state
  const linesRef = useRef<Line[]>([]);
  const nodesRef = useRef<Node[]>([]);
  const modeRef = useRef<Mode>(mode);
  const currentLineRef = useRef<CurrentLine | null>(null);
  const buildingsRef = useRef<Building[]>(buildings);

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

  useEffect(() => {
    buildingsRef.current = buildings;
  }, [buildings]);

  // Image upload handler
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if file is an image
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string;
      
      // Create a temporary image to get dimensions
      const img = new Image();
      img.onload = () => {
        console.log(imageUrl,e);
        uploadedImageRef.current = imageUrl;
        setImageSize({ width: img.width, height: img.height });
        
        // Calculate bounds based on image aspect ratio and center of map
        if (mapRef.current) {
          const center = mapRef.current.getCenter();
          const zoom = mapRef.current.getZoom();
          calculateImageBounds(center.lng, center.lat, img.width, img.height, zoom);
        }
      };
      img.src = imageUrl;
    };
    reader.readAsDataURL(file);
  };

  // Calculate image bounds based on center, image dimensions, and zoom level
  const calculateImageBounds = (centerLng: number, centerLat: number, imgWidth: number, imgHeight: number, zoom: number) => {
    // Calculate the scale factor based on zoom level
    const scale = Math.pow(2, 17 - zoom); // Adjust this factor as needed
    
    // Calculate the dimensions in degrees (approximate conversion)
    // This is a simplified calculation - you might need to adjust based on your needs
    const widthDegrees = (imgWidth / 100000) * scale;
    const heightDegrees = (imgHeight / 100000) * scale;
    
    // Maintain aspect ratio
    const aspectRatio = imgWidth / imgHeight;
    let finalWidth = widthDegrees;
    let finalHeight = heightDegrees;
    
    if (aspectRatio > 1) {
      // Wider than tall
      finalHeight = finalWidth / aspectRatio;
    } else {
      // Taller than wide
      finalWidth = finalHeight * aspectRatio;
    }
    
    // Calculate bounds
    const halfWidth = finalWidth / 2;
    const halfHeight = finalHeight / 2;
    
    const newBounds: [number, number][] = [
      [centerLng - halfWidth, centerLat + halfHeight], // top-left
      [centerLng + halfWidth, centerLat + halfHeight], // top-right
      [centerLng + halfWidth, centerLat - halfHeight], // bottom-right
      [centerLng - halfWidth, centerLat - halfHeight], // bottom-left
    ];
    
    imageBoundsRef.current = newBounds;
    
    // Update the image source if map exists
    if (mapRef.current) {
      updateImageSource(mapRef.current, newBounds, uploadedImageRef.current!);
    }
  };

  // Update image source on the map
  const updateImageSource = (map: Map, bounds: [number, number][], imageUrl: string) => {
    // Remove existing image layer and source
    if (map.getLayer(imageId)) map.removeLayer(imageId);
    if (map.getSource(imageId)) map.removeSource(imageId);
    
    // Add new image source
    console.log(imageUrl,"imageUrl");
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
  };

  // Remove uploaded image
  const removeImage = () => {
    uploadedImageRef.current = null
    setImageSize(null);
    if (mapRef.current && mapRef.current.getSource(imageId)) {
      mapRef.current.removeLayer(imageId);
      mapRef.current.removeSource(imageId);
    }
  };

  // Building drawing functions
  const calculatePolygonArea = (pts: Point[]): number => {
    if (pts.length < 3) return 0;
    
    const R = 6371000;
    let area = 0;
    
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      
      const φ1 = (p1.lat * Math.PI) / 180;
      const φ2 = (p2.lat * Math.PI) / 180;
      const Δλ = ((p2.lng - p1.lng) * Math.PI) / 180;
      
      area += Δλ * (2 + Math.sin(φ1) + Math.sin(φ2));
    }
    
    area = Math.abs((area * R * R) / 2);
    return area;
  };

  const formatMeasurement = (pts: Point[]): string => {
    if (pts.length < 3) return '';
    
    const area = calculatePolygonArea(pts);
    
    if (area < 10000) {
      return `Area: ${area.toFixed(2)} m²`;
    } else {
      return `Area: ${(area / 1000000).toFixed(2)} km²`;
    }
  };

  const updateDrawing = (map: Map, pts: Point[]) => {
    // Remove existing drawing layers
    if (map.getLayer('drawing-line')) map.removeLayer('drawing-line');
    if (map.getLayer('drawing-fill')) map.removeLayer('drawing-fill');
    if (map.getLayer('drawing-points')) map.removeLayer('drawing-points');
    if (map.getSource(drawingSourceId)) map.removeSource(drawingSourceId);
    if (map.getSource(drawingPointsSourceId)) map.removeSource(drawingPointsSourceId);

    if (pts.length === 0) return;

    const coordinates = pts.map(p => [p.lng, p.lat]);
    const polygonCoords = pts.length >= 3 ? [...coordinates, coordinates[0]] : coordinates;
    
    map.addSource(drawingSourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: pts.length >= 3 ? 'Polygon' : 'LineString',
          coordinates: pts.length >= 3 ? [polygonCoords] : coordinates
        }
      }
    });

    if (pts.length >= 3) {
      map.addLayer({
        id: 'drawing-fill',
        type: 'fill',
        source: drawingSourceId,
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': 0.4
        }
      });
    }

    map.addLayer({
      id: 'drawing-line',
      type: 'line',
      source: drawingSourceId,
      paint: {
        'line-color': '#2563eb',
        'line-width': 3
      }
    });

    map.addSource(drawingPointsSourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: pts.map(p => ({
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'Point' as const,
            coordinates: [p.lng, p.lat]
          }
        }))
      }
    });

    map.addLayer({
      id: 'drawing-points',
      type: 'circle',
      source: drawingPointsSourceId,
      paint: {
        'circle-radius': 6,
        'circle-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#2563eb'
      }
    });
  };

  const updateBuildingsLayer = (map: Map, buildingsList: Building[]) => {
    // Remove existing building layers
    if (map.getLayer('buildings-fill')) map.removeLayer('buildings-fill');
    if (map.getLayer('buildings-line')) map.removeLayer('buildings-line');
    if (map.getLayer('buildings-extrusion')) map.removeLayer('buildings-extrusion');
    if (map.getSource(buildingsSourceId)) map.removeSource(buildingsSourceId);

    if (buildingsList.length === 0) return;

    map.addSource(buildingsSourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: buildingsList.map((building, idx) => ({
          type: 'Feature' as const,
          properties: { height: building.height, id: idx },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [building.polygon]
          }
        }))
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
  };

  const startBuildingDrawing = () => {
    clearDrawing();
    setMode("drawBuildings");
  };

  const finishBuilding = () => {
    if (drawingPoints.length >= 3) {
      const newBuilding: Building = {
        height: currentHeight,
        polygon: drawingPoints.map(p => [p.lng, p.lat] as [number, number])
      };
      
      const updatedBuildings = [...buildings, newBuilding];
      setBuildings(updatedBuildings);
      
      if (mapRef.current) {
        updateBuildingsLayer(mapRef.current, updatedBuildings);
      }
    }
    clearDrawing();
    setMode("view");
  };

  const clearDrawing = () => {
    setDrawingPoints([]);
    setMeasurement('');
    if (mapRef.current) {
      updateDrawing(mapRef.current, []);
    }
  };

  const undoLastPoint = () => {
    setDrawingPoints(prev => {
      const updated = prev.slice(0, -1);
      if (mapRef.current) {
        updateDrawing(mapRef.current, updated);
        setMeasurement(formatMeasurement(updated));
      }
      return updated;
    });
  };

  const clearAllBuildings = () => {
    setBuildings([]);
    if (mapRef.current) {
      updateBuildingsLayer(mapRef.current, []);
    }
  };

  const copyToClipboard = () => {
    const code = `const buildingsData: Building[] = ${JSON.stringify(buildings, null, 2)};`;
    navigator.clipboard.writeText(code);
    alert('Building data copied to clipboard!');
  };

  const deleteBuilding = (index: number) => {
    const updated = buildings.filter((_, idx) => idx !== index);
    setBuildings(updated);
    if (mapRef.current) {
      updateBuildingsLayer(mapRef.current, updated);
    }
  };

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

      // Handle building drawing clicks
      if (modeRef.current === "drawBuildings") {
        const newPoint: Point = {
          lng: click[0],
          lat: click[1]
        };
        setDrawingPoints(prev => {
          const updated = [...prev, newPoint];
          updateDrawing(map, updated);
          setMeasurement(formatMeasurement(updated));
          return updated;
        });
        e.preventDefault();
        return;
      }

      // Only handle image interactions in imageEdit mode
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

      // Handle cursor for building drawing
      if (modeRef.current === "drawBuildings") {
        map.getCanvas().style.cursor = 'crosshair';
        return;
      }

      // Handle cursor changes for image editing
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

      // Image manipulation logic
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

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    map.on('mouseout', onMouseUp);
  };

  // Node and line functions
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
    });

    mapRef.current = map;

    map.on("load", () => {
      // Enable image drag/resize
      enableImageDragResize(map);

      // Add initial buildings
      updateBuildingsLayer(map, buildings);

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
            <strong style={{ fontSize: '14px' }}>🏗️ Building Drawing Tool</strong>
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
              {/* Height Input */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                  Building Height (m):
                </label>
                <input
                  type="number"
                  value={currentHeight}
                  onChange={(e) => setCurrentHeight(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '13px'
                  }}
                />
              </div>

              {/* Drawing Controls */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  <button
                    onClick={undoLastPoint}
                    disabled={drawingPoints.length === 0}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: drawingPoints.length === 0 ? '#e5e7eb' : '#f59e0b',
                      color: drawingPoints.length === 0 ? '#9ca3af' : 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: drawingPoints.length === 0 ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}
                  >
                    ↶ Undo
                  </button>
                  <button
                    onClick={finishBuilding}
                    disabled={drawingPoints.length < 3}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: drawingPoints.length < 3 ? '#e5e7eb' : '#10b981',
                      color: drawingPoints.length < 3 ? '#9ca3af' : 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: drawingPoints.length < 3 ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}
                  >
                    ✓ Save Building
                  </button>
                </div>
                
                <div style={{
                  padding: '10px',
                  background: '#eff6ff',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}>
                  <div style={{ marginBottom: '4px' }}>
                    <strong>Points:</strong> {drawingPoints.length}
                  </div>
                  {measurement && (
                    <div style={{ color: '#1e40af', fontWeight: '600' }}>
                      {measurement}
                    </div>
                  )}
                  <div style={{ marginTop: '6px', color: '#6b7280', fontSize: '11px' }}>
                    Click map to add points. Need at least 3 points.
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
                  )}
                </div>
                
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {buildings.map((building, idx) => (
                    <div key={idx} style={{
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
                        onClick={() => deleteBuilding(idx)}
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

              {/* Export Code */}
              {buildings.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowCode(!showCode)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: '#8b5cf6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '600',
                      marginBottom: '8px'
                    }}
                  >
                    {showCode ? '📋 Hide Code' : '📋 Show Code'}
                  </button>
                  
                  {showCode && (
                    <div>
                      <pre style={{
                        background: '#1f2937',
                        color: '#f3f4f6',
                        padding: '12px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        maxHeight: '300px',
                        overflowY: 'auto',
                        marginBottom: '8px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all'
                      }}>
                        {`const buildingsData: Building[] = ${JSON.stringify(buildings, null, 2)};`}
                      </pre>
                      <button
                        onClick={copyToClipboard}
                        style={{
                          width: '100%',
                          padding: '8px',
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '500'
                        }}
                      >
                        📋 Copy to Clipboard
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
}