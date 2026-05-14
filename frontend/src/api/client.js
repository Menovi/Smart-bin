// src/api/client.js — REST client for the backend
const BASE = "http://localhost:8000";

export async function listBins() {
  const r = await fetch(`${BASE}/api/bins`); return r.json();
}
export async function getLatestTelemetry(binId) {
  const r = await fetch(`${BASE}/api/bins/${binId}/latest`);
  return r.ok ? r.json() : null;
}
export async function listAlerts() {
  const r = await fetch(`${BASE}/api/alerts?only_unack=true`); return r.json();
}
export async function ackAlert(id) {
  await fetch(`${BASE}/api/alerts/${id}/ack`, { method: "POST" });
}
export async function detectImage(file, binId = null) {
  const fd = new FormData();
  fd.append("file", file);
  if (binId) fd.append("bin_id", binId);
  const r = await fetch(`${BASE}/api/detect`, { method: "POST", body: fd });
  return r.json();
}
export async function recentDetections(limit = 12) {
  const r = await fetch(`${BASE}/api/detect/recent?limit=${limit}`);
  return r.json();
}
export const ASSET = (p) => `${BASE}/${p.replace(/^\.?[\\/]/, "").replace(/\\/g, "/")}`;