/**
 * src/main.js
 * ─────────────────────────────────────────────
 * Application entry point.
 *
 * Responsibilities:
 *   - Bootstrap: generate data → assign → init map
 *   - Wire all UI event listeners
 *   - Orchestrate routing runs (greedy & hybrid)
 *   - Drive the auto-refresh simulation loop
 *
 * This file intentionally contains only orchestration logic.
 * All rendering is delegated to ui/ modules.
 * All algorithm logic lives in algorithms/.
 * All map state lives in map/mapController.
 */
import { initIotLive } from './ui/iotLive.js';
import 'leaflet/dist/leaflet.css';
import './styles/main.css';
import './styles/layout.css';
import './styles/map.css';
import './styles/panels.css';

// ── Config ──────────────────────────────────────────
import { CITIES, TRUCKS_PER_DEPOT, AUTO_REFRESH_SECONDS, FILL_DRIFT_PROB } from './config/constants.js';

// ── Data ────────────────────────────────────────────
import { generateDepots, generateBins } from './data/generator.js';
import { assignBinsToDepots }           from './data/assignment.js';

// ── Algorithms ──────────────────────────────────────
import { buildGreedyRoutes }  from './algorithms/greedy.js';
import { hybridOptimise }     from './algorithms/ils.js';
import { routeColor }         from './utils/colors.js';
import { MIN_FILL }           from './config/constants.js';

// ── Map ─────────────────────────────────────────────
import {
  initMap, getMap, flyTo, flyToCity, fitBounds,
  renderDepots, renderAllBinMarkers, addBinMarker,
  refreshBinMarker, openBinPopup,
  drawPolyline, drawRouteStopMarker, placeTruckMarker,
  clearRouteLayers, getAllBinLatLngs,
} from './map/mapController.js';

// ── Services ────────────────────────────────────────
import { fetchRoadRoute, straightLineMetrics } from './services/osrm.js';
import { haversine }                           from './utils/geo.js';

// ── UI ──────────────────────────────────────────────
import { initTabs, switchToMap }     from './ui/tabs.js';
import { updateStats, updateBinCount } from './ui/topbar.js';
import {
  renderDepotLegend, renderBinList, highlightBinItem,
  setProgress, hideProgress, renderRouteSummary, hideRouteSummary,
  setRefreshCountdown,
} from './ui/sidebar.js';
import { renderDashboard }     from './ui/dashboard.js';
import { renderNotifications } from './ui/notifications.js';
import { renderAnalytics }     from './ui/analytics.js';
import { showModal, hideModal, updateModal } from './ui/modal.js';

// ════════════════════════════════════════════════════
// APP STATE
// ════════════════════════════════════════════════════

let currentCity = 'bangalore';
let bins        = [];
let depots      = [];
let isRouting   = false;
let addMode     = false;
let binCounter  = 1;
let countdown   = AUTO_REFRESH_SECONDS;

// ════════════════════════════════════════════════════
// BOOTSTRAP
// ════════════════════════════════════════════════════

function bootstrap() {
  depots = generateDepots(currentCity);
  bins   = generateBins(currentCity);
  assignBinsToDepots(bins, depots);

  initMap(CITIES[currentCity].center, onMapClick);
  renderDepots(depots);
  renderAllBinMarkers(bins, depots, onBinClick);

  renderDepotLegend(depots);
  renderBinList(bins, depots, onBinClick);

  refreshAllUI();
  startRefreshLoop();
  wireEventListeners();
}

// ════════════════════════════════════════════════════
// UI REFRESH HELPERS
// ════════════════════════════════════════════════════

function refreshAllUI() {
  updateStats(bins);
  updateBinCount(bins.length);
  renderDashboard(bins, depots);
  renderNotifications(bins);
  renderAnalytics(bins, depots, onPriorityChipClick);
}

// ════════════════════════════════════════════════════
// EVENT WIRING
// ════════════════════════════════════════════════════

function wireEventListeners() {
  initTabs();

  document.getElementById('citySelect').addEventListener('change', onCityChange);
  document.getElementById('btnAdd').addEventListener('click', toggleAddMode);
  document.getElementById('btnGreedy').addEventListener('click', runGreedy);
  document.getElementById('btnHybrid').addEventListener('click', runHybrid);
  document.getElementById('btnClear').addEventListener('click', clearRoutes);
  document.getElementById('simBtn').addEventListener('click', simulateFillChange);
}

// ════════════════════════════════════════════════════
// CITY CHANGE
// ════════════════════════════════════════════════════

function onCityChange() {
  currentCity = document.getElementById('citySelect').value;
  depots      = generateDepots(currentCity);
  bins        = generateBins(currentCity);
  binCounter  = 1;
  assignBinsToDepots(bins, depots);

  flyToCity(CITIES[currentCity].center);
  clearRoutes();

  renderDepots(depots);
  renderAllBinMarkers(bins, depots, onBinClick);
  renderDepotLegend(depots);
  renderBinList(bins, depots, onBinClick);
  refreshAllUI();

  document.getElementById('anaCity').textContent = CITIES[currentCity].name;
}

