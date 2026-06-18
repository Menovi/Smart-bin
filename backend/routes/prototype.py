# routes/prototype.py
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from database import SessionLocal, Bin, Telemetry, Alert
from alerts import evaluate_telemetry, fan_out

router = APIRouter(prefix="/api/prototype", tags=["prototype"])

broadcast_ref = {"fn": None}

PROTOTYPE_BIN_ID = "BIN-PROTOTYPE"
PROTOTYPE_LAT = 13.0107
PROTOTYPE_LNG = 74.7943


class PrototypeReading(BaseModel):
    fill_pct: float
    status: str
    distance_cm: float = 0.0
    battery_pct: float = 100.0


@router.post("/reading")
async def receive_reading(payload: PrototypeReading, request: Request):
    db = SessionLocal()
    try:
        # Auto-create the prototype bin if it doesn't exist
        b = db.query(Bin).filter(Bin.id == PROTOTYPE_BIN_ID).first()
        if not b:
            b = Bin(
                id=PROTOTYPE_BIN_ID,
                name="ESP32 Prototype (NITK)",
                lat=PROTOTYPE_LAT,
                lng=PROTOTYPE_LNG,
                capacity_cm=30.0,
            )
            db.add(b)
            db.commit()
            print(f"[prototype] auto-created bin {PROTOTYPE_BIN_ID}")

        # Save telemetry
        t = Telemetry(
            bin_id=PROTOTYPE_BIN_ID,
            fill_pct=payload.fill_pct,
            distance_cm=payload.distance_cm,
            battery_pct=payload.battery_pct,
            rssi=0,
        )
        db.add(t)
        db.commit()

        print(f"[prototype] {payload.fill_pct:.1f}% ({payload.status})")

        # Broadcast to WebSocket clients (updates IoT Live tab in real time)
        if broadcast_ref["fn"]:
            await broadcast_ref["fn"]({
                "event": "telemetry",
                "bin_id": PROTOTYPE_BIN_ID,
                "data": {
                    "fill_pct": payload.fill_pct,
                    "battery_pct": payload.battery_pct,
                    "distance_cm": payload.distance_cm,
                    "lid_open": False,
                    "timestamp": t.timestamp.isoformat(),
                    "lat": PROTOTYPE_LAT,
                    "lng": PROTOTYPE_LNG,
                    "name": b.name,
                },
            })

        # Fire alerts if thresholds are crossed
        triggered = evaluate_telemetry(
            PROTOTYPE_BIN_ID, payload.fill_pct, payload.battery_pct
        )
        for alert in triggered:
            db_alert = Alert(**alert)
            db.add(db_alert)
            db.commit()
            if broadcast_ref["fn"]:
                await fan_out(alert, broadcast_ref["fn"])

        return {"ok": True, "fill_pct": payload.fill_pct}

    finally:
        db.close()