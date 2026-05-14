/**
 * utils/colors.js
 * ─────────────────────────────────────────────
 * Fill-level → colour mappings used across the UI.
 */

export function fillColor(fill) {
  if (fill >= 90) return '#ff1744';
  if (fill >= 75) return '#ff6d00';
  if (fill >= 60) return '#ffea00';
  return '#00e676';
}

export function fillGlow(fill) {
  if (fill >= 90) return 'rgba(255,23,68,.6)';
  if (fill >= 75) return 'rgba(255,109,0,.5)';
  if (fill >= 60) return 'rgba(255,234,0,.45)';
  return 'rgba(0,230,118,.4)';
}

export function statusInfo(fill) {
  if (fill >= 90) return { label: 'Critical', cls: 'cr' };
  if (fill >= 75) return { label: 'High',     cls: 'wa' };
  if (fill >= 60) return { label: 'Moderate', cls: 'mo' };
  return            { label: 'Normal',   cls: 'ok' };
}

export function routeColor(depotIdx, truckIdx) {
  const palettes = [
    ['#b39ddb', '#7c4dff'],
    ['#80deea', '#00bcd4'],
    ['#ffcc80', '#ff9800'],
  ];
  return palettes[depotIdx % 3][truckIdx % 2];
}
