/**
 * algorithms/ils.js
 * ─────────────────────────────────────────────
 * Iterative Local Search (ILS) outer loop.
 *
 * ILS escapes local optima by:
 *   1. Perturbing the current best via a Double-Bridge move
 *      (a 4-segment reversal that cannot be undone by 2-opt)
 *   2. Re-applying LNS to the perturbed solution
 *   3. Accepting if within ILS_ACCEPT_FRAC of current best
 *
 * The full pipeline for one truck route is:
 *   for each ILS restart:
 *     ACO → LNS → [perturb → LNS] × restarts
 */

import { ILS_RESTARTS, ILS_ACCEPT_FRAC } from '../config/constants.js';
import { runACO, routeCost }             from './aco.js';
import { lns }                           from './lns.js';
import { buildDistMatrix, depotDistances } from '../utils/geo.js';

/**
 * Full hybrid optimisation for a single truck's bin list.
 *
 * @param {Depot}  depot
 * @param {Bin[]}  candidates
 * @returns {Bin[]}  ordered collection sequence
 */
export function hybridOptimise(depot, candidates) {
  if (!candidates.length) return [];
  if (candidates.length <= 2) return candidates;

  const DD = buildDistMatrix(candidates);
  const dD = depotDistances(depot, candidates);

  // ── Phase 1: ACO ──────────────────────────────────
  let { bestRoute, bestCost } = runACO(depot, candidates, DD, dD);

  // ── Phase 2 onwards: LNS + ILS restarts ──────────
  for (let restart = 0; restart < ILS_RESTARTS; restart++) {
    // LNS improvement on current best
    bestRoute = lns(bestRoute, DD, dD, candidates);
    bestCost  = routeCost(bestRoute, DD, dD, candidates);

    // ILS perturbation (except on final restart — no point)
    if (restart < ILS_RESTARTS - 1) {
      const perturbed = doubleBridge(bestRoute);
      const improved  = lns(perturbed, DD, dD, candidates);
      const ic        = routeCost(improved, DD, dD, candidates);

      if (ic < bestCost * ILS_ACCEPT_FRAC) {
        bestRoute = improved;
        bestCost  = ic;
      }
    }
  }

  return bestRoute.map(i => candidates[i]);
}

/**
 * Double-Bridge perturbation.
 * Splits the route into 4 segments and reconnects them in a different order.
 * This move cannot be reversed by 2-opt, ensuring genuine diversification.
 *
 * Original:  A | B | C | D
 * Reconnect: A | C | B | D
 */
export function doubleBridge(route) {
  const n = route.length;
  if (n < 8) return [...route];

  // Pick 3 random cut points in sorted order
  const positions = [1, 2, 3]
    .map(() => 1 + Math.floor(Math.random() * (n - 2)))
    .sort((a, b) => a - b);
  const [p1, p2, p3] = positions;

  return [
    ...route.slice(0, p1),
    ...route.slice(p3),
    ...route.slice(p2, p3),
    ...route.slice(p1, p2),
  ];
}
