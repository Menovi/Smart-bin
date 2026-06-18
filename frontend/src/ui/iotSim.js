// src/ui/iotSim.js — IoT Simulation tab (ThingSpeak / Blynk + fleet runner)
import { simulatorStatus, startSimulator, stopSimulator } from '../api/client.js';

// ── Mini sparkline chart from recent values ───────────────────────────
const binHistories = {};  // bin_id → [{fill_pct, ts}]

export function recordTelemetry(bin_id, fill_pct, timestamp) {
  if (!binHistories[bin_id]) binHistories[bin_id] = [];
  binHistories[bin_id].push({ fill_pct, ts: timestamp || new Date().toISOString() });
  if (binHistories[bin_id].length > 30) binHistories[bin_id].shift();
  refreshSimCards();
}

function sparkline(data, colour) {
  if (!data?.length) return '';
  const W = 120, H = 36;
  const vals = data.map(d => d.fill_pct);
  const min = Math.min(...vals), max = Math.max(...vals, min + 1);
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1 || 1)) * W;
    const y = H - ((v - min) / (max - min)) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${W}" height="${H}" style="display:block;">
    <polyline points="${pts}" fill="none" stroke="${colour}" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;
}

function refreshSimCards() {
  const grid = document.getElementById('sim-card-grid');
  if (!grid) return;
  const ids = Object.keys(binHistories);
  if (!ids.length) return;
  grid.innerHTML = ids.map(id => {
    const hist    = binHistories[id];
    const latest  = hist[hist.length - 1];
    const fill    = latest.fill_pct;
    const colour  = fill >= 90 ? '#ff1744' : fill >= 75 ? '#ff6d00' : fill >= 60 ? '#ffea00' : '#00e676';
    return `
      <div style="background:#111720;border:1px solid #1e2d42;border-radius:10px;padding:14px;min-width:0;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-family:'Space Mono',monospace;font-size:11px;color:#00e5ff;font-weight:700;">${id}</span>
          <span style="font-size:18px;font-weight:800;font-family:'Space Mono',monospace;color:${colour};">${fill.toFixed(0)}%</span>
        </div>
        ${sparkline(hist, colour)}
        <div style="height:4px;background:#1e2d42;border-radius:2px;overflow:hidden;margin-top:6px;">
          <div style="height:100%;background:${colour};width:${fill}%;transition:width .4s;border-radius:2px;"></div>
        </div>
      </div>`;
  }).join('');
}

