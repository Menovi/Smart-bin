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
import { on as wsOn } from './api/ws.js';
import { deleteBin } from './api/client.js';
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
  refreshBinMarker, deleteBinMarker, openBinPopup,
  drawPolyline, drawRouteStopMarker, placeTruckMarker,
  clearRouteLayers, getAllBinLatLngs,
} from './map/mapController.js';

// ── Services ────────────────────────────────────────
import { fetchRoadRoute, straightLineMetrics } from './services/osrm.js';
import { haversine }                           from './utils/geo.js';

// ── UI ──────────────────────────────────────────────
import { initTabs, switchToMap, switchTab } from './ui/tabs.js';
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
import { checkSession, showAuthScreen, clearSession, getUser } from './ui/auth.js';

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

// Demo mode: when true, bins/depots are the generated sample dataset
let demoMode    = false;
let demoBins    = [];
let demoDepots  = [];
// User's own bins & depots (persisted in localStorage)
let userBins    = [];
let userDepots  = [];

const DEPOT_COLORS = ['#7c4dff','#00bcd4','#ff9800','#00e676','#f44336','#2196f3','#e91e63','#ffeb3b'];

function loadUserData() {
  try {
    const b = localStorage.getItem('sb_user_bins');
    if (b) userBins = JSON.parse(b);
  } catch { userBins = []; }
  try {
    const d = localStorage.getItem('sb_user_depots');
    if (d) userDepots = JSON.parse(d);
  } catch { userDepots = []; }
}
function saveUserData() {
  localStorage.setItem('sb_user_bins',   JSON.stringify(userBins));
  localStorage.setItem('sb_user_depots', JSON.stringify(userDepots));
}

// ════════════════════════════════════════════════════
// BOOTSTRAP
// ════════════════════════════════════════════════════

function bootstrap() {
  loadUserData();

  // Generate demo dataset but don't display it yet
  demoDepots = generateDepots(currentCity);
  demoBins   = generateBins(currentCity);
  assignBinsToDepots(demoBins, demoDepots);

  // User starts with their own area (from localStorage or generated defaults)
  if (!userDepots.length) userDepots = generateDepots(currentCity);

  bins   = userBins;
  depots = userDepots;

  initMap(CITIES[currentCity].center, onMapClick);
  renderDepots(depots);
  renderAllBinMarkers(bins, depots, onBinClick, onBinContextMenu);
  renderDepotLegend(depots, onDeleteDepot, onEditDepot);
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
  document.getElementById('btnDemo').addEventListener('click', () => toggleDemoMode(!demoMode));
  document.getElementById('demoBannerExit').addEventListener('click', () => toggleDemoMode(false));
  document.getElementById('btnAddDepot').addEventListener('click', () => showDepotModal(null));
}

// ════════════════════════════════════════════════════
// DEMO MODE
// ════════════════════════════════════════════════════

function toggleDemoMode(enable) {
  demoMode = enable;

  const btn    = document.getElementById('btnDemo');
  const banner = document.getElementById('demoBanner');
  const hint   = document.getElementById('demoHint');

  const addDepotBtn = document.getElementById('btnAddDepot');
  if (demoMode) {
    bins   = demoBins;
    depots = demoDepots;
    btn.textContent = '✕ Exit Demo';
    btn.classList.add('demo-active');
    banner.classList.add('vis');
    hint.textContent = 'Demo data loaded. Exit demo to manage your own depots and bins.';
    if (addDepotBtn) addDepotBtn.style.display = 'none';
  } else {
    bins   = userBins;
    depots = userDepots;
    btn.textContent = '🎬 Load Demo';
    btn.classList.remove('demo-active');
    banner.classList.remove('vis');
    hint.textContent = 'Place your own bins below, or load the demo to explore all features.';
    if (addDepotBtn) addDepotBtn.style.display = '';
  }

  clearRouteLayers();
  renderDepots(depots);
  renderAllBinMarkers(bins, depots, onBinClick, onBinContextMenu);
  // hide depot edit/delete buttons in demo mode
  renderDepotLegend(depots, demoMode ? null : onDeleteDepot, demoMode ? null : onEditDepot);
  renderBinList(bins, depots, onBinClick);
  refreshAllUI();
}

// ════════════════════════════════════════════════════
// CITY CHANGE
// ════════════════════════════════════════════════════

