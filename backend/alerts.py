"""Alert rules engine + delivery (Telegram + WebPush).

Configure via environment variables:
  TELEGRAM_BOT_TOKEN        — from BotFather
  TELEGRAM_CHAT_ID          — your chat (or a group)
  VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_CLAIM_EMAIL — for browser push
"""
import os
import json
import asyncio
from datetime import datetime, timedelta
from typing import Optional, List
import httpx

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

# Subscriptions for browser push (held in-memory; persist to DB in prod)
push_subscriptions: List[dict] = []

# Rule thresholds
FILL_HIGH = 75.0
FILL_CRITICAL = 90.0
BATTERY_LOW = 20.0
OFFLINE_MINUTES = 5


async def send_telegram(text: str) -> None:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            await client.post(url, json={
                "chat_id": TELEGRAM_CHAT_ID,
                "text": text,
                "parse_mode": "Markdown",
            })
        except Exception as e:
            print(f"[alerts] telegram error: {e}")


def send_webpush(payload: dict) -> None:
    """Send push notification to all subscribed browsers."""
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        return
    vapid_private = os.getenv("VAPID_PRIVATE_KEY")
    vapid_claims = {"sub": f"mailto:{os.getenv('VAPID_CLAIM_EMAIL', 'admin@smartbin.local')}"}
    if not vapid_private:
        return
    for sub in push_subscriptions:
        try:
            webpush(
                subscription_info=sub,
                data=json.dumps(payload),
                vapid_private_key=vapid_private,
                vapid_claims=vapid_claims,
            )
        except Exception as e:
            print(f"[alerts] webpush error: {e}")


def evaluate_telemetry(bin_id: str, fill_pct: float, battery_pct: float) -> List[dict]:
    """Return list of alert dicts triggered by this telemetry sample."""
    alerts = []
    if fill_pct >= FILL_CRITICAL:
        alerts.append({
            "bin_id": bin_id, "severity": "critical", "type": "FILL_CRITICAL",
            "message": f"Bin {bin_id} is {fill_pct:.0f}% full — needs immediate collection.",
        })
    elif fill_pct >= FILL_HIGH:
        alerts.append({
            "bin_id": bin_id, "severity": "warning", "type": "FILL_HIGH",
            "message": f"Bin {bin_id} is {fill_pct:.0f}% full — schedule collection.",
        })
    if battery_pct <= BATTERY_LOW:
        alerts.append({
            "bin_id": bin_id, "severity": "warning", "type": "BATTERY_LOW",
            "message": f"Bin {bin_id} battery is {battery_pct:.0f}% — service required.",
        })
    return alerts


def evaluate_detection(bin_id: Optional[str], num_detections: int) -> List[dict]:
    if num_detections >= 1:
        return [{
            "bin_id": bin_id or "UNKNOWN",
            "severity": "warning",
            "type": "LITTER_OUTSIDE",
            "message": f"{num_detections} litter item(s) detected near bin {bin_id or '(camera feed)'}.",
        }]
    return []


async def fan_out(alert: dict, broadcaster=None) -> None:
    """Push to Telegram + WebPush + WebSocket."""
    text = f"*{alert['severity'].upper()}* — {alert['type']}\n{alert['message']}"
    await send_telegram(text)
    send_webpush({
        "title": f"SmartBin: {alert['type']}",
        "body": alert["message"],
        "severity": alert["severity"],
        "bin_id": alert["bin_id"],
    })
    if broadcaster is not None:
        await broadcaster({"event": "alert", "data": alert})
