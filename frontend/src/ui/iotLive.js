// src/ui/iotLive.js — Smart Bin prototype panel + Detection panel + toasts
import L from 'leaflet';
import { getMap } from '../map/mapController.js';
import { connect, on } from '../api/ws.js';
import {
  listBins, getLatestTelemetry, listAlerts, ackAlert,
  detectImage, recentDetections, deleteDetection, ASSET,
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
      <small>Smart Bin · ${id}</small><br>
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

// ── Smart Bin prototype panel ─────────────────────────────────────────
async function buildSmartBinPanel() {
  const panel = document.getElementById('panel-iotlive');
  panel.innerHTML = `
    <div style="padding:24px;color:#fff;max-width:900px;">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:6px;">
        <h2 style="font-family:Syne;margin:0;font-size:20px;">🔌 Smart Bin Prototype</h2>
        <span style="background:rgba(0,230,118,.12);border:1px solid rgba(0,230,118,.3);
              color:#00e676;font-size:10px;font-weight:700;letter-spacing:.08em;
              padding:3px 10px;border-radius:12px;">ESP32 · HC-SR04 · MQTT</span>
        <span id="ws-dot-wrap" style="display:flex;align-items:center;gap:5px;font-size:11px;color:#637496;">
          <span id="ws-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#888;"></span>
          <span id="ws-status">Connecting…</span>
        </span>
      </div>
      <p style="color:#637496;margin:0 0 20px;font-size:12px;line-height:1.6;">
        Live telemetry from the physical ESP32 prototype at NITK Surathkal.
        The bin streams fill-level data via HC-SR04 ultrasonic sensor over MQTT.
      </p>

      <!-- Prototype hardware card -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;">
        <div style="background:#111720;border:1px solid #1e2d42;border-radius:10px;padding:16px;">
          <div style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#637496;margin-bottom:10px;">HARDWARE</div>
          <div style="font-size:12px;line-height:2;color:#e8f0fe;">
            <div>🔲 Microcontroller: <span style="color:#00e5ff;font-weight:700;">ESP32</span></div>
            <div>📡 Sensor: <span style="color:#00e5ff;font-weight:700;">HC-SR04 Ultrasonic</span></div>
            <div>🌐 Protocol: <span style="color:#00e5ff;font-weight:700;">MQTT (broker.hivemq.com)</span></div>
            <div>🔋 Power: <span style="color:#00e5ff;font-weight:700;">Battery backup</span></div>
          </div>
        </div>
        <div style="background:#111720;border:1px solid #1e2d42;border-radius:10px;padding:16px;">
          <div style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#637496;margin-bottom:10px;">MQTT TOPICS</div>
          <div style="font-size:11px;line-height:2.2;font-family:'Space Mono',monospace;color:#637496;">
            <div style="color:#00e676;">smartbin/+/telemetry</div>
            <div style="color:#ffea00;">smartbin/+/event</div>
            <div style="color:#00e5ff;font-size:10px;margin-top:4px;">Broker: broker.hivemq.com:1883</div>
          </div>
        </div>
      </div>

      <!-- Live bin cards from MQTT -->
      <div style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#637496;margin-bottom:10px;">
        LIVE BINS <span id="live-bin-count" style="color:#00e5ff;font-family:'Space Mono',monospace;"></span>
      </div>
      <div id="iot-bin-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;"></div>

      <div id="iot-empty" style="display:none;padding:40px;text-align:center;color:#637496;">
        <div style="font-size:36px;margin-bottom:12px;">📡</div>
        <div style="font-size:14px;font-weight:700;margin-bottom:6px;color:#e8f0fe;">Waiting for prototype data</div>
        <div style="font-size:12px;line-height:1.6;">
          Power on the ESP32 and it will appear here automatically.<br>
          To test with simulated bins, use the <strong style="color:#7c4dff;">IoT Simulation</strong> tab.
        </div>
      </div>
    </div>`;

  // WS status dot
  on('_status', ({ data }) => {
    const dot    = document.getElementById('ws-dot');
    const status = document.getElementById('ws-status');
    if (dot) dot.style.background = data.connected ? '#00e676' : '#888';
    if (status) status.textContent = data.connected ? 'Connected' : 'Disconnected';
  });

  // Hydrate from REST — only the prototype bin
  const bins = await listBins();
  for (const b of bins) {
    if (b.id !== 'BIN-PROTOTYPE') continue;
    const t = await getLatestTelemetry(b.id);
    if (t) upsertLiveBin({ ...b, ...t });
  }
  renderIotList();

  on('telemetry', ({ bin_id, data }) => {
    if (bin_id !== 'BIN-PROTOTYPE') return;
    upsertLiveBin({ id: bin_id, ...data });
    renderIotList();
  });
}

async function renderIotList() {
  const list  = document.getElementById('iot-bin-list');
  const empty = document.getElementById('iot-empty');
  const count = document.getElementById('live-bin-count');
  if (!list) return;

  const allBins = await listBins();
  const proto   = allBins.filter(b => b.id === 'BIN-PROTOTYPE');
  const rows    = await Promise.all(proto.map(async b => {
    const t = await getLatestTelemetry(b.id);
    return { ...b, ...(t || {}) };
  }));
  rows.sort((a, b) => (b.fill_pct ?? 0) - (a.fill_pct ?? 0));

  if (count) count.textContent = `(${rows.length})`;

  if (!rows.length) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  const colour = colourFor;
  list.innerHTML = rows.map(r => {
    const fill = r.fill_pct ?? null;
    const bat  = r.battery_pct ?? null;
    const c    = colour(fill);
    return `
      <div style="background:#111720;border:1px solid #1e2d42;border-radius:10px;padding:14px;position:relative;overflow:hidden;">
        <div style="position:absolute;top:0;left:0;right:0;height:2px;background:${c};"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-family:'Space Mono',monospace;font-size:11px;font-weight:700;color:#00e5ff;">${r.id}</span>
          <span style="width:8px;height:8px;border-radius:50%;background:${c};box-shadow:0 0 6px ${c};"></span>
        </div>
        <div style="font-size:28px;font-weight:800;font-family:'Space Mono',monospace;color:${c};margin-bottom:6px;">
          ${fill != null ? fill.toFixed(0) + '%' : '—'}
        </div>
        <div style="height:5px;background:#1e2d42;border-radius:3px;overflow:hidden;margin-bottom:8px;">
          <div style="height:100%;border-radius:3px;background:${c};width:${fill ?? 0}%;transition:width .5s;"></div>
        </div>
        <div style="font-size:11px;color:#637496;display:flex;gap:10px;">
          <span>🔋 ${bat != null ? bat.toFixed(0) + '%' : '—'}</span>
          <span>${r.name || ''}</span>
        </div>
        ${r.timestamp ? `<div style="font-size:9px;color:#2a3d5c;margin-top:4px;font-family:'Space Mono',monospace;">${new Date(r.timestamp).toLocaleTimeString()}</div>` : ''}
      </div>`;
  }).join('');
}

// ── Detection panel ───────────────────────────────────────────────────
function buildDetectionPanel() {
  const panel = document.getElementById('panel-detection');
  panel.innerHTML = `
    <div style="padding:24px;color:#fff;max-width:860px;">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:6px;">
        <h2 style="font-family:Syne;margin:0;font-size:20px;">🧠 Litter Detection</h2>
        <span style="background:rgba(0,229,255,.1);border:1px solid rgba(0,229,255,.25);
              color:#00e5ff;font-size:10px;font-weight:700;letter-spacing:.08em;
              padding:3px 10px;border-radius:12px;">YOLOv11-CA</span>
      </div>
      <p style="color:#637496;margin:0 0 18px;font-size:12px;line-height:1.6;">
        Upload an image to detect litter around a bin using the <strong style="color:#e8f0fe;">YOLOv11-CA</strong> model
        (Coordinate Attention-enhanced). Detects 5 classes: biological, cardboard, metal, paper, plastic.
      </p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
        <input type="text" id="det-bin" placeholder="Bin ID (optional)"
          style="padding:8px 12px;background:#111720;border:1px solid #1e2d42;color:#fff;border-radius:7px;flex:1;min-width:180px;font-family:Syne;outline:none;">
        <input type="file" id="det-file" accept="image/*" capture="environment"
          style="padding:8px;background:#111720;border:1px solid #1e2d42;color:#fff;border-radius:7px;flex:1;min-width:200px;">
        <button id="det-go"
          style="background:#00e5ff;color:#000;border:none;padding:10px 22px;border-radius:7px;font-weight:700;cursor:pointer;font-family:Syne;font-size:13px;">
          DETECT
        </button>
      </div>
      <div id="det-result"></div>
      <div style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#637496;margin:22px 0 10px;">
        RECENT DETECTIONS
      </div>
      <div id="det-recent" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;"></div>
    </div>`;

  document.getElementById('det-go').onclick = async () => {
    const f = document.getElementById('det-file').files?.[0];
    if (!f) { alert('Pick an image'); return; }
    const binId = document.getElementById('det-bin').value || null;
    const btn   = document.getElementById('det-go');
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
  const el     = document.getElementById('det-result');
  const imgPath = res.annotated_path || res.image_path;
  if (!res.classes?.length) {
    el.innerHTML = `
      <div style="background:#0a2820;padding:14px;border-radius:9px;border-left:3px solid #00e676;margin-bottom:12px;">
        <strong style="color:#00e676;">✓ No litter detected</strong>
        <img src="${ASSET(imgPath)}" style="display:block;max-width:420px;margin-top:10px;border-radius:7px;">
      </div>`;
    return;
  }
  const list = res.classes.map(c =>
    `<li><b style="color:#00e676;">${c.class}</b> · ${(c.confidence * 100).toFixed(0)}%</li>`
  ).join('');
  el.innerHTML = `
    <div style="background:${res.has_litter_outside ? '#280a0a' : '#161618'};padding:16px;border-radius:9px;
         border-left:3px solid ${res.has_litter_outside ? '#ff1744' : '#ffea00'};
         display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;">
      <img src="${ASSET(imgPath)}" style="max-width:400px;border-radius:7px;">
      <div style="flex:1;min-width:200px;">
        <strong style="font-size:17px;">${res.num_detections} detection(s)</strong>
        <ul style="padding-left:20px;margin-top:8px;">${list}</ul>
        ${res.has_litter_outside ? '<p style="color:#ff1744;font-weight:700;margin-top:8px;">⚠ Litter outside the bin — alert raised</p>' : ''}
      </div>
    </div>`;
}

async function loadRecentDetections() {
  const el = document.getElementById('det-recent');
  if (!el) return;
  const items = await recentDetections(12);
  el.innerHTML = items.map(d => `
    <figure data-det-id="${d.id}" style="margin:0;background:#111720;border:1px solid #1e2d42;border-radius:9px;overflow:hidden;position:relative;">
      <button class="det-del-btn" data-id="${d.id}"
        style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,.7);border:1px solid rgba(255,23,68,.4);
               color:#ff1744;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700;cursor:pointer;
               font-family:Syne;line-height:1.6;z-index:2;">✕</button>
      <img src="${ASSET(d.annotated_path || d.image_path)}" style="width:100%;display:block;">
      <figcaption style="padding:7px 10px;font-size:11px;color:#637496;">
        ${d.bin_id || '—'} · ${d.num_detections} item(s)
        ${d.has_litter_outside ? '<span style="background:#ff1744;color:#fff;padding:1px 6px;border-radius:3px;margin-left:4px;">litter outside</span>' : ''}
      </figcaption>
    </figure>`).join('');

  el.querySelectorAll('.det-del-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      btn.textContent = '…'; btn.disabled = true;
      await deleteDetection(id);
      document.querySelector(`figure[data-det-id="${id}"]`)?.remove();
    });
  });
}

