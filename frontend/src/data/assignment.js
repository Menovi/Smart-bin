/**
 * data/assignment.js
 * ─────────────────────────────────────────────
 * Assigns every bin to a depot using a 3-pass smart strategy:
 *
 *  Pass 1 — Hard radius coverage  (preferred, solid border)
 *  Pass 2 — Nearest-depot fallback (extended dispatch, dashed border)
 *  Pass 3 — Load rebalancing       (prevents any one depot being overloaded)
 */

import { haversine }      from '../utils/geo.js';
import { MAX_LOAD_FACTOR } from '../config/constants.js';

/**
 * Mutates each bin in-place, setting .depotId and .extended.
 * @param {Bin[]}   bins
 * @param {Depot[]} depots
 */
export function assignBinsToDepots(bins, depots) {
  // ── Pass 1: Assign within hard coverage radius ──
  bins.forEach(bin => {
    bin.depotId  = null;
    bin.extended = false;

    let bestDepot = null;
    let bestDist  = Infinity;

    depots.forEach(depot => {
      const d = haversine(bin.lat, bin.lng, depot.lat, depot.lng);
      if (d <= depot.radius && d < bestDist) {
        bestDist  = d;
        bestDepot = depot;
      }
    });

    if (bestDepot) bin.depotId = bestDepot.id;
  });

  // ── Pass 2: Extended-dispatch fallback for any still-unassigned bin ──
  bins.forEach(bin => {
    if (bin.depotId) return;

    let bestDepot = null;
    let bestDist  = Infinity;

    depots.forEach(depot => {
      const d = haversine(bin.lat, bin.lng, depot.lat, depot.lng);
      if (d < bestDist) { bestDist = d; bestDepot = depot; }
    });

    if (bestDepot) {
      bin.depotId  = bestDepot.id;
      bin.extended = true;
    }
  });

  // ── Pass 3: Load rebalancing ──
  rebalanceLoad(bins, depots);
}

/**
 * If any depot has >MAX_LOAD_FACTOR × average bins,
 * redistribute its extended bins to the nearest under-capacity depot.
 */
function rebalanceLoad(bins, depots) {
  const counts = {};
  depots.forEach(d => (counts[d.id] = bins.filter(b => b.depotId === d.id).length));

  const avg        = bins.length / depots.length;
  const maxAllowed = Math.ceil(avg * MAX_LOAD_FACTOR);

  depots.forEach(overloaded => {
    if (counts[overloaded.id] <= maxAllowed) return;

    // Sort extended bins of this depot by closeness to any other depot
    const extBins = bins
      .filter(b => b.depotId === overloaded.id && b.extended)
      .sort((a, b) => {
        const nearA = Math.min(...depots
          .filter(d => d.id !== overloaded.id)
          .map(d => haversine(a.lat, a.lng, d.lat, d.lng)));
        const nearB = Math.min(...depots
          .filter(d => d.id !== overloaded.id)
          .map(d => haversine(b.lat, b.lng, d.lat, d.lng)));
        return nearA - nearB; // closest-to-another-depot first
      });

    for (const bin of extBins) {
      if (counts[overloaded.id] <= maxAllowed) break;

      // Find the best under-capacity alternative depot
      let bestDepot = null;
      let bestDist  = Infinity;

      depots.forEach(depot => {
        if (depot.id === overloaded.id)    return;
        if (counts[depot.id] >= maxAllowed) return;
        const d = haversine(bin.lat, bin.lng, depot.lat, depot.lng);
        if (d < bestDist) { bestDist = d; bestDepot = depot; }
      });

      if (bestDepot) {
        counts[overloaded.id]--;
        counts[bestDepot.id]++;
        bin.depotId = bestDepot.id;
      }
    }
  });
}
