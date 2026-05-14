// src/ui/iotLive.js — live IoT layer + detection panel + toast notifications
import L from 'leaflet';
import { getMap } from '../map/mapController.js';
import { connect, on } from '../api/ws.js';
import {
  listBins, getLatestTelemetry, listAlerts, ackAlert,
  detectImage, recentDetections, ASSET,
} from '../api/client.js';

const liveMarkers = new Map();

function colourFor(fillPct) {
  if (fillPct == null) return '#9ca3af';
  if (fillPct >= 90) return '#ff1744';
  if (fillPct >= 75) return '#ff6d00';
  if (fillPct >= 60) return '#ffea00';
  return '#00e676';
}

function upsertLiveBin({ id, name, lat, lng, fill_pct, battery_pct, timestamp }) {
  const map = getMap();
  if (!map) return;
  const colour = colourFor(fill_pct);
  const popup = `
    <div style="font-family:Syne;color:#000;">
      <strong>${name || id}</strong><br>
      <small>IoT Bin · ${id}</small><br>
      Fill: <b>${fill_pct?.toFixed?.(1) ?? '—'}%</b><br>
      Battery: ${battery_pct?.toFixed?.(0) ?? '—'}%<br>
      <small>${timestamp ? new Date(timestamp).toLocaleTimeString() : ''}</small>
    </div>`;
  let m = liveMarkers.get(id);
  if (!m) {
    m = L.circleMarker([lat, lng], {
      radius: 11, color: '#fff', weight: 2,
      fillColor: colour, fillOpacity: 0.95,
      className: 'live-iot-marker',
    }).addTo(map);
    m.bindPopup(popup);
    m.bindTooltip(`📡 ${id}`, { direction: 'top' });
    liveMarkers.set(id, m);
  } else {
    m.setLatLng([lat, lng]);
    m.setStyle({ fillColor: colour });
    m.setPopupContent(popup);
  }
}

// ── IoT Live panel ────────────────────────────────────────────────
async function buildIotPanel() {
  const panel = document.getElementById('panel-iotlive');
  panel.innerHTML = `
    <div style="padding:24px;color:#fff;">
      <h2 style="font-family:Syne;margin:0 0 8px;">📡 Live IoT Bins (MQTT)</h2>
      <p style="color:#aaa;margin:0 0 16px;">
        Live data streamed from simulated ESP32 bins. Connection:
        <span id="ws-dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#888;margin-left:6px;"></span>
      </p>
      <div id="iot-bin-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;"></div>
    </div>`;

  on('_status', ({ data }) => {
    const dot = document.getElementById('ws-dot');
    if (dot) dot.style.background = data.connected ? '#00e676' : '#888';
  });

  // Hydrate from REST
  const bins = await listBins();
  for (const b of bins) {
    const t = await getLatestTelemetry(b.id);
    if (t) upsertLiveBin({ ...b, ...t });
  }
  renderIotList();

  on('telemetry', ({ bin_id, data }) => {
    upsertLiveBin({ id: bin_id, ...data });
    renderIotList();
  });
}

async function renderIotList() {
  const list = document.getElementById('iot-bin-list');
  if (!list) return;
  const bins = await listBins();
  const rows = await Promise.all(bins.map(async b => {
    const t = await getLatestTelemetry(b.id);
    return { ...b, ...(t || {}) };
  }));
  rows.sort((a, b) => (b.fill_pct ?? 0) - (a.fill_pct ?? 0));
  list.innerHTML = rows.map(r => `
    <div style="background:#161618;border:1px solid #2a2a2c;border-radius:8px;padding:12px;color:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>${r.id}</strong>
        <span style="width:10px;height:10px;border-radius:50%;background:${colourFor(r.fill_pct)};"></span>
      </div>
      <div style="font-size:24px;font-weight:700;margin:6px 0;">${r.fill_pct?.toFixed?.(0) ?? '—'}%</div>
      <div style="color:#aaa;font-size:11px;">🔋 ${r.battery_pct?.toFixed?.(0) ?? '—'}% · ${r.name || ''}</div>
    </div>`).join('');
}

