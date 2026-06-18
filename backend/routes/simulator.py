"""Start / stop the fleet simulator as a subprocess."""
import subprocess
import sys
import os
from pathlib import Path
from fastapi import APIRouter

router = APIRouter(prefix="/api/simulator", tags=["simulator"])

_proc: subprocess.Popen | None = None

SIMULATOR_DIR = Path(__file__).resolve().parents[2] / "simulator"


def _venv_python() -> str:
    venv = SIMULATOR_DIR / ".venv" / "Scripts" / "python.exe"
    return str(venv) if venv.exists() else sys.executable


@router.post("/start")
def start_simulator(bins: int = 12):
    global _proc
    if _proc and _proc.poll() is None:
        return {"status": "already_running", "pid": _proc.pid}

    python = _venv_python()
    _proc = subprocess.Popen(
        [python, "fleet_runner.py", "--bins", str(bins)],
        cwd=str(SIMULATOR_DIR),
    )
    return {"status": "started", "pid": _proc.pid}


@router.post("/stop")
def stop_simulator():
    global _proc
    if _proc is None or _proc.poll() is not None:
        return {"status": "not_running"}
    _proc.terminate()
    try:
        _proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        _proc.kill()
    _proc = None
    return {"status": "stopped"}


@router.get("/status")
def simulator_status():
    running = _proc is not None and _proc.poll() is None
    return {"running": running, "pid": _proc.pid if running else None}
