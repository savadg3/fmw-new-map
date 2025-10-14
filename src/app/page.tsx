'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

type DrawMode = 'line' | 'polygon' | 'none';

interface Point {
  lng: number;
  lat: number;
}

export default function InteractiveMap() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const imageBoundsRef = useRef<[number, number][]>([
    [77.58, 12.94],
    [77.60, 12.94],
    [77.60, 12.92],
    [77.58, 12.92],
  ]);

  const drawMode = useRef<DrawMode>('none')
  // const [drawMode, setDrawMode] = useState<DrawMode>('none');
  const [points, setPoints] = useState<Point[]>([]);
  const [measurement, setMeasurement] = useState<string>('');
  const [showPanel, setShowPanel] = useState(true);

  const imageId = 'custom-image-layer';
  const drawingSourceId = 'drawing-source';
  const drawingPointsSourceId = 'drawing-points-source';

  // Calculate distance between two points (Haversine formula)
  const calculateDistance = (p1: Point, p2: Point): number => {
    const R = 6371e3;
    const φ1 = (p1.lat * Math.PI) / 180;
    const φ2 = (p2.lat * Math.PI) / 180;
    const Δφ = ((p2.lat - p1.lat) * Math.PI) / 180;
    const Δλ = ((p2.lng - p1.lng) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const calculateLineLength = (pts: Point[]): number => {
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      total += calculateDistance(pts[i], pts[i + 1]);
    }
    return total;
  };

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

  const formatMeasurement = (pts: Point[], mode: DrawMode): string => {
    if (pts.length < 2) return '';
    
    if (mode === 'line') {
      const length = calculateLineLength(pts);
      if (length < 1000) {
        return `Length: ${length.toFixed(2)} m`;
      } else {
        return `Length: ${(length / 1000).toFixed(2)} km`;
      }
    } else if (mode === 'polygon' && pts.length >= 3) {
      const area = calculatePolygonArea(pts);
      const perimeter = calculateLineLength([...pts, pts[0]]);
      
      let areaStr = '';
      if (area < 10000) {
        areaStr = `${area.toFixed(2)} m²`;
      } else {
        areaStr = `${(area / 1000000).toFixed(2)} km²`;
      }
      
      let perimeterStr = '';
      if (perimeter < 1000) {
        perimeterStr = `${perimeter.toFixed(2)} m`;
      } else {
        perimeterStr = `${(perimeter / 1000).toFixed(2)} km`;
      }
      
      return `Area: ${areaStr} | Perimeter: ${perimeterStr}`;
    }
    
    return '';
  };

  const updateDrawing = (map: Map, pts: Point[], mode: DrawMode) => {

    // Remove existing drawing layers
    if (map.getLayer('drawing-line')) map.removeLayer('drawing-line');
    if (map.getLayer('drawing-fill')) map.removeLayer('drawing-fill');
    if (map.getLayer('drawing-points')) map.removeLayer('drawing-points');
    if (map.getSource(drawingSourceId)) map.removeSource(drawingSourceId);
    if (map.getSource(drawingPointsSourceId)) map.removeSource(drawingPointsSourceId);

    if (pts.length === 0) return;

    const coordinates = pts.map(p => [p.lng, p.lat]);

    if (mode === 'line') {
      map.addSource(drawingSourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: coordinates
          }
        }
      });

      map.addLayer({
        id: 'drawing-line',
        type: 'line',
        source: drawingSourceId,
        paint: {
          'line-color': '#ef4444',
          'line-width': 3
        }
      });
    } else if (mode === 'polygon') {

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
            'fill-color': '#10b981',
            'fill-opacity': 0.3
          }
        });
      }

      map.addLayer({
        id: 'drawing-line',
        type: 'line',
        source: drawingSourceId,
        paint: {
          'line-color': '#10b981',
          'line-width': 3
        }
      });
    }

    // Add vertex points
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
        'circle-stroke-color': mode === 'line' ? '#ef4444' : '#10b981'
      }
    });
  };

  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [77.59, 12.93],
      zoom: 14,
    });
    mapRef.current = map;

    map.on('load', () => {
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

      enableDragResize(map);
    });

    return () => map.remove();
  }, []);

  const enableDragResize = (map: Map) => {
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
      const src = map.getSource(imageId) as maplibregl.ImageSource;
      if (src && src.setCoordinates) {
        src.setCoordinates(bounds);
      }
    };

    const onMouseDown = (e: maplibregl.MapMouseEvent & maplibregl.EventData) => {
      const click = e.lngLat.toArray() as [number, number];

      console.log(drawMode.current);

      // If in drawing mode, add point and prevent any other interactions
      if (drawMode.current !== 'none') {
        const newPoint: Point = {
          lng: click[0],
          lat: click[1]
        };
        setPoints(prev => {
          const updated = [...prev, newPoint];
          updateDrawing(map, updated, drawMode.current);
          setMeasurement(formatMeasurement(updated, drawMode.current));
          return updated;
        });
        e.preventDefault();
        // e.stopPropagation();
        return;
      }

      const currentBounds = imageBoundsRef.current;

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

      // If in drawing mode, just show crosshair cursor
      if (drawMode.current !== 'none') {
        map.getCanvas().style.cursor = 'crosshair';
        return;
      }

      const currentBounds = imageBoundsRef.current;

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

      if (isDragging && dragStart) {
        const deltaLng = current[0] - dragStart[0];
        const deltaLat = current[1] - dragStart[1];
        const moved = currentBounds.map(([lng, lat]) => [lng + deltaLng, lat + deltaLat]) as [number, number][];
        
        imageBoundsRef.current = moved;
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
        
        imageBoundsRef.current = updated;
        updateImageSource(updated);
      }

      if (isRotating) {
        const center = getCenter(currentBounds);
        const currentAngle = getAngle(center, current);
        const rotationAngle = currentAngle - initialAngle;
        
        const rotated = currentBounds.map(corner => 
          rotatePoint(corner, center, rotationAngle)
        ) as [number, number][];
        
        imageBoundsRef.current = rotated;
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
      if (drawMode.current === 'none') {
        map.getCanvas().style.cursor = '';
      }
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    map.on('mouseout', onMouseUp);
  };

  const startDrawing = (mode: DrawMode) => {
    clearDrawing();
    drawMode.current = mode;
  };

  const finishDrawing = () => {
    drawMode.current = 'none';
  };

  const clearDrawing = () => {
    setPoints([]);
    setMeasurement('');
    if (mapRef.current) {
      updateDrawing(mapRef.current, [], 'none');
    }
  };

  const undoLastPoint = () => {
    setPoints(prev => {
      const updated = prev.slice(0, -1);
      if (mapRef.current) {
        updateDrawing(mapRef.current, updated, drawMode.current);
        setMeasurement(formatMeasurement(updated, drawMode.current));
      }
      return updated;
    });
  };

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      
      {/* Control Panel */}
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
        maxWidth: '300px',
        zIndex: 1000
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <strong style={{ fontSize: '14px' }}>Drawing Tools</strong>
          <button 
            onClick={() => setShowPanel(!showPanel)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '2px 6px'
            }}
          >
            {showPanel ? '−' : '+'}
          </button>
        </div>
        
        {showPanel && (
          <>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <button
                onClick={() => startDrawing('line')}
                disabled={drawMode.current === 'line'}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: drawMode.current === 'line' ? '#ef4444' : '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: drawMode.current === 'line' ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  opacity: drawMode.current === 'line' ? 0.6 : 1
                }}
              >
                📏 Line
              </button>
              <button
                onClick={() => startDrawing('polygon')}
                disabled={drawMode.current === 'polygon'}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: drawMode.current === 'polygon' ? '#10b981' : '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: drawMode.current === 'polygon' ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  opacity: drawMode.current === 'polygon' ? 0.6 : 1
                }}
              >
                📐 Polygon
              </button>
            </div>
            
            {drawMode.current !== 'none' && (
              <>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <button
                    onClick={undoLastPoint}
                    disabled={points.length === 0}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: points.length === 0 ? '#e5e7eb' : '#f59e0b',
                      color: points.length === 0 ? '#9ca3af' : 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: points.length === 0 ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}
                  >
                    ↶ Undo
                  </button>
                  <button
                    onClick={finishDrawing}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: '#8b5cf6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}
                  >
                    ✓ Finish
                  </button>
                  <button
                    onClick={clearDrawing}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
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
                  background: '#f3f4f6',
                  borderRadius: '6px',
                  marginBottom: '10px',
                  fontSize: '12px',
                  color: '#374151'
                }}>
                  <div style={{ marginBottom: '4px' }}>
                    <strong>Points:</strong> {points.length}
                  </div>
                  {measurement && (
                    <div style={{
                      marginTop: '8px',
                      padding: '8px',
                      background: drawMode.current === 'line' ? '#fee2e2' : '#d1fae5',
                      borderRadius: '4px',
                      fontWeight: '600',
                      color: drawMode.current === 'line' ? '#991b1b' : '#065f46'
                    }}>
                      {measurement}
                    </div>
                  )}
                </div>
              </>
            )}
            
            <div style={{
              padding: '10px',
              background: '#eff6ff',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#1e40af',
              lineHeight: '1.5'
            }}>
              {drawMode.current !== 'none' ? (
                <div>
                  <strong>Drawing Mode Active:</strong>
                  <br />Click on the map to add points
                </div>
              ) : (
                <div>
                  <strong>Image Controls:</strong>
                  <br />• Drag image to move
                  <br />• Drag corners to resize
                  <br />• Drag edges to rotate
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}