// ── Detection panel ───────────────────────────────────────────────
function buildDetectionPanel() {
  const panel = document.getElementById('panel-detection');
  panel.innerHTML = `
    <div style="padding:24px;color:#fff;">
      <h2 style="font-family:Syne;margin:0 0 8px;">🧠 Litter Detection (YOLOv11)</h2>
      <p style="color:#aaa;margin:0 0 16px;">Upload an image — the YOLO model will detect litter and raise an alert if found outside the bin.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
        <input type="text" id="det-bin" placeholder="Bin ID (optional)" style="padding:8px 12px;background:#161618;border:1px solid #2a2a2c;color:#fff;border-radius:6px;flex:1;min-width:180px;">
        <input type="file" id="det-file" accept="image/*" capture="environment" style="padding:8px;background:#161618;border:1px solid #2a2a2c;color:#fff;border-radius:6px;flex:1;min-width:200px;">
        <button id="det-go" style="background:#00e676;color:#000;border:none;padding:10px 20px;border-radius:6px;font-weight:700;cursor:pointer;font-family:Syne;">DETECT</button>
      </div>
      <div id="det-result"></div>
      <h3 style="font-family:Syne;margin:24px 0 8px;">Recent</h3>
      <div id="det-recent" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;"></div>
    </div>`;

  document.getElementById('det-go').onclick = async () => {
    const f = document.getElementById('det-file').files?.[0];
    if (!f) { alert('Pick an image'); return; }
    const binId = document.getElementById('det-bin').value || null;
    const btn = document.getElementById('det-go');
    btn.disabled = true; btn.textContent = 'ANALYSING…';
    try {
      const res = await detectImage(f, binId);
      renderDetectionResult(res);
      loadRecentDetections();
    } catch (e) {
      document.getElementById('det-result').innerHTML = `<div style="color:#ff1744;">${e.message}</div>`;
    } finally {
      btn.disabled = false; btn.textContent = 'DETECT';
    }
  };
  loadRecentDetections();
}

function renderDetectionResult(res) {
  const el = document.getElementById('det-result');
  const imgPath = res.annotated_path || res.image_path;
  if (!res.classes?.length) {
    el.innerHTML = `<div style="background:#0a2820;padding:12px;border-radius:8px;border-left:3px solid #00e676;">
      <strong style="color:#00e676;">No litter detected</strong>
      <img src="${ASSET(imgPath)}" style="display:block;max-width:380px;margin-top:8px;border-radius:6px;">
    </div>`;
    return;
  }
  const list = res.classes.map(c =>
    `<li><b style="color:#00e676;">${c.class}</b> · ${(c.confidence*100).toFixed(0)}%</li>`
  ).join('');
  el.innerHTML = `
    <div style="background:${res.has_litter_outside ? '#280a0a' : '#161618'};padding:16px;border-radius:8px;border-left:3px solid ${res.has_litter_outside ? '#ff1744' : '#ffea00'};display:flex;gap:16px;flex-wrap:wrap;">
      <img src="${ASSET(imgPath)}" style="max-width:380px;border-radius:6px;">
      <div style="flex:1;min-width:200px;">
        <strong style="font-size:18px;">${res.num_detections} detection(s)</strong>
        <ul style="padding-left:20px;">${list}</ul>
        ${res.has_litter_outside ? '<p style="color:#ff1744;font-weight:700;">⚠ Litter outside the bin — alert raised</p>' : ''}
      </div>
    </div>`;
}

async function loadRecentDetections() {
  const el = document.getElementById('det-recent');
  if (!el) return;
  const items = await recentDetections(8);
  el.innerHTML = items.map(d => `
    <figure style="margin:0;background:#161618;border-radius:8px;overflow:hidden;">
      <img src="${ASSET(d.annotated_path || d.image_path)}" style="width:100%;display:block;">
      <figcaption style="padding:6px 8px;font-size:11px;color:#aaa;">
        ${d.bin_id || '—'} · ${d.num_detections} item(s)
        ${d.has_litter_outside ? '<span style="background:#ff1744;color:#fff;padding:1px 6px;border-radius:3px;margin-left:4px;">litter outside</span>' : ''}
      </figcaption>
    </figure>`).join('');
}

// ── Toast notifications ───────────────────────────────────────────
function toast(alert) {
  const t = document.createElement('div');
  const colour = alert.severity === 'critical' ? '#ff1744' : '#ff6d00';
  t.style.cssText = `position:fixed;right:20px;bottom:20px;background:#161618;color:#fff;padding:14px 18px;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.5);border-left:4px solid ${colour};min-width:280px;z-index:9999;font-family:Syne;transform:translateX(110%);transition:transform 240ms ease;`;
  t.innerHTML = `<div style="font-size:11px;color:${colour};letter-spacing:.08em;">${alert.severity.toUpperCase()} · ${alert.type}</div><div style="margin-top:4px;">${alert.message}</div>`;
  document.body.appendChild(t);
  setTimeout(() => t.style.transform = 'translateX(0)', 10);
  setTimeout(() => { t.style.transform = 'translateX(110%)'; setTimeout(() => t.remove(), 300); }, 6000);
}

// ── Public init ───────────────────────────────────────────────────
export function initIotLive() {
  buildIotPanel();
  buildDetectionPanel();
  connect();
  on('alert', ({ data }) => toast(data));
}