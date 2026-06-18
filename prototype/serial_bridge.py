"""
serial_bridge.py
────────────────────────────────────────────────────────────────
Reads your ESP32's USB Serial output, parses fill level and status,
and POSTs each reading to the SmartBin backend.

Your ESP32 prints lines like:
    Fill Level: 67.3%  |  Status: NORMAL
    Fill Level: 91.0%  |  Status: CRITICAL

This script picks those up and forwards them to the web app.

Usage:
    python serial_bridge.py
    python serial_bridge.py --port COM7          (Windows)
    python serial_bridge.py --port /dev/ttyUSB0  (Linux/Mac)
    python serial_bridge.py --port COM6 --baud 115200

Requirements:
    pip install pyserial requests
"""

import serial
import serial.tools.list_ports
import requests
import re
import time
import argparse
import sys

BACKEND_URL = "http://localhost:8000/api/prototype/reading"
BAUD_RATE = 115200

# Matches lines like:
#   Fill Level: 67.3%  |  Status: NORMAL
#   Distance test - Fill Level: 91.0%  |  Status: CRITICAL
FILL_PATTERN = re.compile(
    r"Fill Level:\s*([\d.]+)%\s*\|?\s*Status:\s*([A-Z]+)", re.IGNORECASE
)


def list_ports():
    ports = serial.tools.list_ports.comports()
    if not ports:
        print("No serial ports found.")
        return []
    print("Available ports:")
    for p in ports:
        print(f"  {p.device}  —  {p.description}")
    return ports


def auto_detect_port():
    """Try to find the ESP32 automatically."""
    ports = serial.tools.list_ports.comports()
    for p in ports:
        desc = (p.description or "").lower()
        # CP210x (most ESP32 boards) or CH340
        if any(x in desc for x in ["cp210", "ch340", "uart", "silicon"]):
            return p.device
    # Fallback: return the first available port
    if ports:
        return ports[0].device
    return None


def send_reading(fill_pct: float, status: str):
    """POST the reading to the backend."""
    payload = {
        "fill_pct": fill_pct,
        "status": status,
        "distance_cm": 0.0,
        "battery_pct": 100.0,
    }
    try:
        r = requests.post(BACKEND_URL, json=payload, timeout=3)
        if r.ok:
            print(f"  → Sent: {fill_pct:.1f}% ({status})")
        else:
            print(f"  → Backend error {r.status_code}: {r.text[:100]}")
    except requests.exceptions.ConnectionError:
        print("  → Could not reach backend. Is uvicorn running on port 8000?")
    except requests.exceptions.Timeout:
        print("  → Backend timed out.")


def run_bridge(port: str, baud: int):
    print(f"\n{'='*52}")
    print(f"  SmartBin Serial Bridge")
    print(f"  Port: {port}  |  Baud: {baud}")
    print(f"  Backend: {BACKEND_URL}")
    print(f"{'='*52}\n")
    print("Connecting to ESP32... (Ctrl+C to stop)\n")

    try:
        ser = serial.Serial(port, baud, timeout=2)
    except serial.SerialException as e:
        print(f"ERROR: Could not open {port}\n  {e}")
        print("\nAvailable ports:")
        list_ports()
        sys.exit(1)

    print(f"Connected. Listening for fill level data...\n")

    last_status = None  # Track last status to detect transitions

    try:
        while True:
            try:
                line = ser.readline().decode("utf-8", errors="replace").strip()
            except serial.SerialException:
                print("ESP32 disconnected. Reconnecting in 3s...")
                time.sleep(3)
                try:
                    ser.close()
                    ser = serial.Serial(port, baud, timeout=2)
                    print("Reconnected.")
                except Exception:
                    print("Reconnect failed. Retrying...")
                continue

            if not line:
                continue

            # Always print what the ESP32 says
            print(f"ESP32: {line}")

            # Try to parse fill level
            match = FILL_PATTERN.search(line)
            if match:
                fill_pct = float(match.group(1))
                status = match.group(2).upper()

                # Send every reading regardless
                send_reading(fill_pct, status)

                # Extra console highlight on status change
                if status != last_status:
                    print(f"\n  ⚡ Status changed: {last_status or 'STARTUP'} → {status}\n")
                    last_status = status

    except KeyboardInterrupt:
        print("\n\nBridge stopped by user.")
        ser.close()


def main():
    parser = argparse.ArgumentParser(
        description="SmartBin serial bridge — forwards ESP32 data to the web app"
    )
    parser.add_argument(
        "--port",
        help="Serial port (e.g. COM6 or /dev/ttyUSB0). Auto-detected if not specified.",
    )
    parser.add_argument(
        "--baud",
        type=int,
        default=BAUD_RATE,
        help=f"Baud rate (default: {BAUD_RATE})",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List available serial ports and exit",
    )
    args = parser.parse_args()

    if args.list:
        list_ports()
        return

    port = args.port
    if not port:
        port = auto_detect_port()
        if port:
            print(f"Auto-detected port: {port}")
        else:
            print("Could not auto-detect serial port.")
            list_ports()
            print("\nRun with --port COM6 (or your port) to specify manually.")
            sys.exit(1)

    run_bridge(port, args.baud)


if __name__ == "__main__":
    main()