// ── Toast notifications ───────────────────────────────────────────────
function toast(alert) {
  const t = document.createElement('div');
  const colour = alert.severity === 'critical' ? '#ff1744' : '#ff6d00';
  t.style.cssText = `position:fixed;right:20px;bottom:20px;background:#111720;color:#fff;
    padding:14px 18px;border-radius:9px;box-shadow:0 10px 30px rgba(0,0,0,.5);
    border-left:4px solid ${colour};min-width:280px;z-index:9999;font-family:Syne;
    transform:translateX(110%);transition:transform 240ms ease;`;
  t.innerHTML = `
    <div style="font-size:10px;color:${colour};letter-spacing:.08em;text-transform:uppercase;">
      ${alert.severity} · ${alert.type}
    </div>
    <div style="margin-top:4px;font-size:13px;">${alert.message}</div>`;
  document.body.appendChild(t);
  setTimeout(() => t.style.transform = 'translateX(0)', 10);
  setTimeout(() => { t.style.transform = 'translateX(110%)'; setTimeout(() => t.remove(), 300); }, 6000);
}

// ── Public init ───────────────────────────────────────────────────────
export function initIotLive() {
  buildSmartBinPanel();
  buildDetectionPanel();
  connect();
  on('alert', ({ data }) => toast(data));
}
