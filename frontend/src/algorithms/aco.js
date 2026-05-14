/**
 * algorithms/aco.js
 * ─────────────────────────────────────────────
 * Ant Colony Optimisation for a single truck route.
 *
 * Each ant constructs a complete tour using:
 *   - Pheromone trails (τ) — learned memory of good edges
 *   - Heuristic visibility (η) — fill-weighted inverse distance
 *
 * Transition probability:
 *   P(i→j) ∝ τ(i,j)^α · η(i,j)^β
 *
 * After all ants finish each iteration, pheromones evaporate (ρ)
 * and the best ants deposit pheromone proportional to tour quality (Q/cost).
 */

import { ACO_ANTS, ACO_ITERS, ALPHA, BETA, RHO, Q } from '../config/constants.js';

/**
 * Run ACO for one truck's bin list.
 *
 * @param {Depot}       depot
 * @param {Bin[]}       candidates
 * @param {Float32Array[][]} DD   - n×n distance matrix
 * @param {Float32Array}     dD   - depot→bin distances
 * @returns {{ bestRoute: number[], bestCost: number }}
 */
export function runACO(depot, candidates, DD, dD) {
  const n = candidates.length;
  if (n === 0) return { bestRoute: [], bestCost: 0 };
  if (n === 1) return { bestRoute: [0], bestCost: dD[0] * 2 };

  // Initialise pheromone matrix (uniform)
  const pheromone = Array.from({ length: n }, () => new Float32Array(n).fill(1.0));

  let bestRoute = null;
  let bestCost  = Infinity;

  for (let iter = 0; iter < ACO_ITERS; iter++) {
    const antRoutes = [];

    for (let ant = 0; ant < ACO_ANTS; ant++) {
      const route = constructRoute(n, pheromone, DD, dD, candidates);
      const c     = routeCost(route, DD, dD, candidates);
      antRoutes.push({ route, cost: c });
      if (c < bestCost) { bestCost = c; bestRoute = [...route]; }
    }

    // Evaporation
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        pheromone[i][j] *= (1 - RHO);

    // Deposit
    antRoutes.forEach(({ route, cost }) => {
      const deposit = Q / cost;
      for (let i = 0; i < route.length - 1; i++) {
        pheromone[route[i]][route[i + 1]] += deposit;
        pheromone[route[i + 1]][route[i]] += deposit;
      }
    });
  }

  return { bestRoute, bestCost };
}

/**
 * A single ant constructs a tour using roulette-wheel selection.
 */
function constructRoute(n, pheromone, DD, dD, candidates) {
  const visited = new Uint8Array(n);
  const route   = [];
  let   current = -1; // -1 = depot

  for (let step = 0; step < n; step++) {
    const probs = new Float64Array(n);
    let total   = 0;

    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      const tau = current === -1 ? 1.0 : pheromone[current][j];
      const d   = current === -1 ? dD[j] : DD[current][j];
      const eta = (1 + (candidates[j].fill / 100) * 2) / (d < 1e-4 ? 1e-4 : d);
      probs[j]  = Math.pow(tau, ALPHA) * Math.pow(eta, BETA);
      total    += probs[j];
    }

    // Fallback if all probs zero
    if (total === 0) {
      for (let j = 0; j < n; j++) {
        if (!visited[j]) { route.push(j); visited[j] = 1; current = j; break; }
      }
      continue;
    }

    // Roulette-wheel selection
    let r = Math.random() * total, cumul = 0, chosen = 0;
    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      cumul += probs[j];
      if (cumul >= r) { chosen = j; break; }
    }

    route.push(chosen);
    visited[chosen] = 1;
    current = chosen;
  }

  return route;
}

/**
 * Cost function: total distance + urgency penalty for late high-fill visits.
 */
export function routeCost(route, DD, dD, candidates) {
  if (!route.length) return 0;
  let c = dD[route[0]];
  for (let i = 0; i < route.length - 1; i++) c += DD[route[i]][route[i + 1]];
  c += dD[route[route.length - 1]];
  // Urgency penalty: visiting a near-full bin late is bad
  route.forEach((idx, pos) => { c += (candidates[idx].fill / 100) * pos * 0.08; });
  return c;
}
