"""Bins REST endpoints."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db, Bin, Telemetry
from schemas import BinCreate, BinOut, TelemetryOut

router = APIRouter(prefix="/api/bins", tags=["bins"])


@router.get("", response_model=List[BinOut])
def list_bins(db: Session = Depends(get_db)):
    return db.query(Bin).all()


@router.post("", response_model=BinOut)
def create_bin(payload: BinCreate, db: Session = Depends(get_db)):
    if db.query(Bin).filter(Bin.id == payload.id).first():
        raise HTTPException(409, "bin_id already exists")
    b = Bin(**payload.model_dump())
    db.add(b); db.commit(); db.refresh(b)
    return b


@router.get("/{bin_id}", response_model=BinOut)
def get_bin(bin_id: str, db: Session = Depends(get_db)):
    b = db.query(Bin).filter(Bin.id == bin_id).first()
    if not b: raise HTTPException(404)
    return b


@router.delete("/{bin_id}")
def delete_bin(bin_id: str, db: Session = Depends(get_db)):
    b = db.query(Bin).filter(Bin.id == bin_id).first()
    if not b: raise HTTPException(404)
    db.delete(b); db.commit()
    return {"ok": True}


@router.get("/{bin_id}/telemetry", response_model=List[TelemetryOut])
def bin_telemetry(bin_id: str, limit: int = 50, db: Session = Depends(get_db)):
    return (db.query(Telemetry)
              .filter(Telemetry.bin_id == bin_id)
              .order_by(desc(Telemetry.timestamp))
              .limit(limit).all())


@router.get("/{bin_id}/latest", response_model=Optional[TelemetryOut])
def bin_latest(bin_id: str, db: Session = Depends(get_db)):
    return (db.query(Telemetry)
              .filter(Telemetry.bin_id == bin_id)
              .order_by(desc(Telemetry.timestamp)).first())
