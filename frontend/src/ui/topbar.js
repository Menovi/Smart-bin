/**
 * ui/topbar.js
 * ─────────────────────────────────────────────
 * Updates the top status pills and notification badge.
 */

export function updateStats(bins) {
  const critical = bins.filter(b => b.fill >= 90).length;
  const high     = bins.filter(b => b.fill >= 75 && b.fill < 90).length;
  const ok       = bins.filter(b => b.fill < 75).length;
  const alerting = bins.filter(b => b.fill >= 75).length;

  document.getElementById('cC').textContent = critical;
  document.getElementById('wC').textContent = high;
  document.getElementById('oC').textContent = ok;

  const badge = document.getElementById('nb');
  badge.textContent    = alerting;
  badge.style.display  = alerting > 0 ? '' : 'none';
}

export function updateBinCount(count) {
  document.getElementById('binCountLabel').textContent = count;
}