function onCityChange() {
  currentCity = document.getElementById('citySelect').value;
  binCounter  = 1;

  demoDepots = generateDepots(currentCity);
  demoBins   = generateBins(currentCity);
  assignBinsToDepots(demoBins, demoDepots);

  userDepots = generateDepots(currentCity);
  userBins   = [];
  saveUserData();
  // note: bins list reassigned below

  depots = demoMode ? demoDepots : userDepots;
  bins   = demoMode ? demoBins   : userBins;

  flyToCity(CITIES[currentCity].center);
  clearRoutes();
  renderDepots(depots);
  renderAllBinMarkers(bins, depots, onBinClick, onBinContextMenu);
  renderDepotLegend(depots, onDeleteDepot, onEditDepot);
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
  toggleAddMode(); // exit add mode immediately while modal is open

  const autoId = `BIN-${currentCity.slice(0,3).toUpperCase()}-${String(binCounter).padStart(3,'0')}`;
  showBinPlacementModal(autoId, e.latlng.lat, e.latlng.lng);
}

function showBinPlacementModal(autoId, lat, lng) {
  // Remove any existing modal
  document.getElementById('binPlaceModal')?.remove();

  const m = document.createElement('div');
  m.id = 'binPlaceModal';
  m.style.cssText = `position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.65);
    display:flex;align-items:center;justify-content:center;font-family:Syne;`;
  m.innerHTML = `
    <div style="background:#111720;border:1px solid #1e2d42;border-radius:12px;padding:28px;width:360px;">
      <div style="font-size:16px;font-weight:800;margin-bottom:18px;color:#e8f0fe;">📍 New Bin Details</div>
      <div style="margin-bottom:14px;">
        <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.08em;color:#637496;margin-bottom:5px;">BIN ID</label>
        <input id="bpm-id" value="${autoId}" style="width:100%;padding:9px 12px;background:#0a0e14;border:1px solid #1e2d42;
          color:#e8f0fe;border-radius:7px;font-family:Syne;font-size:13px;outline:none;box-sizing:border-box;">
        <div style="font-size:10px;color:#2a3d5c;margin-top:4px;">Unique identifier used for tracking (e.g. BIN-BLR-001)</div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.08em;color:#637496;margin-bottom:5px;">LOCATION NAME</label>
        <input id="bpm-name" placeholder="e.g. MG Road Junction" style="width:100%;padding:9px 12px;background:#0a0e14;
          border:1px solid #1e2d42;color:#e8f0fe;border-radius:7px;font-family:Syne;font-size:13px;outline:none;box-sizing:border-box;">
      </div>
      <div style="margin-bottom:20px;">
        <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.08em;color:#637496;margin-bottom:5px;">CAPACITY (L)</label>
        <input id="bpm-cap" type="number" value="240" min="50" max="2000" style="width:100%;padding:9px 12px;background:#0a0e14;
          border:1px solid #1e2d42;color:#e8f0fe;border-radius:7px;font-family:Syne;font-size:13px;outline:none;box-sizing:border-box;">
      </div>
      <div style="font-size:10px;color:#2a3d5c;margin-bottom:16px;">
        📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}
      </div>
      <div id="bpm-err" style="color:#ff1744;font-size:11px;margin-bottom:10px;display:none;"></div>
      <div style="display:flex;gap:10px;">
        <button id="bpm-cancel" style="flex:1;padding:10px;background:transparent;border:1px solid #1e2d42;
          color:#637496;border-radius:7px;font-family:Syne;font-weight:700;cursor:pointer;">Cancel</button>
        <button id="bpm-confirm" style="flex:2;padding:10px;background:#00e5ff;color:#000;border:none;
          border-radius:7px;font-family:Syne;font-weight:700;cursor:pointer;">Place Bin</button>
      </div>
    </div>`;

  document.body.appendChild(m);

  document.getElementById('bpm-cancel').onclick = () => m.remove();

  document.getElementById('bpm-confirm').onclick = () => {
    const id   = document.getElementById('bpm-id').value.trim();
    const name = document.getElementById('bpm-name').value.trim() || id;
    const cap  = parseInt(document.getElementById('bpm-cap').value) || 240;
    const err  = document.getElementById('bpm-err');

    if (!id) { err.textContent = 'Bin ID is required.'; err.style.display = 'block'; return; }
    if (bins.find(b => b.id === id)) { err.textContent = 'This Bin ID already exists.'; err.style.display = 'block'; return; }

    const newBin = {
      id, lat, lng, fill: 0, zone: name, capacity: cap,
      lastCollected: 'Never', lastUpdated: 'Just now', depotId: null, extended: false,
    };

    // Assign nearest depot
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

    binCounter++;
    bins.push(newBin);
    if (!demoMode) { userBins = bins; saveUserData(); }
    addBinMarker(newBin, depots, onBinClick, onBinContextMenu);
    renderBinList(bins, depots, onBinClick);
    refreshAllUI();
    m.remove();
  };
}

