# SmartBin — MDVRP Intelligence Platform

A real-time smart waste management routing system implementing a **Multi-Depot Vehicle Routing Problem (MDVRP)** solver with a hybrid **ACO + LNS + ILS** algorithm and real road geometry via the **OSRM API**.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Build tool** | [Vite 5](https://vitejs.dev) | Dev server, hot reload, ES module bundling |
| **Language** | Vanilla JavaScript (ES2022 modules) | No framework overhead — pure logic |
| **Map** | [Leaflet 1.9](https://leafletjs.com) | Interactive map, markers, polylines, popups |
| **Tile server** | CartoDB Dark Matter | Dark-theme map tiles (free, no key) |
| **Road routing** | [OSRM](https://router.project-osrm.org) | Real driving routes (free public API, no key) |
| **Fonts** | Google Fonts — Syne + Space Mono | UI typography |
| **Styling** | Vanilla CSS with custom properties | No CSS framework |

> **No React, no Vue, no TypeScript, no backend.** The entire application runs in the browser as a pure frontend app.

---

## Project Structure

```
smartbin/
├── index.html                  # HTML shell — layout, tab panels, modal
├── package.json                # npm scripts + dependencies
├── vite.config.js              # Vite build configuration
│
└── src/
    ├── main.js                 # ★ Entry point — bootstraps & orchestrates everything
    │
    ├── config/
    │   └── constants.js        # All tuneable parameters (ACO, depots, bins, UI)
    │
    ├── data/
    │   ├── generator.js        # Synthetic depot & bin data generation
    │   └── assignment.js       # 3-pass bin→depot assignment + load balancing
    │
    ├── algorithms/
    │   ├── greedy.js           # Nearest-Neighbour baseline (O(n²))
    │   ├── aco.js              # Ant Colony Optimisation
    │   ├── lns.js              # Large Neighbourhood Search + 2-opt
    │   └── ils.js              # Iterative Local Search (outer loop)
    │
    ├── map/
    │   └── mapController.js    # All Leaflet state: markers, layers, polylines
    │
    ├── services/
    │   └── osrm.js             # OSRM road routing API client
    │
    ├── ui/
    │   ├── tabs.js             # Tab switching
    │   ├── topbar.js           # Status pills, bin count
    │   ├── sidebar.js          # Bin list, depot legend, progress, route summary
    │   ├── dashboard.js        # KPI cards, depot fleet cards, data table
    │   ├── notifications.js    # Alert cards for critical/high bins
    │   ├── analytics.js        # Bar chart, donut chart, priority queue
    │   └── modal.js            # Algorithm progress modal
    │
    └── styles/
        ├── main.css            # CSS tokens, reset, animations
        ├── layout.css          # Topbar, tabs, content panels
        ├── map.css             # Map panel, sidebar, Leaflet overrides
        └── panels.css          # Dashboard, notifications, analytics, modal
```

---

## Algorithm Deep Dive

### Problem: Multi-Depot VRP (MDVRP)

Classical TSP/VRP assumes a single depot. This system models the real-world scenario:

- **3 depots**, each with a defined **coverage radius**
- **2 trucks per depot** (6 trucks total)
- **120 bins** scattered across the city
- Priority weighting: higher fill → collected sooner

### 3-Pass Bin Assignment

Before routing, every bin is assigned to a depot:

```
Pass 1 — Hard radius coverage
  Each bin goes to the nearest depot within its radius.
  → Solid border on the map marker.

Pass 2 — Extended dispatch fallback
  Any bin still unassigned goes to the nearest depot regardless of radius.
  → Dashed border on the map marker (⚠ extended).

Pass 3 — Load rebalancing
  If any depot has >40% more bins than average,
  its extended bins are redistributed to the next-nearest depot.
```

### Hybrid Optimisation Pipeline

```
For each truck route:
  ┌─────────────────────────────────────────────┐
  │  Phase 1: ACO (Ant Colony Optimisation)     │
  │    18 ants × 50 iterations                  │
  │    Pheromone + fill-weighted heuristic       │
  │    → Good initial solution                  │
  ├─────────────────────────────────────────────┤
  │  Phase 2: LNS (Large Neighbourhood Search)  │
  │    Destroy 25% of route                     │
  │    Repair by cheapest insertion             │
  │    + 2-opt sweep                            │
  │    → Local optimum                         │
  ├─────────────────────────────────────────────┤
  │  Phase 3: ILS (Iterative Local Search)      │
  │    Double-bridge perturbation               │
  │    Re-apply LNS                             │
  │    Accept if within 15% of best             │
  │    Repeat 3× to escape local optima        │
  └─────────────────────────────────────────────┘
  Phase 4: OSRM road-snapping
    Waypoints → real driving polyline
```

### Algorithm Comparison

| Algorithm | Quality | Speed | Notes |
|---|---|---|---|
| Greedy NN (Fast Route) | ~75–80% optimal | Instant | Good baseline |
| ACO alone | ~80–87% optimal | ~1–2s | Good exploration |
| ACO + LNS | ~88–93% optimal | ~2–4s | Strong local search |
| **ACO + LNS + ILS** (Smart Route) | **~90–95% optimal** | **~3–6s** | **Default** |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) v18 or higher
- npm v9 or higher

### Install & Run

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev
# → Opens at http://localhost:5173

# 3. Build for production
npm run build
# → Output in /dist

# 4. Preview production build
npm run preview
```

### No Build? Just open the HTML.

The `/dist` build is self-contained. Or use the single-file `smart-bin-router.html` for a zero-install demo.

---

## Configuration

All parameters are in **`src/config/constants.js`** — no hunting through logic files:

```js
// Tune depot coverage
export const DEPOT_DEFS = [
  { name: 'Depot Alpha', radius: 6.5, ... },
  ...
];

// Tune ACO behaviour
export const ACO_ANTS  = 18;   // more ants = better exploration, slower
export const ACO_ITERS = 50;   // more iterations = better quality, slower
export const ALPHA     = 1.0;  // pheromone weight
export const BETA      = 2.5;  // heuristic weight
export const RHO       = 0.15; // evaporation rate

// Tune LNS
export const LNS_FRAC  = 0.25; // fraction of route to destroy

// Tune ILS
export const ILS_RESTARTS = 3; // more restarts = better escaping local optima
```

---

## Features

| Feature | Description |
|---|---|
| 🗺️ Live Map | Dark Leaflet map with 120 colour-coded bin markers |
| 🏭 3 Depots | Coverage circles, extended dispatch for out-of-range bins |
| 🚛 Fast Route | Greedy nearest-neighbour, instant, straight lines |
| 🧬 Smart Route | ACO+LNS+ILS hybrid, real OSRM road geometry |
| 🔢 Route numbering | Stop order shown on each bin marker during routing |
| 📊 Dashboard | KPI cards, per-depot fleet cards, full sortable bin table |
| 🔔 Notifications | Real-time alerts for ≥90% (critical) and ≥75% (high) bins |
| 📈 Analytics | Bar chart, donut chart, priority queue with map fly-to |
| ➕ Add bins | Click map to place custom bins (auto-assigned to nearest depot) |
| 🔄 Simulate | Random fill level drift to simulate IoT sensor updates |
| ⏱️ Auto-refresh | Fill levels drift upward every 30s |
| 🌆 5 Cities | Bangalore, Delhi, Mumbai, Chennai, Hyderabad |

---

## Extending the App

### Connect a real backend

Replace `src/data/generator.js` with an API call:

```js
export async function generateBins(cityKey) {
  const res = await fetch(`/api/bins?city=${cityKey}`);
  return res.json();
}
```

### Add more depots or trucks

Edit `DEPOT_DEFS` and `TRUCKS_PER_DEPOT` in `src/config/constants.js`.

### Use a different map tile provider

Edit the tile URL in `src/map/mapController.js`:

```js
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {...})
```

### Use Mapbox instead of OSRM

Replace `src/services/osrm.js` with the Mapbox Directions API — the interface (`fetchRoadRoute`) stays the same.
