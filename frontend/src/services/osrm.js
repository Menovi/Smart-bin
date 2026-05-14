/**
 * services/osrm.js
 * ─────────────────────────────────────────────
 * Fetches real road-following geometry from the public OSRM API.
 *
 * Endpoint: https://router.project-osrm.org
 * Method:   GET /route/v1/driving/{coords}
 * Response: GeoJSON LineString geometry
 *
 * Falls back gracefully to straight-line if the API is unavailable,
 * rate-limited, or times out.
 */

import { OSRM_TIMEOUT_MS } from '../config/constants.js';

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

/**
 * Fetch a road-following polyline for an ordered list of waypoints.
 *
 * @param {{ lat: number, lng: number }[]} waypoints
 * @returns {Promise<{ coords: [number,number][], dist: number, dur: number } | null>}
 *          Returns null if the API call fails (caller should use straight lines).
 */
export async function fetchRoadRoute(waypoints) {
  if (waypoints.length < 2) return null;

  const coordStr = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
  const url      = `${OSRM_BASE}/${coordStr}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(OSRM_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) return null;

    const route = data.routes[0];
    return {
      // OSRM returns [lng, lat] — flip to [lat, lng] for Leaflet
      coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      dist:   route.distance / 1000,  // metres → km
      dur:    route.duration / 60,    // seconds → minutes
    };
  } catch {
    // Network error, timeout, or JSON parse failure
    return null;
  }
}

/**
 * Straight-line distance estimate (fallback when OSRM is unavailable).
 */
export function straightLineMetrics(waypoints, haversineFn) {
  let dist = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    dist += haversineFn(
      waypoints[i].lat,  waypoints[i].lng,
      waypoints[i+1].lat, waypoints[i+1].lng,
    );
  }
  return {
    coords: waypoints.map(w => [w.lat, w.lng]),
    dist,
    dur: (dist / 30) * 60, // assume avg 30 km/h in urban areas
  };
}
