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

export function renderDepotLegend(depots, onDeleteCb, onEditCb) {
  document.getElementById('depotLegend').innerHTML = depots
    .map(d => `
      <div class="depot-leg" style="align-items:center;">
        <div class="depot-leg-sq" style="background:${d.color};flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${d.name}</div>
          <div style="font-size:9px;font-family:var(--fm);color:var(--muted);">${d.trucks ?? 2} trucks · ${d.truckCapacity ?? 1000}L · ${d.radius}km</div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0;margin-left:4px;">
          <button class="depot-edit-btn" data-id="${d.id}"
            style="padding:2px 6px;background:transparent;border:1px solid var(--border);border-radius:4px;
                   color:var(--muted);font-size:10px;cursor:pointer;font-family:Syne;">✎</button>
          <button class="depot-del-btn" data-id="${d.id}"
            style="padding:2px 6px;background:transparent;border:1px solid rgba(255,23,68,.3);border-radius:4px;
                   color:#ff1744;font-size:10px;cursor:pointer;font-family:Syne;">✕</button>
        </div>
      </div>`)
    .join('');

  if (onDeleteCb) {
    document.querySelectorAll('.depot-del-btn').forEach(btn =>
      btn.addEventListener('click', () => onDeleteCb(btn.dataset.id))
    );
  }
  if (onEditCb) {
    document.querySelectorAll('.depot-edit-btn').forEach(btn =>
      btn.addEventListener('click', () => onEditCb(btn.dataset.id))
    );
  }
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
