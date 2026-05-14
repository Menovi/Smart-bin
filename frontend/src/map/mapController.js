/**
 * map/mapController.js
 * ─────────────────────────────────────────────
 * Owns the Leaflet map instance and all marker/layer state.
 * Exposes a clean imperative API consumed by main.js.
 */

import L                    from 'leaflet';
import { fillColor, fillGlow, statusInfo } from '../utils/colors.js';

let map;
const binMarkers    = {};
const depotMarkers  = [];
const coverageCircles = [];
let   routeLayers   = [];
let   truckMarkers  = [];

// ── INIT ────────────────────────────────────────────

export function initMap(center, onMapClick) {
  map = L.map('map', { zoomControl: false, attributionControl: false }).setView(center, 13);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.on('click', onMapClick);

  // Hide loading overlay once tiles begin
  setTimeout(() => {
    const el = document.getElementById('mapLoading');
    if (el) el.style.display = 'none';
  }, 2000);
}

export function getMap() { return map; }

export function invalidateSize() {
  if (map) map.invalidateSize();
}

export function flyTo(lat, lng, zoom = 16) {
  if (map) map.flyTo([lat, lng], zoom, { duration: 1 });
}

export function flyToCity(center) {
  if (map) map.flyTo(center, 13, { duration: 1.5 });
}

export function fitBounds(latlngs) {
  if (map && latlngs.length) map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 60] });
}

// ── DEPOTS ──────────────────────────────────────────

export function renderDepots(depots) {
  depotMarkers.forEach(m => map.removeLayer(m));
  coverageCircles.forEach(c => map.removeLayer(c));
  depotMarkers.length = 0;
  coverageCircles.length = 0;

  depots.forEach(d => {
    const icon = L.divIcon({
      html: `<div class="depot-m" style="background:${d.color}22;box-shadow:0 0 14px ${d.color}88;border-color:${d.color};">🏭</div>`,
      className: '', iconSize: [38, 38], iconAnchor: [19, 19],
    });

    const marker = L.marker([d.lat, d.lng], { icon, zIndexOffset: 1000 }).addTo(map);
    marker.bindPopup(`
      <div class="pu">
        <div class="pu-id" style="color:${d.color};">${d.id} — ${d.name}</div>
        <div class="pu-row"><span>Coverage radius</span><span>${d.radius} km</span></div>
        <div class="pu-row"><span>Trucks</span><span>2</span></div>
      </div>`);
    depotMarkers.push(marker);

    const circle = L.circle([d.lat, d.lng], {
      radius:      d.radius * 1000,
      color:       d.color,
      weight:      1.5,
      dashArray:   '6 5',
      fill:        true,
      fillColor:   d.color,
      fillOpacity: 0.04,
      interactive: false,
    }).addTo(map);
    coverageCircles.push(circle);
  });
}

// ── BIN MARKERS ─────────────────────────────────────

export function renderAllBinMarkers(bins, depots) {
  Object.values(binMarkers).forEach(m => map.removeLayer(m));
  Object.keys(binMarkers).forEach(k => delete binMarkers[k]);
  bins.forEach(b => addBinMarker(b, depots));
}

