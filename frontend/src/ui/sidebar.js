/**
 * ui/sidebar.js
 * ─────────────────────────────────────────────
 * Renders the map sidebar:
 *   - Depot legend
 *   - Bin list (sorted by fill)
 *   - Progress bar
 *   - Route summary
 */

import { fillColor, statusInfo } from '../utils/colors.js';

// ── DEPOT LEGEND ────────────────────────────────────

export function renderDepotLegend(depots) {
  document.getElementById('depotLegend').innerHTML = depots
    .map(
      d => `<div class="depot-leg">
              <div class="depot-leg-sq" style="background:${d.color};"></div>
              <span style="font-size:12px;">${d.name}</span>
              <span style="margin-left:auto;font-size:10px;font-family:var(--fm);color:var(--muted);">${d.radius}km</span>
            </div>`
    )
    .join('');
}

// ── BIN LIST ────────────────────────────────────────

export function renderBinList(bins, depots, onClickCb) {
  const sorted = [...bins].sort((a, b) => b.fill - a.fill);

  document.getElementById('binList').innerHTML = sorted
    .map(b => {
      const col    = fillColor(b.fill);
      const depot  = depots.find(d => d.id === b.depotId);
      const dColor = depot?.color ?? 'var(--muted)';
      const extTag = b.extended ? ' ⚠ext' : '';

      return `<div class="bli" id="bli-${b.id}" data-bin-id="${b.id}">
                <div style="width:7px;height:7px;border-radius:50%;background:${col};box-shadow:0 0 5px ${col};flex-shrink:0;"></div>
                <div class="bli-bar-wrap">
                  <div class="bli-id">${b.id}</div>
                  <div class="bli-bar">
                    <div class="bli-fill" style="width:${b.fill}%;background:${col};"></div>
                  </div>
                  <div class="bli-depot" style="color:${dColor};">${b.depotId ?? '—'}${extTag}</div>
                </div>
                <div class="bli-pct" style="color:${col};">${b.fill}%</div>
              </div>`;
    })
    .join('');

  // Attach click handlers after render
  document.querySelectorAll('.bli').forEach(el => {
    el.addEventListener('click', () => onClickCb(el.dataset.binId));
  });
}

export function highlightBinItem(id) {
  document.querySelectorAll('.bli').forEach(el => el.classList.remove('sel'));
  const el = document.getElementById(`bli-${id}`);
  if (el) {
    el.classList.add('sel');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ── PROGRESS ────────────────────────────────────────

export function setProgress(label, pct) {
  document.getElementById('progWrap').style.display = '';
  document.getElementById('progPhase').textContent  = label;
  document.getElementById('progPct').textContent    = pct + '%';
  document.getElementById('progFill').style.width   = pct + '%';
}

export function hideProgress() {
  document.getElementById('progWrap').style.display = 'none';
}

// ── ROUTE SUMMARY ───────────────────────────────────

export function renderRouteSummary({ algorithm, activeTrucks, totalTrucks, totalBins, totalDist, totalDur, roadsLabel }) {
  document.getElementById('routeSum').innerHTML = `
    <div><span style="color:var(--muted)">Algorithm: </span><span class="ri">${algorithm}</span></div>
    <div><span style="color:var(--muted)">Active trucks: </span><span class="ri">${activeTrucks}/${totalTrucks}</span></div>
    <div><span style="color:var(--muted)">Total stops: </span><span class="ri">${totalBins}</span></div>
    <div><span style="color:var(--muted)">Distance: </span><span class="ri">${totalDist.toFixed(1)} km</span></div>
    <div><span style="color:var(--muted)">Est. time: </span><span class="ri">${Math.ceil(totalDur)} min</span></div>
    <div><span style="color:var(--muted)">Roads: </span><span class="ri">${roadsLabel}</span></div>`;
  document.getElementById('routeSumSec').style.display = '';
}

export function hideRouteSummary() {
  document.getElementById('routeSumSec').style.display = 'none';
}

// ── REFRESH COUNTDOWN ───────────────────────────────

export function setRefreshCountdown(seconds) {
  document.getElementById('rcd').textContent = seconds + 's';
}
