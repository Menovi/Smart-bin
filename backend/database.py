"""SQLAlchemy models for Smart-Bin v2."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, JSON
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from sqlalchemy import create_engine

DATABASE_URL = "sqlite:///./smartbin.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Bin(Base):
    __tablename__ = "bins"
    id = Column(String, primary_key=True)               # e.g. "BIN-001"
    name = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    capacity_cm = Column(Float, default=80.0)            # bin depth
    depot_id = Column(String, nullable=True)             # assigned depot
    created_at = Column(DateTime, default=datetime.utcnow)

    telemetry = relationship("Telemetry", back_populates="bin", cascade="all, delete-orphan")
    detections = relationship("Detection", back_populates="bin", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="bin", cascade="all, delete-orphan")


class Telemetry(Base):
    __tablename__ = "telemetry"
    id = Column(Integer, primary_key=True, autoincrement=True)
    bin_id = Column(String, ForeignKey("bins.id"), index=True)
    fill_pct = Column(Float, nullable=False)             # 0..100
    distance_cm = Column(Float, nullable=False)          # raw HC-SR04
    battery_pct = Column(Float, nullable=False)          # 0..100
    rssi = Column(Integer, default=-60)
    temperature_c = Column(Float, nullable=True)
    lid_open = Column(Boolean, default=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    bin = relationship("Bin", back_populates="telemetry")


class Detection(Base):
    __tablename__ = "detections"
    id = Column(Integer, primary_key=True, autoincrement=True)
    bin_id = Column(String, ForeignKey("bins.id"), index=True, nullable=True)
    image_path = Column(String, nullable=False)          # path to saved image
    annotated_path = Column(String, nullable=True)
    classes = Column(JSON, nullable=False)               # [{cls, conf, bbox}, ...]
    num_detections = Column(Integer, default=0)
    has_litter_outside = Column(Boolean, default=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    bin = relationship("Bin", back_populates="detections")


class Alert(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    bin_id = Column(String, ForeignKey("bins.id"), index=True)
    severity = Column(String, default="info")            # info | warning | critical
    type = Column(String, nullable=False)                # FILL_HIGH | FILL_CRITICAL | LITTER_OUTSIDE | BATTERY_LOW | OFFLINE
    message = Column(String, nullable=False)
    acknowledged = Column(Boolean, default=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    bin = relationship("Bin", back_populates="alerts")


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
