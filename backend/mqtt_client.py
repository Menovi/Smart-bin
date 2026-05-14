"""MQTT subscriber.

Topics:
  smartbin/<bin_id>/telemetry   — JSON telemetry from each bin simulator/device
  smartbin/<bin_id>/event       — discrete events (lid open, tamper, etc.)

Default broker: public HiveMQ (broker.hivemq.com:1883). For production, run
your own Mosquitto via docker-compose.
"""
import os
import json
import asyncio
from datetime import datetime
import aiomqtt

from database import SessionLocal, Bin, Telemetry, Alert
from alerts import evaluate_telemetry, fan_out

BROKER_HOST = os.getenv("MQTT_HOST", "broker.hivemq.com")
BROKER_PORT = int(os.getenv("MQTT_PORT", "1883"))
TOPIC_TELEMETRY = "smartbin/+/telemetry"
TOPIC_EVENT = "smartbin/+/event"


async def mqtt_loop(broadcaster):
    """Subscribe forever; persist + broadcast telemetry; trigger alerts."""
    while True:
        try:
            async with aiomqtt.Client(hostname=BROKER_HOST, port=BROKER_PORT) as client:
                print(f"[mqtt] connected to {BROKER_HOST}:{BROKER_PORT}")
                await client.subscribe(TOPIC_TELEMETRY)
                await client.subscribe(TOPIC_EVENT)
                async for message in client.messages:
                    await handle_message(message, broadcaster)
        except Exception as e:
            print(f"[mqtt] connection error: {e}; retrying in 5s")
            await asyncio.sleep(5)


async def handle_message(message, broadcaster):
    topic = str(message.topic)
    try:
        payload = json.loads(message.payload.decode())
    except Exception:
        return

    parts = topic.split("/")
    if len(parts) < 3:
        return
    bin_id, kind = parts[1], parts[2]

    if kind == "telemetry":
        await handle_telemetry(bin_id, payload, broadcaster)
    elif kind == "event":
        await broadcaster({"event": "device_event", "bin_id": bin_id, "data": payload})


async def handle_telemetry(bin_id: str, payload: dict, broadcaster):
    db = SessionLocal()
    try:
        # auto-register unknown bin (for demo simplicity)
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

        # broadcast to websocket clients
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

        # rules
        triggered = evaluate_telemetry(bin_id, t.fill_pct, t.battery_pct)
        for a in triggered:
            db_alert = Alert(**a)
            db.add(db_alert); db.commit()
            await fan_out(a, broadcaster)
    finally:
        db.close()
