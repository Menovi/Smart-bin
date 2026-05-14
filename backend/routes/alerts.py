"""Alerts REST."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db, Alert
from schemas import AlertOut

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=List[AlertOut])
def list_alerts(only_unack: bool = False, limit: int = 100, db: Session = Depends(get_db)):
    q = db.query(Alert)
    if only_unack: q = q.filter(Alert.acknowledged == False)
    return q.order_by(desc(Alert.timestamp)).limit(limit).all()


@router.post("/{alert_id}/ack")
def ack(alert_id: int, db: Session = Depends(get_db)):
    a = db.query(Alert).filter(Alert.id == alert_id).first()
    if not a: raise HTTPException(404)
    a.acknowledged = True; db.commit()
    return {"ok": True}
