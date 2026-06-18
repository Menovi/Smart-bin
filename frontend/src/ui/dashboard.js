/**
 * ui/dashboard.js
 * ─────────────────────────────────────────────
 * Renders the Dashboard tab:
 *   - 5 KPI cards
 *   - Per-depot fleet cards
 *   - Full bin data table
 */

import { fillColor, statusInfo } from '../utils/colors.js';
import { TRUCKS_PER_DEPOT }      from '../config/constants.js';

export function renderDashboard(bins, depots) {
  if (!bins.length) {
    renderEmptyState();
    return;
  }
  renderKPIs(bins);
  renderDepotFleet(bins, depots);
  renderDataTable(bins, depots);
}

function renderEmptyState() {
  document.getElementById('kpiRow').innerHTML = '';
  document.getElementById('depotFleet').innerHTML = '';
  document.getElementById('dataTbl').innerHTML = `
    <div style="
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:60px 24px;text-align:center;gap:16px;
    ">
      <div style="font-size:48px;">🗑️</div>
      <div style="font-size:20px;font-weight:800;color:var(--text);">No bins yet in your area</div>
      <div style="font-size:13px;color:var(--muted);max-width:360px;line-height:1.7;">
        Go to the <strong style="color:var(--accent)">Live Map</strong> tab and click
        <strong style="color:var(--accent)">＋ Place Bin</strong> to start adding
        bins to your municipality. Your dashboard will update automatically.
      </div>
      <div style="display:flex;gap:10px;margin-top:8px;">
        <button onclick="document.querySelector('[data-tab=map]').click()"
          style="padding:10px 22px;background:var(--accent);color:#000;border:none;
                 border-radius:8px;font-family:Syne;font-weight:700;font-size:13px;cursor:pointer;">
          🗺️ Go to Map
        </button>
        <button onclick="document.getElementById('btnDemo').click();document.querySelector('[data-tab=map]').click()"
          style="padding:10px 22px;background:rgba(124,77,255,.15);color:var(--accent2);
                 border:1px solid rgba(124,77,255,.4);border-radius:8px;font-family:Syne;
                 font-weight:700;font-size:13px;cursor:pointer;">
          🎬 View Demo
        </button>
      </div>
    </div>`;
}

// ── KPI CARDS ───────────────────────────────────────

function renderKPIs(bins) {
  const critical  = bins.filter(b => b.fill >= 90).length;
  const high      = bins.filter(b => b.fill >= 75 && b.fill < 90).length;
  const moderate  = bins.filter(b => b.fill >= 60 && b.fill < 75).length;
  const ok        = bins.filter(b => b.fill < 60).length;
  const avg       = bins.length ? Math.round(bins.reduce((s, b) => s + b.fill, 0) / bins.length) : 0;
  const extended  = bins.filter(b => b.extended).length;

  document.getElementById('kpiRow').innerHTML = `
    <div class="kpi r">
      <div class="kpi-lbl">Critical ≥90%</div>
      <div class="kpi-val">${critical}</div>
      <div class="kpi-sub">Immediate action</div>
    </div>
    <div class="kpi o">
      <div class="kpi-lbl">High ≥75%</div>
      <div class="kpi-val">${high}</div>
      <div class="kpi-sub">Collect within 2h</div>
    </div>
    <div class="kpi y">
      <div class="kpi-lbl">Moderate ≥60%</div>
      <div class="kpi-val">${moderate}</div>
      <div class="kpi-sub">Monitor</div>
    </div>
    <div class="kpi g">
      <div class="kpi-lbl">Fleet Avg Fill</div>
      <div class="kpi-val">${avg}%</div>
      <div class="kpi-sub">${ok} bins OK</div>
    </div>
    <div class="kpi b">
      <div class="kpi-lbl">Extended Dispatch</div>
      <div class="kpi-val">${extended}</div>
      <div class="kpi-sub">Outside primary zone</div>
    </div>`;
}

// ── DEPOT FLEET CARDS ───────────────────────────────

function renderDepotFleet(bins, depots) {
  document.getElementById('depotFleet').innerHTML = depots
    .map(d => {
      const dBins    = bins.filter(b => b.depotId === d.id);
      const dCrit    = dBins.filter(b => b.fill >= 90).length;
      const dExt     = dBins.filter(b => b.extended).length;
      const dAvg     = dBins.length
        ? Math.round(dBins.reduce((s, b) => s + b.fill, 0) / dBins.length)
        : 0;

      const trucks = Array.from({ length: TRUCKS_PER_DEPOT }, (_, i) => `
        <div class="truck-chip" style="color:${d.truckColor};border-color:${d.color}44;background:${d.color}11;">
          🚛 T${i + 1}
        </div>`).join('');

      return `<div class="depot-card">
        <div class="depot-card-hdr">
          <div class="depot-card-dot" style="background:${d.color};box-shadow:0 0 8px ${d.color};"></div>
          <div class="depot-card-name">${d.name}</div>
        </div>
        <div class="depot-truck-row">${trucks}</div>
        <div class="depot-stats">
          <div>Assigned: <span style="color:var(--text);font-weight:700;">${dBins.length}</span></div>
          <div>Critical: <span style="color:${dCrit > 0 ? 'var(--red)' : 'var(--green)'};font-weight:700;">${dCrit}</span></div>
          <div>Extended: <span style="color:${dExt > 0 ? 'var(--yellow)' : 'var(--green)'};font-weight:700;">${dExt}</span></div>
          <div>Avg fill: <span style="color:${fillColor(dAvg)};font-weight:700;">${dAvg}%</span></div>
          <div>Coverage: <span style="color:var(--text);">${d.radius} km</span></div>
        </div>
      </div>`;
    })
    .join('');
}

// ── DATA TABLE ──────────────────────────────────────

function renderDataTable(bins, depots) {
  const sorted = [...bins].sort((a, b) => b.fill - a.fill);

  const rows = sorted.map(b => {
    const col        = fillColor(b.fill);
    const { label, cls } = statusInfo(b.fill);
    const depot      = depots.find(d => d.id === b.depotId);
    const dColor     = depot?.color ?? 'var(--muted)';
    const extBadge   = b.extended
      ? ` <span style="color:#ffea00;font-size:9px;">⚠ext</span>`
      : '';

    return `<tr>
      <td class="td-id">${b.id}</td>
      <td style="font-size:11px;">${b.zone}</td>
      <td class="td-co">${b.lat.toFixed(4)}°N, ${b.lng.toFixed(4)}°E</td>
      <td>
        <div style="display:flex;align-items:center;gap:7px;">
          <div class="mb"><div class="mb-f" style="width:${b.fill}%;background:${col};"></div></div>
          <span style="font-family:var(--fm);font-size:11px;font-weight:700;color:${col};">${b.fill}%</span>
        </div>
      </td>
      <td><span class="sch ${cls}">${label}</span></td>
      <td style="font-size:11px;font-family:var(--fm);color:${dColor};">${b.depotId ?? '—'}${extBadge}</td>
      <td style="font-size:11px;font-family:var(--fm);">${b.capacity}L</td>
      <td style="font-size:11px;color:var(--muted);">${b.lastCollected}</td>
    </tr>`;
  });

  document.getElementById('dataTbl').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Bin ID</th><th>Zone</th><th>Coordinates</th>
          <th>Fill</th><th>Status</th><th>Depot</th>
          <th>Capacity</th><th>Last Collected</th>
        </tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
}
