"""Detection endpoints — accepts an uploaded image (from ESP32-CAM or manual)."""
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db, Detection, Alert
from schemas import DetectionOut
from detector import detector
from alerts import evaluate_detection, fan_out

router = APIRouter(prefix="/api/detect", tags=["detection"])

# We import the websocket broadcaster lazily to avoid circular imports.
broadcast_ref = {"fn": None}


@router.post("", response_model=DetectionOut)
async def detect(
    file: UploadFile = File(...),
    bin_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    blob = await file.read()
    result = detector.detect(blob)

    rec = Detection(
        bin_id=bin_id,
        image_path=result["image_path"],
        annotated_path=result.get("annotated_path"),
        classes=result["classes"],
        num_detections=result["num_detections"],
        has_litter_outside=result["has_litter_outside"],
    )
    db.add(rec); db.commit(); db.refresh(rec)

    if rec.has_litter_outside:
        for a in evaluate_detection(bin_id, rec.num_detections):
            db_alert = Alert(**a)
            db.add(db_alert); db.commit()
            if broadcast_ref["fn"]:
                await fan_out(a, broadcast_ref["fn"])

    return rec


@router.get("/recent", response_model=List[DetectionOut])
def recent(limit: int = 20, db: Session = Depends(get_db)):
    return db.query(Detection).order_by(desc(Detection.timestamp)).limit(limit).all()
