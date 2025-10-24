#!/usr/bin/env python3
"""
TT.fm Primus WebSocket client (no Socket.IO).
- Connects: wss://socket.prod.tt.fm/primus?token=...&_primuscb=...
- Handles Primus ping/pong ("primus::ping::ts" <-> "primus::pong::ts")
- Sends {"event":"action","params":{"action":"joinRoom","roomUuid":...}} to appear in-room
- Streams frames to a central message queue

Env (via pydantic settings or raw os.environ):
  TTFM_PRIMUS_URL (default: wss://socket.prod.tt.fm/primus)
  TTFM_AUTH_TOKEN  (or HANG_AUTH_TOKEN)
  ROOM_UUID        (required)
"""

from __future__ import annotations
import asyncio
import json
import os
import random
from typing import Any, Optional

import websockets
from websockets.client import connect as ws_connect

from hangfm_bot.config import settings
import logging

LOG = logging.getLogger(__name__)

def _rand_cb(n: int = 8) -> str:
    import string, random as _r
    alph = string.ascii_letters + string.digits
    return "".join(_r.choice(alph) for _ in range(n))

def _build_url() -> str:
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
    def __init__(self, message_queue: asyncio.Queue):
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._task: Optional[asyncio.Task] = None
        self._stop = asyncio.Event()
        self._joined = asyncio.Event()
        self._mq = message_queue

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run(), name="ttfm_primus_loop")

    async def stop(self) -> None:
        self._stop.set()
        if self._ws:
            try: await self._ws.close()
            except Exception: pass
        if self._task:
            await asyncio.wait([self._task], timeout=2)

    async def wait_joined(self, timeout: float = 12.0) -> bool:
        try:
            await asyncio.wait_for(self._joined.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False

    async def _run(self) -> None:
        url = _build_url()
        headers = {
            "Origin": "https://hang.fm",
            "Pragma": "no-cache",
            "Cache-Control": "no-cache",
            "User-Agent": os.getenv("USER_AGENT", "hangfm-bot/primus-python"),
        }

        while not self._stop.is_set():
            try:
                LOG.info("TT.fm: connecting Primus %s", url)
                # websockets v12+: use additional_headers instead of extra_headers
                async with ws_connect(url, additional_headers=headers) as ws:
                    self._ws = ws
                    self._joined.clear()

                    # Send join immediately; server replies with room state.
                    await self._send_join()

                    while not self._stop.is_set():
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
                            except Exception:
                                LOG.debug("TT.fm non-JSON frame: %s", msg[:160])
                        else:
                            LOG.debug("TT.fm text frame: %s", msg[:120])

            except asyncio.TimeoutError:
                LOG.warning("TT.fm: timeout; reconnecting...")
            except Exception as e:
                LOG.error("TT.fm error: %s", e)
            finally:
                self._ws = None
                await asyncio.sleep(2.0)

    async def _send_join(self) -> None:
        room_uuid = getattr(settings, "room_uuid", None) or os.getenv("ROOM_UUID")
        if not room_uuid:
            raise RuntimeError("ROOM_UUID is required to join TT.fm room.")
        payload = {"event": "action", "params": {"roomUuid": room_uuid, "action": "joinRoom"}, "messageId": 1}
        await self._ws.send(json.dumps(payload, separators=(",", ":")))
        LOG.info("TT.fm: joinRoom sent for %s", room_uuid)

    async def _handle_json(self, data: Any) -> None:
        if not isinstance(data, dict):
            return
        ctx = data.get("context")
        if ctx == "response":
            if not self._joined.is_set():
                self._joined.set()
                LOG.info("TT.fm: join confirmed — bot should be visible in room.")
            await self._mq.put(("ttfm_response", data))
            return
        if ctx in ("user", "api", "response"):
            await self._mq.put((f"ttfm_{ctx}", data))
            return
        await self._mq.put(("ttfm_misc", data))
