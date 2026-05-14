"""Smart-Bin v2 FastAPI app.

Run:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Then start one or more bin simulators in another terminal:
    python ../simulator/fleet_runner.py
"""
import asyncio
import json
from contextlib import asynccontextmanager
from typing import Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import init_db
from mqtt_client import mqtt_loop
from routes import bins as bins_router
from routes import detections as detections_router
from routes import alerts as alerts_router
from routes import routing as routing_router

# ---- WebSocket hub --------------------------------------------------------
ws_clients: Set[WebSocket] = set()


async def broadcast(msg: dict) -> None:
    dead = []
    payload = json.dumps(msg, default=str)
    for ws in ws_clients:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        ws_clients.discard(ws)


# ---- Lifespan: init DB, start MQTT background task ------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # wire detection broadcaster
    detections_router.broadcast_ref["fn"] = broadcast
    task = asyncio.create_task(mqtt_loop(broadcast))
    print("[app] startup complete")
    yield
    task.cancel()
    print("[app] shutdown")


app = FastAPI(title="Smart-Bin v2", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(bins_router.router)
app.include_router(detections_router.router)
app.include_router(alerts_router.router)
app.include_router(routing_router.router)

# expose uploaded images
import os
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/")
def root():
    return {"service": "Smart-Bin v2", "version": "1.0", "ws": "/ws"}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    ws_clients.add(ws)
    try:
        await ws.send_text(json.dumps({"event": "hello", "data": {"connected": True}}))
        while True:
            await ws.receive_text()    # ignore inbound
    except WebSocketDisconnect:
        pass
    finally:
        ws_clients.discard(ws)
