#!/usr/bin/env python3
"""
TT.fm Primus WebSocket client (bulletproof).
- Connects: wss://socket.prod.tt.fm/primus?token=...&_primuscb=...
- Handles Primus ping/pong ("primus::ping::ts" <-> "primus::pong::ts")
- Sends {"event":"action","params":{"action":"joinRoom","roomUuid":...}} to appear in-room
- Exponential backoff retry on failures
- Streams frames to a central message queue
- Production-ready with comprehensive error handling

Env (via pydantic settings or raw os.environ):
  TTFM_PRIMUS_URL (default: wss://socket.prod.tt.fm/primus)
  TTFM_AUTH_TOKEN  (or HANG_AUTH_TOKEN)
  ROOM_UUID        (required)
  TTFM_RETRY_MAX_BACKOFF (default: 60 seconds)
"""

from __future__ import annotations
import asyncio
import json
import os
import random
import string
from typing import Any, Optional

import websockets

from hangfm_bot.config import settings
import logging

LOG = logging.getLogger(__name__)

def _rand_cb(n: int = 8) -> str:
    """Generate random callback ID for Primus protocol."""
    alph = string.ascii_letters + string.digits
    return "".join(random.choice(alph) for _ in range(n))

def _build_url() -> str:
    """Build Primus WebSocket URL with token and callback."""
    base = (getattr(settings, "ttfm_socket_base_url", None)
            or os.getenv("TTFM_PRIMUS_URL")
            or "wss://socket.prod.tt.fm/primus").rstrip("/")
    token = (getattr(settings, "ttfm_auth_token", None)
             or os.getenv("TTFM_AUTH_TOKEN")
             or os.getenv("HANG_AUTH_TOKEN"))
    if not token:
        raise RuntimeError("Missing TT.fm token: set TTFM_AUTH_TOKEN (or HANG_AUTH_TOKEN).")
    return f"{base}?token={token}&_primuscb={_rand_cb()}"

class TTFMSocketClient:
    """Bulletproof Primus WebSocket client for TT.fm."""
    
    def __init__(self, message_queue: asyncio.Queue):
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._task: Optional[asyncio.Task] = None
        self._stop = asyncio.Event()
        self._joined = asyncio.Event()
        self._mq = message_queue
        self._retry_count = 0
        self._max_backoff = float(os.getenv("TTFM_RETRY_MAX_BACKOFF", "60"))

    async def start(self) -> None:
        """Start the Primus connection loop."""
        if self._task and not self._task.done():
            return
        self._stop.clear()
        self._retry_count = 0
        self._task = asyncio.create_task(self._run(), name="ttfm_primus_loop")

    async def stop(self) -> None:
        """Stop the Primus connection."""
        self._stop.set()
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
        if self._task:
            try:
                await asyncio.wait_for(asyncio.gather(self._task), timeout=2)
            except Exception:
                pass

    async def wait_joined(self, timeout: float = 12.0) -> bool:
        """Wait for room join confirmation."""
        try:
            await asyncio.wait_for(self._joined.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            LOG.warning("TT.fm: room join timeout after %.1fs", timeout)
            return False

    def _get_backoff_delay(self) -> float:
        """Calculate exponential backoff with jitter."""
        # Exponential backoff: 2^retry_count seconds, capped at max_backoff
        delay = min(2 ** self._retry_count, self._max_backoff)
        # Add jitter: ±10% of delay
        jitter = delay * 0.1 * (2 * random.random() - 1)
        return max(0.1, delay + jitter)

    async def _run(self) -> None:
        """Main Primus connection loop with exponential backoff."""
        url = _build_url()
        
        while not self._stop.is_set():
            try:
                LOG.info("TT.fm: connecting Primus (retry %d)...", self._retry_count)
                # Use websockets.connect() directly (latest API, no deprecation)
                async with websockets.connect(url) as ws:
                    self._ws = ws
                    self._joined.clear()
                    self._retry_count = 0  # Reset on successful connection
                    
                    LOG.info("TT.fm: Primus connected, joining room...")
                    await self._send_join()
                    
                    while not self._stop.is_set():
                        try:
                            raw = await asyncio.wait_for(ws.recv(), timeout=45)
                            if isinstance(raw, (bytes, bytearray)):
                                continue
                            
                            msg = raw.strip()
                            
                            # Primus heartbeat
                            if msg.startswith("primus::ping::"):
                                ts = msg.split("::", 2)[-1]
                                await ws.send(f"primus::pong::{ts}")
                                continue
                            
                            if msg and msg[0] in "{[":
                                try:
                                    data = json.loads(msg)
                                    await self._handle_json(data)
                                except json.JSONDecodeError:
                                    LOG.debug("TT.fm: non-JSON frame: %s", msg[:160])
                            else:
                                LOG.debug("TT.fm: text frame: %s", msg[:120])
                        
                        except asyncio.TimeoutError:
                            LOG.debug("TT.fm: recv timeout (45s), reconnecting...")
                            break
                
            except websockets.exceptions.ConnectionClosedError as e:
                LOG.warning("TT.fm: connection closed (code %s, reason: %s)", e.code, e.reason)
                self._retry_count += 1
            except Exception as e:
                LOG.error("TT.fm: error: %s: %s", type(e).__name__, e)
                self._retry_count += 1
            finally:
                self._ws = None
                
                if not self._stop.is_set():
                    delay = self._get_backoff_delay()
                    LOG.info("TT.fm: reconnecting in %.1fs (backoff)...", delay)
                    await asyncio.sleep(delay)

    async def _send_join(self) -> None:
        """Send joinRoom action to TT.fm."""
        room_uuid = getattr(settings, "room_uuid", None) or os.getenv("ROOM_UUID")
        if not room_uuid:
            raise RuntimeError("ROOM_UUID is required to join TT.fm room.")
        
        payload = {
            "event": "action",
            "params": {"roomUuid": room_uuid, "action": "joinRoom"},
            "messageId": 1
        }
        await self._ws.send(json.dumps(payload, separators=(",", ":")))
        LOG.info("TT.fm: joinRoom sent for %s", room_uuid)

    async def _handle_json(self, data: Any) -> None:
        """Handle incoming JSON frames from Primus."""
        if not isinstance(data, dict):
            return
        
        ctx = data.get("context")
        
        # Room join confirmation
        if ctx == "response":
            if not self._joined.is_set():
                self._joined.set()
                LOG.info("TT.fm: room join confirmed ✓ — bot is visible in room")
            await self._mq.put(("ttfm_response", data))
            return
        
        # User, API, or response events
        if ctx in ("user", "api", "response"):
            await self._mq.put((f"ttfm_{ctx}", data))
            return
        
        # Everything else
        await self._mq.put(("ttfm_misc", data))
