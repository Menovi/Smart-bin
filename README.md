# SmartBin v2 — AI + IoT Waste Management Platform

Integrates three components:

1. **YOLOv11-CA** litter detection (from `yolov11s-coordatt-v3.ipynb`)
2. **Hybrid ACO–LNS–ILS** routing (from the CVRP paper)
3. **IoT smart bins** with ESP32 + HC-SR04 + ESP32-CAM, **simulated in Python today, flashable to real hardware tomorrow**

```
            ┌─────────────────┐    HTTP    ┌──────────────────────┐
            │  ESP32-CAM      │──────────▶ │                      │
            │  (or browser    │  /detect    │   FastAPI Backend    │
            │   upload)       │             │   - REST + WebSocket │
            └─────────────────┘             │   - YOLO inference   │
                                            │   - MQTT subscriber  │
            ┌─────────────────┐    MQTT     │   - Alert engine     │
            │  ESP32 Bin x N  │──────────▶ │   - SQLite           │
            │  (or Python sim)│             └──────────┬───────────┘
            └─────────────────┘                        │ WS + REST
                                                       ▼
                                            ┌──────────────────────┐
                                            │  Vite + Leaflet UI   │
                                            │  - Live map          │
                                            │  - Detection panel   │
                                            │  - Alerts            │
                                            │  - MDVRP routing     │
                                            └──────────────────────┘
```

## Quick start (5 minutes)

### 0. Prereqs

- Python 3.10+
- Node 18+
- (Optional) Docker, for a local MQTT broker

### 1. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Drop your trained weights here:
mkdir -p models && cp /path/to/best.pt models/best.pt

# Run
uvicorn main:app --reload --port 8000
```

The backend will:

- create `smartbin.db` automatically
- subscribe to `smartbin/+/telemetry` on `broker.hivemq.com:1883` (override with `MQTT_HOST`)
- expose REST at http://localhost:8000 and WebSocket at /ws

### 2. Bin simulator

```bash
cd simulator
pip install -r requirements.txt
python fleet_runner.py --bins 12
```

Generates 12 simulated bins around NITK Surathkal and starts publishing telemetry.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

You should see live coloured markers update every 5 seconds, alerts pop in as toasts, and detection results render after you upload an image.

## Configuration

### Backend env vars

| Var                        | Default             | What it does                                |
| -------------------------- | ------------------- | ------------------------------------------- |
| `MQTT_HOST`                | `broker.hivemq.com` | MQTT broker host                            |
| `MQTT_PORT`                | `1883`              | MQTT broker port                            |
| `YOLO_MODEL_PATH`          | `models/best.pt`    | path to your trained weights                |
| `YOLO_CONF`                | `0.35`              | detection confidence threshold              |
| `LITTER_OUTSIDE_THRESHOLD` | `1`                 | min detections to fire LITTER_OUTSIDE alert |
| `TELEGRAM_BOT_TOKEN`       | (none)              | enable Telegram alerts                      |
| `TELEGRAM_CHAT_ID`         | (none)              | Telegram chat                               |

### Telegram alerts (optional, recommended for demo)

1. Open Telegram, search `@BotFather`, run `/newbot`, copy the token.
2. Send any message to your new bot.
3. Get your chat ID: `https://api.telegram.org/bot<TOKEN>/getUpdates` → look for `chat.id`.
4. Export `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` before running the backend.

### Self-hosted MQTT (recommended for the report)

```bash
docker compose up -d                # starts Mosquitto on :1883
MQTT_HOST=localhost uvicorn ...
python fleet_runner.py --broker localhost
```

## How alerts work

| Trigger                         | Severity | Type             |
| ------------------------------- | -------- | ---------------- |
| `fill_pct ≥ 90`                 | critical | `FILL_CRITICAL`  |
| `fill_pct ≥ 75`                 | warning  | `FILL_HIGH`      |
| `battery_pct ≤ 20`              | warning  | `BATTERY_LOW`    |
| `≥ 1` litter detection in image | warning  | `LITTER_OUTSIDE` |

Alerts are persisted to SQLite, broadcast over WebSocket to all open browser tabs, sent as Telegram messages, and pushed via Web Push to subscribed browsers.

## Going from simulation → real hardware

The simulator publishes the **same MQTT payload** as the firmware in `firmware/esp32_bin/`. Steps to switch:

1. Flash `firmware/esp32_bin/esp32_bin.ino` to an ESP32. Edit Wi-Fi creds + `BIN_ID` + lat/lng at the top.
2. Wire HC-SR04: TRIG=GPIO5, ECHO=GPIO18; battery divider on GPIO34.
3. Power on. The backend will auto-register the new bin.
4. (Optional) Flash `firmware/esp32_cam/esp32_cam.ino` to an ESP32-CAM. It POSTs JPEGs to `/api/detect` every 30s.

No backend code changes needed — the simulator and real device are interchangeable.

## Frontend integration with your existing repo

The frontend in this repo is a **shell**. Copy these files from your existing `Smart-bin` repo into `frontend/src/`:

- `algorithms/aco.js`, `algorithms/lns.js`, `algorithms/ils.js`, `algorithms/greedy.js`
- `data/generator.js`, `data/assignment.js`
- `config/constants.js`
- `ui/sidebar.js`, `ui/dashboard.js`, `ui/analytics.js`, `ui/modal.js`, `ui/topbar.js`, `ui/tabs.js`
- `services/osrm.js`
- `map/mapController.js` (rename to keep alongside the new `liveLayer.js`)
- `styles/main.css`, `styles/layout.css`, `styles/map.css`, `styles/panels.css`

Then uncomment the imports at the bottom of `src/main.js`.

The MDVRP routing UI is independent of the live IoT layer — they cohabit the same map. Bins coming in over MQTT can also feed the routing solver: pull the live `fill_pct` from the latest telemetry and pass bins ≥ threshold into the ACO-LNS-ILS solver as the customer set.

## API reference

| Method | Path                                        | Purpose                                           |
| ------ | ------------------------------------------- | ------------------------------------------------- |
| GET    | `/api/bins`                                 | list all bins                                     |
| POST   | `/api/bins`                                 | create a bin                                      |
| GET    | `/api/bins/{id}/telemetry`                  | history                                           |
| GET    | `/api/bins/{id}/latest`                     | latest sample                                     |
| POST   | `/api/detect` (multipart `file`, `bin_id?`) | run YOLO                                          |
| GET    | `/api/detect/recent`                        | recent detections                                 |
| GET    | `/api/alerts?only_unack=true`               | active alerts                                     |
| POST   | `/api/alerts/{id}/ack`                      | acknowledge                                       |
| POST   | `/api/routing/solve`                        | run server-side ACO-LNS-ILS                       |
| WS     | `/ws`                                       | live events: `telemetry`, `alert`, `device_event` |

## Troubleshooting

**"YOLO_MODEL_PATH not found"** — copy your `best.pt` into `backend/models/`. The detection endpoint will return mock results until you do.

**Bins not appearing on map** — check the WebSocket dot in the topbar. If grey, the backend isn't running or CORS is blocking. If green but no markers, check the simulator output for `pub` lines.

**Telegram messages not arriving** — `getUpdates` must return your chat after you message the bot at least once.

## Why this stack (vs Blynk)

Blynk is fine for hobby projects but has device limits on the free tier and locks you into its dashboard. MQTT + custom dashboard is the standard production stack used by real smart-city deployments — you can defend it in the report and your simulator code is one find-and-replace away from production firmware.