// ── Right-click context menu ──────────────────────────────────────────
function onBinContextMenu(binId, mouseEvent) {
  // Remove any existing context menu
  document.getElementById('binCtxMenu')?.remove();

  const bin = bins.find(b => b.id === binId);
  if (!bin) return;

  const menu = document.createElement('div');
  menu.id = 'binCtxMenu';
  menu.style.cssText = `position:fixed;z-index:9400;background:#111720;border:1px solid #1e2d42;
    border-radius:9px;padding:8px;min-width:200px;font-family:Syne;box-shadow:0 8px 28px rgba(0,0,0,.6);`;
  menu.style.left = `${mouseEvent.clientX}px`;
  menu.style.top  = `${mouseEvent.clientY}px`;

  menu.innerHTML = `
    <div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:#637496;padding:4px 8px 8px;border-bottom:1px solid #1e2d42;margin-bottom:6px;">
      ${bin.id}
    </div>
    <div id="ctx-fill-section" style="padding:6px 8px;">
      <div style="font-size:11px;color:#e8f0fe;margin-bottom:6px;">📊 Set Fill Level</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <input id="ctx-fill-slider" type="range" min="0" max="100" value="${bin.fill}"
          style="flex:1;accent-color:#00e5ff;">
        <span id="ctx-fill-val" style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;
          color:#00e5ff;min-width:36px;">${bin.fill}%</span>
      </div>
      <button id="ctx-fill-apply"
        style="width:100%;margin-top:8px;padding:7px;background:#00e5ff;color:#000;border:none;
          border-radius:6px;font-family:Syne;font-weight:700;font-size:11px;cursor:pointer;">
        Apply
      </button>
    </div>
    <div style="border-top:1px solid #1e2d42;margin:6px 0;"></div>
    <button id="ctx-delete"
      style="width:100%;padding:8px;background:rgba(255,23,68,.08);border:1px solid rgba(255,23,68,.25);
        color:#ff1744;border-radius:6px;font-family:Syne;font-weight:700;font-size:11px;cursor:pointer;">
      🗑️ Delete Bin
    </button>`;

  document.body.appendChild(menu);

  // Slider live preview
  const slider = document.getElementById('ctx-fill-slider');
  const valLbl = document.getElementById('ctx-fill-val');
  slider.oninput = () => { valLbl.textContent = slider.value + '%'; };

  // Apply fill
  document.getElementById('ctx-fill-apply').onclick = () => {
    bin.fill = parseInt(slider.value);
    bin.lastUpdated = 'Just now';
    if (!demoMode) { userBins = bins; saveUserData(); }
    refreshBinMarker(bin, depots, onBinClick, onBinContextMenu);
    renderBinList(bins, depots, onBinClick);
    refreshAllUI();
    menu.remove();
  };

  // Delete bin
  document.getElementById('ctx-delete').onclick = async () => {
    menu.remove();
    deleteBinMarker(binId);
    const idx = bins.findIndex(b => b.id === binId);
    if (idx !== -1) bins.splice(idx, 1);
    if (!demoMode) { userBins = bins; saveUserData(); }
    // Remove from backend DB (IoT bins only, not local-generated)
    try { await deleteBin(binId); } catch { /* local-only bin, ignore */ }
    renderBinList(bins, depots, onBinClick);
    refreshAllUI();
  };

  // Close on click outside
  const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 10);
}

// ════════════════════════════════════════════════════
// DEPOT MANAGEMENT
// ════════════════════════════════════════════════════

function onDeleteDepot(depotId) {
  if (demoMode) return;
  if (depots.length <= 1) { alert('You must have at least one depot.'); return; }
  if (!confirm(`Delete depot ${depotId}? Bins assigned to it will be reassigned.`)) return;

  const idx = userDepots.findIndex(d => d.id === depotId);
  if (idx === -1) return;
  userDepots.splice(idx, 1);

  // Reassign bins that were on this depot
  userBins.forEach(b => { if (b.depotId === depotId) b.depotId = null; });
  assignBinsToDepots(userBins, userDepots);
  bins   = userBins;
  depots = userDepots;
  saveUserData();
  renderDepots(depots);
  renderAllBinMarkers(bins, depots, onBinClick, onBinContextMenu);
  renderDepotLegend(depots, onDeleteDepot, onEditDepot);
  renderBinList(bins, depots, onBinClick);
  refreshAllUI();
}