export function addBinMarker(bin, depots, onClickCb) {
  const col         = fillColor(bin.fill);
  const glow        = fillGlow(bin.fill);
  const depot       = depots?.find(d => d.id === bin.depotId);
  const dColor      = depot?.color ?? '#333';
  const borderStyle = bin.extended
    ? `border: 2px dashed ${dColor};`
    : `border: 2.5px solid ${dColor}55;`;

  const icon = L.divIcon({
    html: `<div class="bm" style="background:${col};box-shadow:0 0 9px ${glow},0 2px 6px rgba(0,0,0,.5);${borderStyle}">${bin.fill}%</div>`,
    className: '', iconSize: [34, 34], iconAnchor: [17, 17],
  });

  const marker = L.marker([bin.lat, bin.lng], { icon }).addTo(map);
  const { label, cls } = statusInfo(bin.fill);
  const extTag = bin.extended
    ? `<div class="pu-row"><span>Dispatch</span><span style="color:#ffea00;">⚠ Extended</span></div>`
    : '';

  marker.bindPopup(`
    <div class="pu">
      <div class="pu-id">${bin.id}</div>
      <div class="pu-row"><span>Zone</span><span>${bin.zone}</span></div>
      <div class="pu-row"><span>Fill</span><span style="color:${col};font-weight:800;">${bin.fill}%</span></div>
      <div class="pu-row"><span>Status</span><span class="sch ${cls}">${label}</span></div>
      <div class="pu-row"><span>Depot</span><span style="color:${dColor};">${bin.depotId ?? '—'}</span></div>
      ${extTag}
      <div class="pu-row"><span>Last collected</span><span>${bin.lastCollected}</span></div>
      <div class="pu-bar"><div class="pu-bi" style="width:${bin.fill}%;background:${col};"></div></div>
    </div>`);

  if (onClickCb) marker.on('click', () => onClickCb(bin.id));
  binMarkers[bin.id] = marker;
}

export function refreshBinMarker(bin, depots, onClickCb) {
  if (binMarkers[bin.id]) { map.removeLayer(binMarkers[bin.id]); delete binMarkers[bin.id]; }
  addBinMarker(bin, depots, onClickCb);
}

export function openBinPopup(id) {
  if (binMarkers[id]) binMarkers[id].openPopup();
}

// ── ROUTES ──────────────────────────────────────────

export function drawPolyline(latlngs, color, dashed) {
  const line = L.polyline(latlngs, {
    color,
    weight:    dashed ? 2.5 : 3.5,
    opacity:   0.88,
    dashArray: dashed ? '7 5' : null,
    lineJoin:  'round',
  }).addTo(map);
  routeLayers.push(line);
  return line;
}

export function drawRouteStopMarker(bin, stopNumber, truckColor, depots) {
  const col  = fillColor(bin.fill);
  const glow = fillGlow(bin.fill);

  const icon = L.divIcon({
    html: `<div class="bm" style="background:${col};box-shadow:0 0 9px ${glow};border-color:${truckColor};">
             ${bin.fill}%
             <div class="rn" style="background:${truckColor};color:#fff;">${stopNumber}</div>
           </div>`,
    className: '', iconSize: [34, 34], iconAnchor: [17, 17],
  });

  const marker = L.marker([bin.lat, bin.lng], { icon }).addTo(map);
  marker.bindPopup(`
    <div class="pu">
      <div class="pu-id">${bin.id} — Stop #${stopNumber}</div>
      <div class="pu-row"><span>Fill</span><span style="color:${col};font-weight:800;">${bin.fill}%</span></div>
      <div class="pu-bar"><div class="pu-bi" style="width:${bin.fill}%;background:${col};"></div></div>
    </div>`);

  routeLayers.push(marker);
}

export function placeTruckMarker(lat, lng, color, tooltip) {
  const icon = L.divIcon({
    html: `<div class="truck-m" style="background:${color}33;border-color:${color};box-shadow:0 0 10px ${color}88;">🚛</div>`,
    className: '', iconSize: [30, 30], iconAnchor: [15, 15],
  });
  const marker = L.marker([lat, lng], { icon, zIndexOffset: 500 }).addTo(map);
  marker.bindTooltip(tooltip, { permanent: false, direction: 'top' });
  truckMarkers.push(marker);
}

export function clearRouteLayers() {
  routeLayers.forEach(l => map?.removeLayer(l));
  routeLayers = [];
  truckMarkers.forEach(m => map?.removeLayer(m));
  truckMarkers = [];
}

export function getAllDepotLatLngs() {
  return depotMarkers.map(m => m.getLatLng());
}

export function getAllBinLatLngs(bins) {
  return bins.map(b => L.latLng(b.lat, b.lng));
}
