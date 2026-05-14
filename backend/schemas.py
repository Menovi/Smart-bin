"""Pydantic request/response schemas."""
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel


class BinCreate(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    capacity_cm: float = 80.0
    depot_id: Optional[str] = None


class BinOut(BinCreate):
    created_at: datetime
    class Config: from_attributes = True


class TelemetryIn(BaseModel):
    bin_id: str
    fill_pct: float
    distance_cm: float
    battery_pct: float
    rssi: int = -60
    temperature_c: Optional[float] = None
    lid_open: bool = False


class TelemetryOut(TelemetryIn):
    id: int
    timestamp: datetime
    class Config: from_attributes = True


class DetectionOut(BaseModel):
    id: int
    bin_id: Optional[str]
    image_path: str
    annotated_path: Optional[str]
    classes: List[Any]
    num_detections: int
    has_litter_outside: bool
    timestamp: datetime
    class Config: from_attributes = True


class AlertOut(BaseModel):
    id: int
    bin_id: str
    severity: str
    type: str
    message: str
    acknowledged: bool
    timestamp: datetime
    class Config: from_attributes = True


class RouteRequest(BaseModel):
    depot_lat: float
    depot_lng: float
    bin_ids: List[str]
    vehicle_capacity: float = 100.0    # in % * count units
