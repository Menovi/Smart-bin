"""Spawn N bin simulators as threads. Loads bin definitions from config.json.

Run:
    python fleet_runner.py
    python fleet_runner.py --broker localhost --bins 30
"""
import json
import argparse
import threading
import time
import random
from pathlib import Path
from bin_simulator import run_bin


def load_or_generate(path: Path, n: int = 12):
    if path.exists():
        return json.loads(path.read_text())
    # default cluster: NITK Surathkal area
    base_lat, base_lng = 13.0103, 74.7940
    bins = []
    for i in range(n):
        bins.append({
            "id": f"BIN-{i+1:03d}",
            "name": f"Bin {i+1}",
            "lat": base_lat + random.uniform(-0.012, 0.012),
            "lng": base_lng + random.uniform(-0.012, 0.012),
            "capacity_cm": 80.0,
            "initial_fill": random.uniform(5, 70),
        })
    path.write_text(json.dumps(bins, indent=2))
    print(f"[fleet] generated {n} bins -> {path}")
    return bins


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.json")
    ap.add_argument("--broker", default="broker.hivemq.com")
    ap.add_argument("--port", type=int, default=1883)
    ap.add_argument("--interval", type=float, default=5.0)
    ap.add_argument("--bins", type=int, default=12, help="generate N bins if no config")
    args = ap.parse_args()

    cfg_path = Path(args.config)
    bins = load_or_generate(cfg_path, args.bins)

    threads = []
    for b in bins:
        t = threading.Thread(
            target=run_bin,
            kwargs={
                "bin_id": b["id"], "name": b.get("name", b["id"]),
                "lat": b["lat"], "lng": b["lng"],
                "broker": args.broker, "port": args.port,
                "interval": args.interval,
                "capacity_cm": b.get("capacity_cm", 80.0),
                "initial_fill": b.get("initial_fill", 10.0),
            },
            daemon=True,
        )
        t.start(); threads.append(t)
        time.sleep(0.2)   # stagger connect

    print(f"[fleet] running {len(threads)} bins. Ctrl-C to stop.")
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        print("[fleet] shutting down")


if __name__ == "__main__":
    main()
