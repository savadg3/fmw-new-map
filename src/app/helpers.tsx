

export function findNodeAtPoint(
  lngLat: { lng: number; lat: number },
  nodesList: [number, number][],
  threshold : number
): [number, number] | undefined {
  const t = threshold;
  return nodesList.find(
    ([lng, lat]) =>
      Math.abs(lng - lngLat.lng) < t &&
      Math.abs(lat - lngLat.lat) < t
  );
}



export function generateTestData(count = 500) {
  const result = [];

  for (let i = 0; i < count; i++) {
    const id = Date.now() + i;
    const baseLng = -74 + Math.random() * 0.01; // around -74
    const baseLat = 40.70 + Math.random() * 0.01; // around 40.70

    // generate 4 random nearby points, then close the polygon by repeating the first
    const points = Array.from({ length: 4 }, () => [
      baseLng + (Math.random() - 0.5) * 0.003,
      baseLat + (Math.random() - 0.5) * 0.003,
    ]);
    points.push(points[0]); // close polygon

    result.push({ id, points });
  }

  return result;
}