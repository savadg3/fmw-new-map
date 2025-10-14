'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function InteractiveMap() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const imageBoundsRef = useRef<[number, number][]>([
    [77.58, 12.94], // top-left
    [77.60, 12.94], // top-right
    [77.60, 12.92], // bottom-right
    [77.58, 12.92], // bottom-left
  ]);

  const imageId = 'custom-image-layer';

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

      // Add draggable + resizable behavior
      enableDragResize(map);
    });

    return () => map.remove();
  }, []);

  /** 🖱 Enable drag + resize interactions */
  const enableDragResize = (map: Map) => {
    let dragStart: [number, number] | null = null;
    let isDragging = false;
    let isResizing = false;
    let activeCornerIndex: number | null = null;

    const cornerThreshold = 0.003;

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

    const updateImageSource = (bounds: [number, number][]) => {
      const src = map.getSource(imageId) as maplibregl.ImageSource;
      if (src && src.setCoordinates) {
        src.setCoordinates(bounds);
      }
    };

    const onMouseDown = (e: maplibregl.MapMouseEvent & maplibregl.EventData) => {
      const click = e.lngLat.toArray() as [number, number];
      const currentBounds = imageBoundsRef.current;

      // Check if clicking near a corner
      activeCornerIndex = currentBounds.findIndex(([lng, lat]) =>
        Math.abs(lng - click[0]) < cornerThreshold &&
        Math.abs(lat - click[1]) < cornerThreshold
      );

      if (activeCornerIndex !== -1) {
        isResizing = true;
        disableMapInteractions();
        map.getCanvas().style.cursor = 'nwse-resize';
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

      // Change cursor when hovering
      if (!isDragging && !isResizing) {
        const nearCorner = currentBounds.some(([lng, lat]) =>
          Math.abs(lng - current[0]) < cornerThreshold &&
          Math.abs(lat - current[1]) < cornerThreshold
        );
        
        if (nearCorner) {
          map.getCanvas().style.cursor = 'nwse-resize';
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
        // Get the center point of the rectangle
        const centerLng = (currentBounds[0][0] + currentBounds[2][0]) / 2;
        const centerLat = (currentBounds[0][1] + currentBounds[2][1]) / 2;
        
        // Calculate distance from center to current mouse position
        const newDistLng = Math.abs(current[0] - centerLng);
        const newDistLat = Math.abs(current[1] - centerLat);
        
        // Create new bounds maintaining rectangular shape
        const updated: [number, number][] = [
          [centerLng - newDistLng, centerLat + newDistLat], // top-left
          [centerLng + newDistLng, centerLat + newDistLat], // top-right
          [centerLng + newDistLng, centerLat - newDistLat], // bottom-right
          [centerLng - newDistLng, centerLat - newDistLat], // bottom-left
        ];
        
        imageBoundsRef.current = updated;
        updateImageSource(updated);
      }
    };

    const onMouseUp = () => {
      if (isDragging || isResizing) {
        enableMapInteractions();
      }
      isDragging = false;
      isResizing = false;
      dragStart = null;
      activeCornerIndex = null;
      map.getCanvas().style.cursor = '';
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    map.on('mouseout', onMouseUp);
  };

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        background: 'white',
        padding: '10px',
        borderRadius: '4px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        fontFamily: 'sans-serif',
        fontSize: '12px'
      }}>
        <strong>Instructions:</strong>
        <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
          <li>Click and drag the image to move it</li>
          <li>Click and drag corners to resize</li>
          <li>Map pan/zoom disabled during interaction</li>
        </ul>
      </div>
    </div>
  );
}