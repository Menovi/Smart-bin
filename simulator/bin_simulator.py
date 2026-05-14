"""Single ESP32 bin simulator.

Mimics the firmware that will eventually run on a real ESP32 + HC-SR04 + battery.
Publishes telemetry to MQTT every PUBLISH_INTERVAL seconds.

Telemetry JSON shape (matches what the real firmware will send):
{
  "name": "...",
  "lat": ..., "lng": ...,
  "fill_pct": 0..100,           # derived: (capacity_cm - distance_cm)/capacity_cm
  "distance_cm": 0..120,         # raw HC-SR04 distance to top of trash
  "battery_pct": 0..100,
  "rssi": -90..-30,
  "temperature_c": 20..40,
  "lid_open": false
}
"""
import json
import time
import random
import argparse
import paho.mqtt.client as mqtt


def run_bin(bin_id: str, name: str, lat: float, lng: float,
            broker: str = "broker.hivemq.com", port: int = 1883,
            interval: float = 5.0, capacity_cm: float = 80.0,
            initial_fill: float = 10.0, fill_rate: float = 0.6):
    """Simulate one bin.

    fill_rate: avg %/minute; the bin slowly fills up. Sometimes a "collection"
    event empties it (random 1% chance per tick).
    """
    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                         client_id=f"sim-{bin_id}")
    client.connect(broker, port, 60)
    client.loop_start()
    print(f"[{bin_id}] connected to {broker}:{port}")

    fill = initial_fill
    battery = 100.0
    topic = f"smartbin/{bin_id}/telemetry"

    try:
        while True:
            # fill drift
            fill += (fill_rate / 60.0) * interval + random.uniform(-0.2, 0.4)
            fill = max(0.0, min(100.0, fill))

            # 1% chance of collection
            if random.random() < 0.01 and fill > 30:
                print(f"[{bin_id}] collected — fill reset")
                fill = random.uniform(2.0, 8.0)

            # battery slowly drains, recharges via solar in daytime (mock)
            battery -= 0.05 + random.uniform(0, 0.05)
            if battery < 5: battery = 100.0   # solar recharge mock

            distance_cm = capacity_cm * (1.0 - fill / 100.0) + random.uniform(-0.5, 0.5)

            payload = {
                "name": name,
                "lat": lat, "lng": lng,
                "capacity_cm": capacity_cm,
                "fill_pct": round(fill, 1),
                "distance_cm": round(distance_cm, 1),
                "battery_pct": round(battery, 1),
                "rssi": random.randint(-80, -45),
                "temperature_c": round(random.uniform(22, 36), 1),
                "lid_open": random.random() < 0.02,
            }
            client.publish(topic, json.dumps(payload), qos=0)
            print(f"[{bin_id}] -> fill={fill:5.1f}%  bat={battery:5.1f}%")
            time.sleep(interval)
    except KeyboardInterrupt:
        client.loop_stop(); client.disconnect()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True)
    ap.add_argument("--name", default="")
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lng", type=float, required=True)
    ap.add_argument("--broker", default="broker.hivemq.com")
    ap.add_argument("--port", type=int, default=1883)
    ap.add_argument("--interval", type=float, default=5.0)
    args = ap.parse_args()
    run_bin(args.id, args.name or args.id, args.lat, args.lng,
            args.broker, args.port, args.interval)
