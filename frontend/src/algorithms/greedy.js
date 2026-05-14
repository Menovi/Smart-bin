/**
 * algorithms/greedy.js
 * ─────────────────────────────────────────────
 * Greedy Nearest-Neighbour baseline router.
 *
 * Complexity: O(n²) — very fast even at 120 bins.
 * Quality:    ~75–80% of optimal.
 *
 * Used as:
 *  - The "Fast Route" button (standalone)
 *  - The initial solution seed inside ACO (when needed)
 */

import { haversine }    from '../utils/geo.js';
import { routeColor }   from '../utils/colors.js';
import { MIN_FILL, TRUCKS_PER_DEPOT } from '../config/constants.js';

/**
 * Build greedy routes for all depots / trucks.
 *
 * @param {Bin[]}   bins
 * @param {Depot[]} depots
 * @returns {Route[]}
 */
export function buildGreedyRoutes(bins, depots) {
  const eligible = bins.filter(b => b.fill >= MIN_FILL && b.depotId);
  const routes   = [];

  depots.forEach((depot, di) => {
    const depotBins = eligible
      .filter(b => b.depotId === depot.id)
      .sort((a, b) => b.fill - a.fill);       // high-fill first

    for (let ti = 0; ti < TRUCKS_PER_DEPOT; ti++) {
      const truckBins = depotBins.filter((_, i) => i % TRUCKS_PER_DEPOT === ti);
      routes.push({
        depotIdx: di,
        truckIdx: ti,
        depot,
        bins:  nearestNeighbour(depot, truckBins),
        color: routeColor(di, ti),
      });
    }
  });

  return routes;
}

/**
 * Nearest-neighbour tour starting and ending at the depot.
 * Fill level is used as an inverse distance weight so higher-fill bins
 * are preferred over equally-close lower-fill bins.
 *
 * @param {Depot} depot
 * @param {Bin[]} candidates
 * @returns {Bin[]}
 */
export function nearestNeighbour(depot, candidates) {
  if (!candidates.length) return [];

  const remaining = [...candidates];
  const order     = [];
  let   current   = { lat: depot.lat, lng: depot.lng };

  while (remaining.length) {
    let bestBin   = null;
    let bestScore = Infinity;
    let bestIdx   = 0;

    remaining.forEach((bin, i) => {
      const dist  = haversine(current.lat, current.lng, bin.lat, bin.lng);
      const score = dist * (1 - bin.fill / 200);   // fill-weighted
      if (score < bestScore) { bestScore = score; bestBin = bin; bestIdx = i; }
    });

    order.push(bestBin);
    current = bestBin;
    remaining.splice(bestIdx, 1);
  }

  return order;
}