function onEditDepot(depotId) {
  if (demoMode) return;
  const depot = userDepots.find(d => d.id === depotId);
  if (!depot) return;
  showDepotModal(depot);
}

function showDepotModal(existingDepot) {
  if (demoMode) { alert('Exit demo mode to manage your own depots.'); return; }
  document.getElementById('depotModal')?.remove();

  const isEdit   = !!existingDepot;
  const nextIdx  = userDepots.length;
  const autoId   = existingDepot?.id ?? `DEPOT-${String.fromCharCode(65 + nextIdx)}`;
  const autoName = existingDepot?.name ?? `Depot ${String.fromCharCode(65 + nextIdx)}`;
  const [clat, clng] = CITIES[currentCity].center;
  const defaultLat   = existingDepot?.lat ?? (clat + (Math.random() - 0.5) * 0.1).toFixed(5);
  const defaultLng   = existingDepot?.lng ?? (clng + (Math.random() - 0.5) * 0.1).toFixed(5);

  const colorOpts = DEPOT_COLORS.map(c =>
    `<span class="depot-color-opt" data-color="${c}"
      style="display:inline-block;width:20px;height:20px;border-radius:4px;background:${c};
             cursor:pointer;border:2px solid ${c === (existingDepot?.color ?? DEPOT_COLORS[nextIdx % DEPOT_COLORS.length]) ? '#fff' : 'transparent'};
             margin-right:4px;"></span>`
  ).join('');

  const m = document.createElement('div');
  m.id = 'depotModal';
  m.style.cssText = `position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.65);
    display:flex;align-items:center;justify-content:center;font-family:Syne;`;
  m.innerHTML = `
    <div style="background:#111720;border:1px solid #1e2d42;border-radius:12px;padding:28px;width:380px;">
      <div style="font-size:16px;font-weight:800;margin-bottom:18px;color:#e8f0fe;">
        ${isEdit ? '✎ Edit Depot' : '🏭 New Depot'}
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.08em;color:#637496;margin-bottom:5px;">DEPOT NAME</label>
        <input id="dm-name" value="${autoName}" style="width:100%;padding:9px 12px;background:#0a0e14;border:1px solid #1e2d42;
          color:#e8f0fe;border-radius:7px;font-family:Syne;font-size:13px;outline:none;box-sizing:border-box;">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <div>
          <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.08em;color:#637496;margin-bottom:5px;">TRUCKS</label>
          <input id="dm-trucks" type="number" min="1" max="10" value="${existingDepot?.trucks ?? 2}"
            style="width:100%;padding:9px 12px;background:#0a0e14;border:1px solid #1e2d42;
            color:#e8f0fe;border-radius:7px;font-family:Syne;font-size:13px;outline:none;box-sizing:border-box;">
        </div>
        <div>
          <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.08em;color:#637496;margin-bottom:5px;">CAPACITY / TRUCK (L)</label>
          <input id="dm-cap" type="number" min="100" max="10000" value="${existingDepot?.truckCapacity ?? 1000}"
            style="width:100%;padding:9px 12px;background:#0a0e14;border:1px solid #1e2d42;
            color:#e8f0fe;border-radius:7px;font-family:Syne;font-size:13px;outline:none;box-sizing:border-box;">
        </div>
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.08em;color:#637496;margin-bottom:5px;">COVERAGE RADIUS (km)</label>
        <input id="dm-radius" type="number" min="1" max="50" value="${existingDepot?.radius ?? 6.5}"
          style="width:100%;padding:9px 12px;background:#0a0e14;border:1px solid #1e2d42;
          color:#e8f0fe;border-radius:7px;font-family:Syne;font-size:13px;outline:none;box-sizing:border-box;">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <div>
          <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.08em;color:#637496;margin-bottom:5px;">LATITUDE</label>
          <input id="dm-lat" type="number" step="0.0001" value="${defaultLat}"
            style="width:100%;padding:9px 12px;background:#0a0e14;border:1px solid #1e2d42;
            color:#e8f0fe;border-radius:7px;font-family:Syne;font-size:13px;outline:none;box-sizing:border-box;">
        </div>
        <div>
          <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.08em;color:#637496;margin-bottom:5px;">LONGITUDE</label>
          <input id="dm-lng" type="number" step="0.0001" value="${defaultLng}"
            style="width:100%;padding:9px 12px;background:#0a0e14;border:1px solid #1e2d42;
            color:#e8f0fe;border-radius:7px;font-family:Syne;font-size:13px;outline:none;box-sizing:border-box;">
        </div>
      </div>
      <div style="margin-bottom:18px;">
        <label style="display:block;font-size:10px;font-weight:700;letter-spacing:.08em;color:#637496;margin-bottom:8px;">COLOR</label>
        <div id="dm-colors">${colorOpts}</div>
      </div>
      <div style="display:flex;gap:10px;">
        <button id="dm-cancel" style="flex:1;padding:10px;background:transparent;border:1px solid #1e2d42;
          color:#637496;border-radius:7px;font-family:Syne;font-weight:700;cursor:pointer;">Cancel</button>
        <button id="dm-confirm" style="flex:2;padding:10px;background:#00e5ff;color:#000;border:none;
          border-radius:7px;font-family:Syne;font-weight:700;cursor:pointer;">
          ${isEdit ? 'Save Changes' : 'Add Depot'}
        </button>
      </div>
    </div>`;

  document.body.appendChild(m);

  // Color picker
  let selectedColor = existingDepot?.color ?? DEPOT_COLORS[nextIdx % DEPOT_COLORS.length];
  m.querySelectorAll('.depot-color-opt').forEach(el => {
    el.addEventListener('click', () => {
      selectedColor = el.dataset.color;
      m.querySelectorAll('.depot-color-opt').forEach(o => o.style.borderColor = 'transparent');
      el.style.borderColor = '#fff';
    });
  });

  document.getElementById('dm-cancel').onclick = () => m.remove();

  document.getElementById('dm-confirm').onclick = () => {
    const name   = document.getElementById('dm-name').value.trim() || autoName;
    const trucks = parseInt(document.getElementById('dm-trucks').value) || 2;
    const cap    = parseInt(document.getElementById('dm-cap').value) || 1000;
    const radius = parseFloat(document.getElementById('dm-radius').value) || 6.5;
    const lat    = parseFloat(document.getElementById('dm-lat').value);
    const lng    = parseFloat(document.getElementById('dm-lng').value);

    if (isEdit) {
      const d = userDepots.find(d => d.id === existingDepot.id);
      if (d) { d.name = name; d.trucks = trucks; d.truckCapacity = cap; d.radius = radius;
                d.lat = lat; d.lng = lng; d.color = selectedColor; d.truckColor = selectedColor + '99'; }
    } else {
      userDepots.push({
        id: autoId, name, color: selectedColor, truckColor: selectedColor + '99',
        trucks, truckCapacity: cap, radius, lat, lng,
      });
    }

    assignBinsToDepots(userBins, userDepots);
    bins   = userBins;
    depots = userDepots;
    saveUserData();
    renderDepots(depots);
    renderAllBinMarkers(bins, depots, onBinClick, onBinContextMenu);
    renderDepotLegend(depots, onDeleteDepot, onEditDepot);
    renderBinList(bins, depots, onBinClick);
    refreshAllUI();
    m.remove();
  };
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
  bins.forEach(b => refreshBinMarker(b, depots, onBinClick, onBinContextMenu));
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
// ENTRY — gate behind auth
// ════════════════════════════════════════════════════
async function init() {
  const valid = await checkSession();
  if (valid) {
    startApp(getUser());
  } else {
    showAuthScreen(startApp);
  }
}

function startApp(user) {
  injectUserBadge(user);
  bootstrap();
  initIotLive();
  const dashBtn = document.querySelector('[data-tab="dashboard"]');
  switchTab('dashboard', dashBtn);
}

function injectUserBadge(user) {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;
  const badge = document.createElement('div');
  badge.style.cssText = 'display:flex;align-items:center;gap:10px;margin-left:12px;';
  const roleColor = user.role === 'municipality' ? '#00e5ff' : '#00e676';
  const roleIcon  = user.role === 'municipality' ? '🏛' : '👤';
  badge.innerHTML = `
    <span style="font-size:12px;">
      <span style="color:${roleColor};font-weight:700;">${roleIcon} ${user.name}</span>
      ${user.region ? `<span style="color:var(--muted);font-size:11px;"> · ${user.region}</span>` : ''}
    </span>
    <button id="logoutBtn"
      style="padding:5px 12px;background:transparent;border:1px solid var(--border);
             border-radius:5px;color:var(--muted);font-family:Syne;font-size:11px;cursor:pointer;
             transition:border-color .2s,color .2s;">
      Sign out
    </button>`;
  topbar.appendChild(badge);
  document.getElementById('logoutBtn').addEventListener('click', () => {
    clearSession();
    location.reload();
  });
}

init();