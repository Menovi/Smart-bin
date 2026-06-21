/**
 * utils/priority.js
 * ─────────────────────────────────────────────
 * Bin priority score combining fill level and nearby litter detections.
 *
 *   priority = FILL_WEIGHT × (fill/100) + LITTER_WEIGHT × min(litter/LITTER_CAP, 1)
 *
 * Result is always in [0, 1].
 * Used by ACO heuristic, greedy NN, and cost function.
 */

import { FILL_WEIGHT, LITTER_WEIGHT, LITTER_CAP } from '../config/constants.js';

/**
 * Compute priority score for a bin.
 * @param {{ fill: number, litterCount?: number }} bin
 * @returns {number} 0–1
 */
export function priorityScore(bin) {
  const f = (bin.fill ?? 0) / 100;
  const l = Math.min((bin.litterCount ?? 0) / LITTER_CAP, 1.0);
  return FILL_WEIGHT * f + LITTER_WEIGHT * l;
}

/**
 * Human-readable priority label.
 * @param {number} score 0–1
 * @returns {{ label: string, color: string }}
 */
export function priorityLabel(score) {
  if (score >= 0.85) return { label: 'CRITICAL', color: '#ff1744' };
  if (score >= 0.70) return { label: 'HIGH',     color: '#ff6d00' };
  if (score >= 0.50) return { label: 'MODERATE', color: '#ffea00' };
  return                     { label: 'LOW',      color: '#00e676' };
}
