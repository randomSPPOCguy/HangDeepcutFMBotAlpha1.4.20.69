# hangfm_bot/relay_client.py
import logging
import os
import time
from typing import Any, Optional

import requests

LOG = logging.getLogger("relay_client")
RELAY_URL = os.getenv("PY_RELAY_URL", "http://127.0.0.1:3000").rstrip("/")
RELAY_SECRET = os.getenv("RELAY_SECRET", "")

HEALTH_PATH = "/health"
SEND_PATH = "/send"


def _headers():
    h = {"Content-Type": "application/json"}
    if RELAY_SECRET:
        h["x-relay-secret"] = RELAY_SECRET
    return h


def wait_for_relay(timeout: int = 15, interval: float = 0.5) -> bool:
    """Block until relay /health returns 200 or timeout (seconds) expires."""
    url = RELAY_URL + HEALTH_PATH
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = requests.get(url, timeout=2)
            if r.status_code == 200:
                LOG.info("Relay health OK: %s", url)
                return True
            LOG.debug("Relay health status %s", r.status_code)
        except Exception as exc:
            LOG.debug("Relay health check error: %s", exc)
        time.sleep(interval)
    LOG.warning("Relay did not become healthy within %s seconds", timeout)
    return False


def send_event(event: str, payload: Any, expect_ack: bool = False, timeout: int = 5, retries: int = 4, backoff: float = 0.5) -> Optional[dict]:
    """
    Send an outbound event to the Node relay which will emit it to Hang.fm.
    Retries transient errors (503, 5xx, connection errors).
    Returns JSON dict on success or None on failure.
    """
    url = f"{RELAY_URL}{SEND_PATH}"
    headers = _headers()
    body = {"event": event, "payload": payload, "expectAck": expect_ack}
    attempt = 0
    while attempt <= retries:
        attempt += 1
        try:
            r = requests.post(url, json=body, headers=headers, timeout=timeout)
            if r.status_code == 200:
                LOG.debug("Relay send success on attempt %d", attempt)
                return r.json()
            # treat 503/5xx as transient
            if 500 <= r.status_code < 600:
                LOG.warning("Relay send returned %s; attempt %d/%d", r.status_code, attempt, retries)
            else:
                LOG.warning("Relay send failed with status %s: %s", r.status_code, r.text[:200])
                return None
        except requests.RequestException as exc:
            LOG.debug("Relay send request error (attempt %d): %s", attempt, exc)
        # backoff before retry
        time.sleep(backoff * attempt)
    LOG.error("Relay send_event failed after %d attempts", retries)
    return None
