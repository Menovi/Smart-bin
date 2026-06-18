// src/api/client.js — REST client for the backend
// In production, set VITE_API_URL in your Vercel environment variables
// to point at your Render backend (e.g. https://smartbin-api.onrender.com)
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

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

export async function deleteBin(binId) {
  await fetch(`${BASE}/api/bins/${binId}`, { method: "DELETE" });
}

export async function deleteDetection(id) {
  await fetch(`${BASE}/api/detect/${id}`, { method: "DELETE" });
}

export async function authRegister({ email, password, name, role, region }) {
  const r = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, role, region }),
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.detail || "Registration failed"); }
  return r.json();
}

export async function authLogin(email, password) {
  const fd = new URLSearchParams({ username: email, password });
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", body: fd });
  if (!r.ok) { const e = await r.json(); throw new Error(e.detail || "Login failed"); }
  return r.json();
}

export async function authMe(token) {
  const r = await fetch(`${BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return r.ok ? r.json() : null;
}

export async function simulatorStatus() {
  const r = await fetch(`${BASE}/api/simulator/status`);
  return r.ok ? r.json() : { running: false };
}
export async function startSimulator(bins = 12) {
  const r = await fetch(`${BASE}/api/simulator/start?bins=${bins}`, { method: "POST" });
  return r.json();
}
export async function stopSimulator() {
  const r = await fetch(`${BASE}/api/simulator/stop`, { method: "POST" });
  return r.json();
}