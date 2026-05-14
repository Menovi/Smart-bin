/**
 * ui/analytics.js
 * ─────────────────────────────────────────────
 * Renders the Analytics tab:
 *   - Horizontal fill-level bar chart
 *   - SVG donut chart (status distribution)
 *   - Priority collection queue chips
 */

import { fillColor } from '../utils/colors.js';

export function renderAnalytics(bins, depots, onChipClick) {
  renderBarChart(bins);
  renderDonut(bins);
  renderPriorityQueue(bins, depots, onChipClick);
}

// ── BAR CHART ───────────────────────────────────────

function renderBarChart(bins) {
  const sorted = [...bins].sort((a, b) => b.fill - a.fill);

  document.getElementById('barChart').innerHTML = sorted
    .map(b => {
      const col = fillColor(b.fill);
      return `<div class="bar-row">
                <div class="bar-lbl">${b.id.replace('BIN-', '')}</div>
                <div class="bar-track">
                  <div class="bar-fill" style="width:${b.fill}%;background:${col};">${b.fill}%</div>
                </div>
              </div>`;
    })
    .join('');
}

// ── DONUT CHART ─────────────────────────────────────

function renderDonut(bins) {
  const total    = bins.length;
  const critical = bins.filter(b => b.fill >= 90).length;
  const high     = bins.filter(b => b.fill >= 75 && b.fill < 90).length;
  const moderate = bins.filter(b => b.fill >= 60 && b.fill < 75).length;
  const ok       = bins.filter(b => b.fill < 60).length;

  const segments = [
    { v: critical, c: '#ff1744', l: 'Critical ≥90%' },
    { v: high,     c: '#ff6d00', l: 'High ≥75%'     },
    { v: moderate, c: '#ffea00', l: 'Moderate ≥60%' },
    { v: ok,       c: '#00e676', l: 'Normal <60%'   },
  ];

  const R    = 58;
  const cx   = 70;
  const cy   = 70;
  const sw   = 20;
  const circ = 2 * Math.PI * R;
  let offset = 0;

  const paths = segments.map(s => {
    const frac = total > 0 ? s.v / total : 0;
    const dash = frac * circ;
    const el   = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none"
                    stroke="${s.c}" stroke-width="${sw}"
                    stroke-dasharray="${dash} ${circ - dash}"
                    stroke-dashoffset="${-offset}"
                    opacity="${frac > 0 ? 1 : 0}"/>`;
    offset += dash;
    return el;
  });

  const legend = segments
    .map(s => `<div class="dl-row">
                  <div class="dl-dot" style="background:${s.c};"></div>
                  <span>${s.l}</span>
                  <span class="dl-val" style="color:${s.c};">${s.v}</span>
                </div>`)
    .join('');

  document.getElementById('donutWrap').innerHTML = `
    <div style="position:relative;">
      <svg width="140" height="140" class="donut-svg">
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="none"
          stroke="var(--border)" stroke-width="${sw}"/>
        ${paths.join('')}
      </svg>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;">
        <div style="font-size:18px;font-weight:800;font-family:var(--fm);">${total}</div>
        <div style="font-size:9px;color:var(--muted);">BINS</div>
      </div>
    </div>
    <div class="dl">${legend}</div>`;
}

// ── PRIORITY QUEUE ───────────────────────────────────

function renderPriorityQueue(bins, depots, onChipClick) {
  const queue = bins
    .filter(b => b.fill >= 50)
    .sort((a, b) => b.fill - a.fill);

  document.getElementById('pqWrap').innerHTML = queue
    .map((b, i) => {
      const col    = fillColor(b.fill);
      const depot  = depots.find(d => d.id === b.depotId);
      const dColor = depot?.color ?? 'var(--muted)';
      const dLabel = b.depotId ? b.depotId.replace('DEPOT-', 'D') : '—';

      return `<div class="pq-chip" data-bin-id="${b.id}">
                <span style="font-family:var(--fm);font-size:10px;color:var(--muted);">#${i + 1}</span>
                <div style="width:7px;height:7px;border-radius:50%;background:${col};box-shadow:0 0 5px ${col};"></div>
                <span style="font-family:var(--fm);font-size:11px;font-weight:700;">${b.id}</span>
                <span style="font-family:var(--fm);font-size:11px;color:${col};font-weight:800;">${b.fill}%</span>
                <span style="font-size:10px;color:${dColor};">${dLabel}</span>
              </div>`;
    })
    .join('');

  document.querySelectorAll('.pq-chip').forEach(el => {
    el.addEventListener('click', () => onChipClick(el.dataset.binId));
  });
}
