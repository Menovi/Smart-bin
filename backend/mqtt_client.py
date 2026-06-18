"""MQTT subscriber — paho-mqtt in a background thread.

Using paho-mqtt (synchronous) in a daemon thread and bridging messages
back to the asyncio event loop via run_coroutine_threadsafe.
This avoids the asyncio add_reader/add_writer incompatibility with
Windows ProactorEventLoop that aiomqtt suffers from.
"""
import os
import json
import asyncio
import threading
import time
import paho.mqtt.client as paho

from database import SessionLocal, Bin, Telemetry, Alert
from alerts import evaluate_telemetry, fan_out

BROKER_HOST = os.getenv("MQTT_HOST", "broker.hivemq.com")
BROKER_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER   = os.getenv("MQTT_USER", "")
MQTT_PASS   = os.getenv("MQTT_PASS", "")
TOPIC_TELEMETRY = "smartbin/+/telemetry"
TOPIC_EVENT     = "smartbin/+/event"


async def mqtt_loop(broadcaster):
    """Start a paho-mqtt client in a daemon thread; keep this coroutine alive."""
    loop = asyncio.get_event_loop()

    def on_connect(client, userdata, flags, rc, props=None):
        if rc == 0:
            print(f"[mqtt] connected to {BROKER_HOST}:{BROKER_PORT}")
            client.subscribe(TOPIC_TELEMETRY)
            client.subscribe(TOPIC_EVENT)
        else:
            print(f"[mqtt] connect failed rc={rc}")

    def on_message(client, userdata, msg):
        topic = msg.topic
        try:
            payload = json.loads(msg.payload.decode())
        except Exception:
            return
        parts = topic.split("/")
        if len(parts) < 3:
            return
        bin_id, kind = parts[1], parts[2]
        if kind == "telemetry":
            asyncio.run_coroutine_threadsafe(
                handle_telemetry(bin_id, payload, broadcaster), loop
            )
        elif kind == "event":
            asyncio.run_coroutine_threadsafe(
                broadcaster({"event": "device_event", "bin_id": bin_id, "data": payload}),
                loop,
            )

    def run_paho():
        while True:
            try:
                client = paho.Client(
                    callback_api_version=paho.CallbackAPIVersion.VERSION2,
                    client_id="smartbin-backend-sub",
                )
                client.on_connect = on_connect
                client.on_message = on_message
                if MQTT_USER:
                    client.username_pw_set(MQTT_USER, MQTT_PASS)
                # Use TLS when connecting to port 8883 (HiveMQ Cloud etc.)
                if BROKER_PORT == 8883:
                    import ssl
                    client.tls_set(cert_reqs=ssl.CERT_REQUIRED, tls_version=ssl.PROTOCOL_TLS)
                client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
                client.loop_forever()
            except Exception as e:
                print(f"[mqtt] error: {e}; reconnecting in 5s")
                time.sleep(5)

    t = threading.Thread(target=run_paho, daemon=True, name="mqtt-paho")
    t.start()

    # Keep coroutine alive so the asyncio task isn't immediately cancelled
    while True:
        await asyncio.sleep(3600)


async def handle_telemetry(bin_id: str, payload: dict, broadcaster):
    db = SessionLocal()
    try:
        b = db.query(Bin).filter(Bin.id == bin_id).first()
        if b is None:
            b = Bin(
                id=bin_id,
                name=payload.get("name", bin_id),
                lat=payload.get("lat", 0.0),
                lng=payload.get("lng", 0.0),
                capacity_cm=payload.get("capacity_cm", 80.0),
            )
            db.add(b); db.commit()

        t = Telemetry(
            bin_id=bin_id,
            fill_pct=float(payload.get("fill_pct", 0)),
            distance_cm=float(payload.get("distance_cm", 0)),
            battery_pct=float(payload.get("battery_pct", 100)),
            rssi=int(payload.get("rssi", -60)),
            temperature_c=payload.get("temperature_c"),
            lid_open=bool(payload.get("lid_open", False)),
        )
        db.add(t); db.commit()

        await broadcaster({
            "event": "telemetry",
            "bin_id": bin_id,
            "data": {
                "fill_pct": t.fill_pct,
                "battery_pct": t.battery_pct,
                "distance_cm": t.distance_cm,
                "lid_open": t.lid_open,
                "timestamp": t.timestamp.isoformat(),
                "lat": b.lat, "lng": b.lng, "name": b.name,
            },
        })

        triggered = evaluate_telemetry(bin_id, t.fill_pct, t.battery_pct)
        for a in triggered:
            db_alert = Alert(**a)
            db.add(db_alert); db.commit()
            await fan_out(a, broadcaster)
    finally:
        db.close()
