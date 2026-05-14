/**
 * ui/modal.js
 * ─────────────────────────────────────────────
 * Controls the algorithm progress modal shown
 * while the ACO+LNS+ILS hybrid is running.
 */

export function showModal() {
  document.getElementById('algoModal').classList.add('vis');
}

export function hideModal() {
  document.getElementById('algoModal').classList.remove('vis');
}

/**
 * Update the modal with current phase statuses and progress %.
 *
 * @param {number} progress  - 0–100
 * @param {Phase[]} phases   - array of { name, desc, status: 'done'|'active'|'pending' }
 */
export function updateModal(progress, phases) {
  const phaseHTML = phases
    .map(p => {
      const icon = p.status === 'done' ? '✅' : p.status === 'active' ? '⟳' : '○';
      const label = p.status === 'done' ? 'Done' : p.status === 'active' ? 'Running' : 'Pending';
      return `
        <div class="modal-phase">
          <div class="phase-icon ${p.status}">${icon}</div>
          <div class="phase-text">
            <div class="phase-name">${p.name}</div>
            <div class="phase-desc">${p.desc}</div>
          </div>
          <div class="phase-status ${p.status}">${label}</div>
        </div>`;
    })
    .join('');

  document.getElementById('modalPhases').innerHTML = phaseHTML;
  document.getElementById('mpFill').style.width    = progress + '%';
  document.getElementById('mpPct').textContent     = progress + '%';

  const labels = {
    5:  'Initialising…',
    20: 'ACO building tours…',
    50: 'LNS improving…',
    70: 'ILS restarts…',
    80: 'Fetching roads…',
    100:'Complete ✓',
  };
  document.getElementById('mpLabel').textContent =
    labels[progress] ?? 'Optimising…';
}
