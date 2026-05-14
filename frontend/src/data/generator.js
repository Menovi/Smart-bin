/**
 * data/generator.js
 * ─────────────────────────────────────────────
 * Generates synthetic depot and bin data for a city.
 * In a real system these would come from an API/database.
 */

import {
  CITIES, DEPOT_DEFS, NUM_BINS, BIN_SPREAD,
  BIN_ZONES, BIN_CAPACITY,
} from '../config/constants.js';

function randomPastTime() {
  const hrs = Math.floor(Math.random() * 72) + 1;
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
}

/**
 * Generate depot objects positioned around the city centre.
 * @param {string} cityKey
 * @returns {Depot[]}
 */
export function generateDepots(cityKey) {
  const [clat, clng] = CITIES[cityKey].center;
  return DEPOT_DEFS.map((def, i) => ({
    id:         `DEPOT-${String.fromCharCode(65 + i)}`,
    name:       def.name,
    color:      def.color,
    truckColor: def.truckColor,
    radius:     def.radius,
    lat:        clat + def.latOff,
    lng:        clng + def.lngOff,
  }));
}

/**
 * Generate NUM_BINS random bin objects for a city.
 * @param {string} cityKey
 * @returns {Bin[]}
 */
export function generateBins(cityKey) {
  const [clat, clng] = CITIES[cityKey].center;
  return Array.from({ length: NUM_BINS }, (_, i) => ({
    id:            `BIN-${String(i + 1).padStart(3, '0')}`,
    lat:           clat + (Math.random() - 0.5) * BIN_SPREAD * 2,
    lng:           clng + (Math.random() - 0.5) * BIN_SPREAD * 2,
    fill:          Math.floor(Math.random() * 100),
    zone:          BIN_ZONES[i % BIN_ZONES.length],
    capacity:      BIN_CAPACITY,
    lastCollected: randomPastTime(),
    lastUpdated:   'Just now',
    depotId:       null,
    extended:      false,
  }));
}