// ── ThingSpeak embed ──────────────────────────────────────────────────
function buildThingSpeakEmbed(channelId, readKey) {
  const area = document.getElementById('ts-embed-area');
  if (!channelId) {
    area.innerHTML = `<div style="color:#637496;font-size:12px;text-align:center;padding:20px;">
      Enter your ThingSpeak Channel ID above and click Load.</div>`;
    return;
  }
  const base = `https://thingspeak.com/channels/${channelId}`;
  const keyParam = readKey ? `&api_key=${readKey}` : '';
  area.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <iframe src="${base}/charts/1?width=100%&height=200&results=30${keyParam}&type=line&title=Fill+Level+(%25)"
        style="width:100%;height:220px;border:1px solid #1e2d42;border-radius:8px;background:#111720;" frameborder="0"></iframe>
      <iframe src="${base}/charts/2?width=100%&height=200&results=30${keyParam}&type=line&title=Battery+(%25)"
        style="width:100%;height:220px;border:1px solid #1e2d42;border-radius:8px;background:#111720;" frameborder="0"></iframe>
      <a href="${base}" target="_blank"
        style="grid-column:1/-1;text-align:center;color:#00e5ff;font-size:12px;text-decoration:none;padding:6px;">
        ↗ Open full ThingSpeak channel
      </a>
    </div>`;
}

// ── Simulator controls ────────────────────────────────────────────────
async function buildSimControls() {
  const wrap = document.getElementById('sim-controls-wrap');
  if (!wrap) return;

  async function syncBtn() {
    const btn = document.getElementById('simRunBtn');
    const dot = document.getElementById('simRunDot');
    if (!btn) return;
    try {
      const s = await simulatorStatus();
      if (s.running) {
        btn.textContent = '⏹ Stop Simulator';
        btn.style.background = '#ff1744';
        btn.style.color = '#fff';
        dot.style.background = '#00e676';
        dot.style.boxShadow = '0 0 6px #00e676';
      } else {
        btn.textContent = '▶ Start Simulator';
        btn.style.background = '#00e676';
        btn.style.color = '#000';
        dot.style.background = '#888';
        dot.style.boxShadow = 'none';
      }
    } catch { /* backend not running */ }
  }

  await syncBtn();

  document.getElementById('simRunBtn').addEventListener('click', async () => {
    const btn = document.getElementById('simRunBtn');
    btn.disabled = true;
    try {
      const s = await simulatorStatus();
      if (s.running) {
        await stopSimulator();
      } else {
        const n = parseInt(document.getElementById('sim-bin-count').value) || 12;
        await startSimulator(n);
      }
      await syncBtn();
    } finally { btn.disabled = false; }
  });
}

// ── Main panel builder ────────────────────────────────────────────────
export function initIotSim() {
  const panel = document.getElementById('panel-iotsim');
  if (!panel) return;

  panel.innerHTML = `
    <div style="height:100%;overflow-y:auto;padding:24px;color:#fff;max-width:1000px;">

      <!-- Header -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
        <h2 style="font-family:Syne;margin:0;font-size:20px;">📡 IoT Simulation</h2>
        <span style="background:rgba(124,77,255,.12);border:1px solid rgba(124,77,255,.3);
              color:#7c4dff;font-size:10px;font-weight:700;letter-spacing:.08em;
              padding:3px 10px;border-radius:12px;">MQTT · ThingSpeak · Blynk</span>
      </div>
      <p style="color:#637496;margin:0 0 22px;font-size:12px;line-height:1.6;max-width:700px;">
        Simulate the ESP32 fleet locally and visualise telemetry through cloud IoT platforms.
        Run the MQTT fleet simulator, then mirror data to ThingSpeak or Blynk for rich charting.
      </p>

      <!-- Two-column layout -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:22px;">

        <!-- Simulator controls -->
        <div style="background:#111720;border:1px solid #1e2d42;border-radius:10px;padding:18px;">
          <div style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#637496;margin-bottom:14px;">
            MQTT FLEET SIMULATOR
          </div>
          <div id="sim-controls-wrap">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
              <span id="simRunDot" style="width:8px;height:8px;border-radius:50%;background:#888;flex-shrink:0;"></span>
              <span style="font-size:12px;color:#637496;">fleet_runner.py</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
              <label style="font-size:12px;color:#637496;">Bins:
                <input id="sim-bin-count" type="number" min="1" max="50" value="12"
                  style="width:52px;padding:5px 8px;background:#0a0e14;border:1px solid #1e2d42;
                         color:#fff;border-radius:6px;margin-left:6px;font-family:Syne;outline:none;">
              </label>
              <button id="simRunBtn"
                style="flex:1;padding:9px 0;background:#00e676;color:#000;border:none;
                       border-radius:7px;font-weight:700;cursor:pointer;font-family:Syne;font-size:12px;
                       transition:background .2s;">
                ▶ Start Simulator
              </button>
            </div>
            <div style="font-size:10px;color:#2a3d5c;line-height:1.7;">
              Spawns <code style="color:#637496;">fleet_runner.py --bins N</code> on the backend.
              Bins publish telemetry every 5 s to <code style="color:#637496;">broker.hivemq.com</code>.
            </div>
          </div>
        </div>

        <!-- Blynk setup -->
        <div style="background:#111720;border:1px solid #1e2d42;border-radius:10px;padding:18px;">
          <div style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#637496;margin-bottom:14px;">
            BLYNK SETUP
          </div>
          <div style="font-size:12px;line-height:2;color:#e8f0fe;">
            <div>1. Create project at <a href="https://blynk.io" target="_blank" style="color:#00e5ff;">blynk.io</a></div>
            <div>2. Add <strong>Gauge</strong> widget → V0 (Fill %)</div>
            <div>3. Add <strong>Chart</strong> widget → V1 (Battery %)</div>
            <div>4. In ESP32 firmware, use <code style="color:#637496;">Blynk.virtualWrite(V0, fill_pct)</code></div>
            <div>5. Flash firmware with your Auth Token</div>
          </div>
          <a href="https://docs.blynk.io/en/getting-started/what-do-i-need-to-blynk" target="_blank"
            style="display:inline-block;margin-top:10px;font-size:11px;color:#7c4dff;text-decoration:none;">
            ↗ Blynk Getting Started Guide
          </a>
        </div>
      </div>

      <!-- Live simulator cards -->
      <div style="background:#111720;border:1px solid #1e2d42;border-radius:10px;padding:18px;margin-bottom:22px;">
        <div style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#637496;margin-bottom:14px;">
          LIVE SIMULATED BIN TELEMETRY
        </div>
        <div id="sim-card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;">
          <div style="color:#637496;font-size:12px;padding:20px;text-align:center;grid-column:1/-1;">
            Start the simulator — bin cards with sparklines will appear here.
          </div>
        </div>
      </div>

      <!-- ThingSpeak embed -->
      <div style="background:#111720;border:1px solid #1e2d42;border-radius:10px;padding:18px;">
        <div style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#637496;margin-bottom:6px;">
          THINGSPEAK CHANNEL
        </div>
        <p style="font-size:11px;color:#637496;margin:0 0 12px;line-height:1.6;">
          Enter your ThingSpeak Channel ID to embed live charts directly.
          Field 1 = fill %, Field 2 = battery %.
          <a href="https://thingspeak.com/channels/new" target="_blank" style="color:#00e5ff;">Create a channel →</a>
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
          <input id="ts-channel-id" type="text" placeholder="Channel ID  e.g. 2345678"
            style="flex:1;min-width:160px;padding:8px 12px;background:#0a0e14;border:1px solid #1e2d42;
                   color:#fff;border-radius:7px;font-family:Syne;font-size:12px;outline:none;">
          <input id="ts-read-key" type="text" placeholder="Read API Key (if private)"
            style="flex:1;min-width:200px;padding:8px 12px;background:#0a0e14;border:1px solid #1e2d42;
                   color:#fff;border-radius:7px;font-family:Syne;font-size:12px;outline:none;">
          <button id="ts-load-btn"
            style="padding:8px 18px;background:#00e5ff;color:#000;border:none;border-radius:7px;
                   font-weight:700;cursor:pointer;font-family:Syne;font-size:12px;">
            Load
          </button>
        </div>
        <div id="ts-embed-area">
          <div style="color:#637496;font-size:12px;text-align:center;padding:20px;">
            Enter your ThingSpeak Channel ID above and click Load.
          </div>
        </div>
      </div>

    </div>`;

  // Wire ThingSpeak load button
  document.getElementById('ts-load-btn').addEventListener('click', () => {
    const cid = document.getElementById('ts-channel-id').value.trim();
    const key = document.getElementById('ts-read-key').value.trim();
    if (cid) localStorage.setItem('sb_ts_channel', cid);
    if (key) localStorage.setItem('sb_ts_key', key);
    buildThingSpeakEmbed(cid, key);
  });

  // Restore saved ThingSpeak config
  const savedCid = localStorage.getItem('sb_ts_channel');
  const savedKey = localStorage.getItem('sb_ts_key');
  if (savedCid) {
    document.getElementById('ts-channel-id').value = savedCid;
    document.getElementById('ts-read-key').value   = savedKey || '';
    buildThingSpeakEmbed(savedCid, savedKey);
  }

  buildSimControls();
}
