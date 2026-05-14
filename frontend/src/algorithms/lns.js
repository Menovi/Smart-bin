/**
 * algorithms/lns.js
 * ─────────────────────────────────────────────
 * Large Neighbourhood Search (LNS) with 2-opt post-processing.
 *
 * LNS destroy-repair loop:
 *   1. Destroy  — remove LNS_FRAC of the route at random
 *   2. Repair   — re-insert removed stops greedily by fill priority
 *   3. Accept   — keep if cost improved
 *
 * 2-opt:
 *   Iteratively reverse sub-segments to uncross the route.
 *   Runs after LNS converges.
 */

import { LNS_FRAC, LNS_ITERS_FACTOR } from '../config/constants.js';
import { routeCost }                   from './aco.js';

/**
 * Improve a route index-array using LNS + 2-opt.
 *
 * @param {number[]}     route      - array of candidate indices
 * @param {Float32Array[][]} DD
 * @param {Float32Array}     dD
 * @param {Bin[]}        candidates
 * @returns {number[]}  improved route
 */
export function lns(route, DD, dD, candidates) {
  if (route.length < 3) return route;

  const maxIters = Math.min(80, route.length * LNS_ITERS_FACTOR);
  let best     = [...route];
  let bestCost = routeCost(best, DD, dD, candidates);

  for (let it = 0; it < maxIters; it++) {
    const k     = Math.max(1, Math.floor(best.length * LNS_FRAC));
    const start = Math.floor(Math.random() * (best.length - k));

    const removed   = best.slice(start, start + k);
    const remaining = [...best.slice(0, start), ...best.slice(start + k)];

    // Sort removed by fill (highest first) so urgent bins get best slots
    removed.sort((a, b) => candidates[b].fill - candidates[a].fill);

    // Greedy cheapest-insertion repair
    const repaired = [...remaining];
    removed.forEach(r => {
      let bestPos  = 0;
      let bestGain = Infinity;

      for (let p = 0; p <= repaired.length; p++) {
        const prev = p === 0                ? -1 : repaired[p - 1];
        const next = p === repaired.length  ? -1 : repaired[p];

        const d1 = prev === -1 ? dD[r]          : DD[prev][r];
        const d2 = next === -1 ? dD[r]          : DD[r][next];
        const dr = (prev === -1 || next === -1)  ? 0
          : prev === -1 ? dD[next]
          : next === -1 ? dD[prev]
          : DD[prev][next];

        const insertion = d1 + d2 - dr;
        if (insertion < bestGain) { bestGain = insertion; bestPos = p; }
      }

      repaired.splice(bestPos, 0, r);
    });

    const newCost = routeCost(repaired, DD, dD, candidates);
    if (newCost < bestCost) { bestCost = newCost; best = [...repaired]; }
  }

  return twoOpt(best, DD, dD);
}

/**
 * 2-opt: iteratively reverse sub-segments that reduce total route length.
 */
export function twoOpt(route, DD, dD) {
  if (route.length < 4) return route;

  let improved = true;
  let best     = [...route];

  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 2; j < best.length; j++) {
        const a = i === 0              ? -1 : best[i - 1];
        const b = best[i];
        const c = best[j];
        const d = j === best.length - 1 ? -1 : best[j + 1];

        const before = (a === -1 ? dD[b] : DD[a][b]) + (d === -1 ? dD[c] : DD[c][d]);
        const after  = (a === -1 ? dD[c] : DD[a][c]) + (d === -1 ? dD[b] : DD[b][d]);

        if (after < before - 1e-4) {
          best.splice(i, j - i + 1, ...best.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }

  return best;
}