// ════════════════════════════════════════════════════
// BIN PLACEMENT
// ════════════════════════════════════════════════════

function toggleAddMode() {
  addMode = !addMode;
  const btn = document.getElementById('btnAdd');
  btn.classList.toggle('active', addMode);
  btn.textContent = addMode ? '✕ Cancel' : '＋ Place Bin';
  document.getElementById('addHint').classList.toggle('vis', addMode);
  const mapEl = getMap()?.getContainer();
  if (mapEl) mapEl.style.cursor = addMode ? 'crosshair' : '';
}

function onMapClick(e) {
  if (!addMode) return;

  const fill  = Math.floor(Math.random() * 100);
  const newBin = {
    id:            `BIN-C${String(binCounter++).padStart(3, '0')}`,
    lat:           e.latlng.lat,
    lng:           e.latlng.lng,
    fill,
    zone:          'Custom',
    capacity:      240,
    lastCollected: 'Never',
    lastUpdated:   'Just now',
    depotId:       null,
    extended:      false,
  };

  // Assign to nearest depot (extended if outside radius)
  let bestDepot = null, bestDist = Infinity, isExtended = false;
  depots.forEach(d => {
    const dist = haversine(newBin.lat, newBin.lng, d.lat, d.lng);
    if (dist <= d.radius && dist < bestDist) { bestDist = dist; bestDepot = d; isExtended = false; }
  });
  if (!bestDepot) {
    depots.forEach(d => {
      const dist = haversine(newBin.lat, newBin.lng, d.lat, d.lng);
      if (dist < bestDist) { bestDist = dist; bestDepot = d; isExtended = true; }
    });
  }
  newBin.depotId  = bestDepot?.id ?? null;
  newBin.extended = isExtended;

  bins.push(newBin);
  addBinMarker(newBin, depots, onBinClick);
  renderBinList(bins, depots, onBinClick);
  refreshAllUI();
  toggleAddMode();
}

// ════════════════════════════════════════════════════
// BIN INTERACTIONS
// ════════════════════════════════════════════════════

function onBinClick(id) {
  const bin = bins.find(b => b.id === id);
  if (!bin) return;
  flyTo(bin.lat, bin.lng, 16);
  openBinPopup(id);
  highlightBinItem(id);
}

function onPriorityChipClick(id) {
  switchToMap();
  setTimeout(() => onBinClick(id), 150);
}

// ════════════════════════════════════════════════════
// ROUTE CLEARING
// ════════════════════════════════════════════════════

function clearRoutes() {
  clearRouteLayers();
  // Restore clean bin markers
  bins.forEach(b => refreshBinMarker(b, depots, onBinClick));
  hideRouteSummary();
  hideProgress();
}

// ════════════════════════════════════════════════════
// GREEDY ROUTING
// ════════════════════════════════════════════════════

async function runGreedy() {
  if (isRouting) return;
  clearRoutes();
  isRouting = true;
  setButtons(true);
  setProgress('Building greedy routes…', 15);

  // Yield to browser so progress bar renders
  await tick();

  const routes = buildGreedyRoutes(bins, depots);
  await drawAllRoutes(routes, false);

  isRouting = false;
  setButtons(false);
  setProgress('Done', 100);
  setTimeout(hideProgress, 1200);
}

// ════════════════════════════════════════════════════
// HYBRID ROUTING  (ACO + LNS + ILS)
// ════════════════════════════════════════════════════

async function runHybrid() {
  if (isRouting) return;
  clearRoutes();
  isRouting = true;
  setButtons(true);
  showModal();

  const eligible = bins.filter(b => b.fill >= MIN_FILL && b.depotId);
  const tasks    = [];

  depots.forEach((depot, di) => {
    const depotBins = eligible.filter(b => b.depotId === depot.id);
    for (let ti = 0; ti < TRUCKS_PER_DEPOT; ti++) {
      tasks.push({
        depotIdx: di,
        truckIdx: ti,
        depot,
        bins:  depotBins.filter((_, i) => i % TRUCKS_PER_DEPOT === ti),
        color: routeColor(di, ti),
      });
    }
  });

  const results = new Array(tasks.length);

  // Process each truck task, yielding between them for modal updates
  for (let idx = 0; idx < tasks.length; idx++) {
    const t   = tasks[idx];
    const pct = Math.round(5 + (idx / tasks.length) * 72);

    updateModal(pct, [
      { name: '🔍 Depot Assignment',  desc: 'Complete',                       status: 'done'    },
      { name: `🐜 ACO — ${t.depot.name} T${t.truckIdx + 1}`, desc: `${t.bins.length} bins · ${50} iters`, status: 'active'  },
      { name: '🔁 LNS + 2-opt',       desc: 'Running…',                       status: 'active'  },
      { name: `🔀 ILS (3 restarts)`,  desc: 'Running…',                       status: 'active'  },
    ]);

    await tick(); // let the modal update paint

    results[idx] = { ...t, bins: hybridOptimise(t.depot, t.bins) };
  }

  updateModal(80, [
    { name: '🔍 Depot Assignment', desc: 'Complete',               status: 'done'   },
    { name: '🐜 ACO',              desc: 'Complete',               status: 'done'   },
    { name: '🔁 LNS + 2-opt',      desc: 'Complete',               status: 'done'   },
    { name: '🛣️ OSRM Roads',       desc: 'Fetching road geometry…',status: 'active' },
  ]);

  await drawAllRoutes(results, true);

  hideModal();
  isRouting = false;
  setButtons(false);
}

