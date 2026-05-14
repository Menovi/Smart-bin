/**
 * utils/geo.js
 * ─────────────────────────────────────────────
 * Geographic utility functions.
 */

const DEG2RAD = Math.PI / 180;
const EARTH_R  = 6371; // km

/**
 * Haversine distance between two lat/lng points (km).
 */
export function haversine(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLng = (lng2 - lng1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLng / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Build an n×n Float32Array distance matrix for an array of {lat,lng} objects.
 */
export function buildDistMatrix(points) {
  const n = points.length;
  const D = [];
  for (let i = 0; i < n; i++) {
    D[i] = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        D[i][j] = haversine(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
      }
    }
  }
  return D;
}

/**
 * Return Float32Array of distances from a single depot point to each bin.
 */
export function depotDistances(depot, bins) {
  return new Float32Array(bins.length).map((_, i) =>
    haversine(depot.lat, depot.lng, bins[i].lat, bins[i].lng)
  );
}
