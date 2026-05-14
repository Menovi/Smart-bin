// src/api/ws.js — WebSocket to FastAPI
const WS_URL = "ws://localhost:8000/ws";
const handlers = new Map();
let socket = null, retries = 0;

export function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
}
function emit(event, msg) {
  const set = handlers.get(event);
  if (set) set.forEach(fn => { try { fn(msg); } catch (e) { console.error(e); } });
}
export function connect() {
  socket = new WebSocket(WS_URL);
  socket.onopen = () => { retries = 0; emit("_status", { connected: true }); };
  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      emit(msg.event, msg);
    } catch (err) { console.warn("bad ws msg", err); }
  };
  socket.onclose = () => {
    emit("_status", { connected: false });
    setTimeout(connect, Math.min(30000, 1000 * 2 ** retries++));
  };
  socket.onerror = () => socket.close();
}