// ════════════════════════════════════════════════════
// DRAW ROUTES  (shared by greedy + hybrid)
// ════════════════════════════════════════════════════

async function drawAllRoutes(routes, useOSRM) {
  clearRouteLayers();

  let totalDist  = 0;
  let totalDur   = 0;
  let totalBins  = 0;
  let osrmOk     = 0;
  let osrmFail   = 0;

  for (const route of routes) {
    if (!route.bins?.length) continue;
    totalBins += route.bins.length;

    const waypoints = [
      { lat: route.depot.lat, lng: route.depot.lng },
      ...route.bins.map(b => ({ lat: b.lat, lng: b.lng })),
      { lat: route.depot.lat, lng: route.depot.lng },
    ];

    let geometry = null;

    if (useOSRM) {
      setProgress(`OSRM: ${route.depot.name} T${route.truckIdx + 1}…`, 85);
      geometry = await fetchRoadRoute(waypoints);
      if (geometry) { osrmOk++;  }
      else          { osrmFail++; }
    }

    if (!geometry) {
      geometry = straightLineMetrics(waypoints, haversine);
    }

    totalDist += geometry.dist;
    totalDur  += geometry.dur;

    drawPolyline(geometry.coords, route.color, !useOSRM);

    // Numbered stop markers
    route.bins.forEach((b, idx) => {
      drawRouteStopMarker(b, idx + 1, route.color, depots);
    });

    placeTruckMarker(route.depot.lat, route.depot.lng, route.color,
      `${route.depot.name} Truck ${route.truckIdx + 1}`);
  }

  // Fit map to all bins
  const allBinLLs = getAllBinLatLngs(bins.filter(b => b.fill >= MIN_FILL && b.depotId));
  fitBounds(allBinLLs.map(ll => [ll.lat, ll.lng]));

  const activeTrucks = routes.filter(r => r.bins?.length).length;
  const roadsLabel   = useOSRM
    ? (osrmOk > 0 ? `${osrmOk}/${osrmOk + osrmFail} road-snapped` : 'straight-line fallback')
    : 'straight-line (greedy mode)';

  renderRouteSummary({
    algorithm:   useOSRM ? 'ACO + LNS + ILS' : 'Greedy Nearest-Neighbour',
    activeTrucks,
    totalTrucks: routes.length,
    totalBins,
    totalDist,
    totalDur,
    roadsLabel,
  });

  setProgress('Complete', 100);
}

// ════════════════════════════════════════════════════
// SIMULATE FILL CHANGES
// ════════════════════════════════════════════════════

function simulateFillChange() {
  const icon = document.getElementById('simI');
  icon.style.animation = 'spin .6s linear infinite';

  bins.forEach(b => {
    b.fill         = Math.min(100, Math.max(0, b.fill + Math.floor(Math.random() * 14) - 5));
    b.lastUpdated  = 'Just now';
    refreshBinMarker(b, depots, onBinClick);
  });

  setTimeout(() => {
    icon.style.animation = '';
    renderBinList(bins, depots, onBinClick);
    refreshAllUI();
  }, 700);
}

// ════════════════════════════════════════════════════
// AUTO-REFRESH LOOP
// ════════════════════════════════════════════════════

function startRefreshLoop() {
  setInterval(() => {
    countdown--;
    setRefreshCountdown(countdown);

    if (countdown <= 0) {
      countdown = AUTO_REFRESH_SECONDS;

      bins.forEach(b => {
        if (Math.random() > (1 - FILL_DRIFT_PROB)) {
          b.fill        = Math.min(100, b.fill + Math.floor(Math.random() * 3) + 1);
          b.lastUpdated = 'Just now';
          refreshBinMarker(b, depots, onBinClick);
        }
      });

      renderBinList(bins, depots, onBinClick);
      updateStats(bins);
    }
  }, 1000);
}

// ════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════

function setButtons(disabled) {
  document.getElementById('btnGreedy').disabled = disabled;
  document.getElementById('btnHybrid').disabled = disabled;
}

/** Yield execution to the browser for one frame. */
function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// ════════════════════════════════════════════════════
// ENTRY
// ════════════════════════════════════════════════════
bootstrap();
initIotLive();