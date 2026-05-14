/**
 * ui/notifications.js
 * ─────────────────────────────────────────────
 * Renders the Notifications tab with alert cards
 * for Critical (≥90%) and High (≥75%) bins.
 */

export function renderNotifications(bins) {
  const critical = bins.filter(b => b.fill >= 90).sort((a, b) => b.fill - a.fill);
  const high     = bins.filter(b => b.fill >= 75 && b.fill < 90).sort((a, b) => b.fill - a.fill);
  const ts       = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const inner    = document.getElementById('notifInner');

  let html = `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.5px;margin-bottom:5px;">Alerts</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:20px;">
      Bins requiring immediate or scheduled collection
    </div>`;

  if (!critical.length && !high.length) {
    inner.innerHTML = html + `
      <div style="text-align:center;padding:48px;color:var(--muted);">
        <div style="font-size:44px;margin-bottom:10px;">✅</div>
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:5px;">All Clear</div>
        <div style="font-size:12px;">No bins above 75% fill level</div>
      </div>`;
    return;
  }

  if (critical.length) {
    html += `
      <div class="ns-hdr">
        <span class="ns-title cr">🔴 CRITICAL — Overflow Imminent</span>
        <span class="nc-cnt cr">${critical.length}</span>
      </div>
      <div class="ng">${critical.map(b => alertCard(b, 'cr', ts)).join('')}</div>`;
  }

  if (high.length) {
    html += `
      <div class="ns-hdr">
        <span class="ns-title wa">🟠 WARNING — Collection Recommended</span>
        <span class="nc-cnt wa">${high.length}</span>
      </div>
      <div class="ng">${high.map(b => alertCard(b, 'wa', ts)).join('')}</div>`;
  }

  inner.innerHTML = html;
}

function alertCard(bin, cls, ts) {
  const isCritical = cls === 'cr';
  const fillVar    = isCritical ? 'var(--red)' : 'var(--orange)';
  const msg        = isCritical
    ? '🚨 Above 90% — overflow imminent. Immediate collection required.'
    : '⚠️ Above 75% — schedule collection within 2 hours.';

  return `
    <div class="nc ${cls}">
      <div class="nc-stripe"></div>
      <div class="nc-top">
        <div class="nc-bid" style="color:${fillVar};">${bin.id}</div>
        <div class="nc-time">${ts}</div>
      </div>
      <div class="nc-fill">
        <div class="nc-num">${bin.fill}%</div>
        <div class="nc-flbl">Fill level</div>
      </div>
      <div class="nc-bar">
        <div class="nc-bfill" style="width:${bin.fill}%;background:${fillVar};box-shadow:0 0 7px ${fillVar};"></div>
      </div>
      <div class="nc-msg">${msg}</div>
      <div class="nc-co">
        📍 ${bin.lat.toFixed(4)}°N, ${bin.lng.toFixed(4)}°E · ${bin.zone} · ${bin.depotId ?? 'Unassigned'}
      </div>
    </div>`;
}
