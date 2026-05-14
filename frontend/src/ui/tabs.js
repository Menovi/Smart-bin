/**
 * ui/tabs.js
 * ─────────────────────────────────────────────
 * Handles tab switching between Map / Dashboard /
 * Notifications / Analytics panels.
 */

import { invalidateSize } from '../map/mapController.js';

export function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab, btn));
  });
}

export function switchTab(tabId, activeBtn) {
  // Deactivate all
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

  // Activate selected
  if (activeBtn) activeBtn.classList.add('active');
  document.getElementById(`panel-${tabId}`)?.classList.add('active');

  // Leaflet needs a size hint when its panel becomes visible
  if (tabId === 'map') setTimeout(invalidateSize, 50);
}

export function switchToMap() {
  const mapBtn = document.querySelector('[data-tab="map"]');
  switchTab('map', mapBtn);
}
