/**
 * config/constants.js
 * ─────────────────────────────────────────────
 * All tuneable parameters in one place.
 * Change these to experiment with the simulation
 * or algorithm behaviour without touching logic files.
 */

// ── CITIES ──────────────────────────────────────────
export const CITIES = {
  bangalore: { center: [12.9716, 77.5946], name: 'Bangalore' },
  delhi:     { center: [28.6139, 77.2090], name: 'Delhi'     },
  mumbai:    { center: [19.0760, 72.8777], name: 'Mumbai'    },
  chennai:   { center: [13.0827, 80.2707], name: 'Chennai'   },
  hyderabad: { center: [17.3850, 78.4867], name: 'Hyderabad' },
};

// ── DEPOT DEFINITIONS ───────────────────────────────
// Each depot is placed at (cityCenter + offset) degrees lat/lng.
// radius is in kilometres — the primary service zone.
export const DEPOT_DEFS = [
  { name: 'Depot Alpha', color: '#7c4dff', truckColor: '#b39ddb', radius: 6.5, latOff: -0.06, lngOff: -0.07 },
  { name: 'Depot Beta',  color: '#00bcd4', truckColor: '#80deea', radius: 6.5, latOff:  0.07, lngOff: -0.04 },
  { name: 'Depot Gamma', color: '#ff9800', truckColor: '#ffcc80', radius: 6.5, latOff: -0.01, lngOff:  0.08 },
];

// Truck colours per depot index (2 trucks each)
export const ROUTE_COLORS = [
  ['#b39ddb', '#7c4dff'],
  ['#80deea', '#00bcd4'],
  ['#ffcc80', '#ff9800'],
];

export const TRUCKS_PER_DEPOT = 2;

// ── BIN SIMULATION ──────────────────────────────────
export const NUM_BINS    = 120;
export const BIN_SPREAD  = 0.09;   // ±degrees around city centre
export const MIN_FILL    = 50;     // bins below this % are skipped in routing
export const BIN_ZONES   = ['North', 'South', 'East', 'West', 'Central', 'NE', 'NW', 'SE', 'SW'];
export const BIN_CAPACITY = 240;   // litres

// ── ASSIGNMENT ──────────────────────────────────────
// Max load imbalance ratio before rebalancing kicks in
export const MAX_LOAD_FACTOR = 1.4;

// ── ACO PARAMETERS ──────────────────────────────────
export const ACO_ANTS  = 18;     // ants per iteration
export const ACO_ITERS = 50;     // iterations per restart
export const ALPHA     = 1.0;    // pheromone weight
export const BETA      = 2.5;    // heuristic (visibility) weight
export const RHO       = 0.15;   // pheromone evaporation rate
export const Q         = 100;    // pheromone deposit constant

// ── LNS PARAMETERS ──────────────────────────────────
export const LNS_FRAC  = 0.25;   // fraction of route to destroy each iteration
export const LNS_ITERS_FACTOR = 4; // LNS iters = min(80, binCount * factor)

// ── ILS PARAMETERS ──────────────────────────────────
export const ILS_RESTARTS    = 3;
export const ILS_ACCEPT_FRAC = 1.15; // accept perturbed solution if within 15% of best

// ── UI ───────────────────────────────────────────────
export const AUTO_REFRESH_SECONDS = 30;
export const FILL_DRIFT_PROB      = 0.35; // probability a bin drifts up each tick
export const OSRM_TIMEOUT_MS      = 9000;
