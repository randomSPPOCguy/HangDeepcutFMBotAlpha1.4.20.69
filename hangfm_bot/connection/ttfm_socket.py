# hangfm_bot/connection/ttfm_socket.py
# Socket manager that uses python-socketio AsyncClient to connect to the Hang.fm socket
# Provides a thin wrapper with connect, disconnect, and joinRoom convenience method

import logging
from typing import Optional

import socketio

from hangfm_bot.config import settings

LOG = logging.getLogger("ttfm_socket")


class TTFMSocket:
    def __init__(self):
        self.sio: Optional[socketio.AsyncClient] = None
        self.connected = False
        self.base_url = settings.ttfm_socket_base_url.rstrip("/")
        self.token = settings.ttfm_api_token
        LOG.info("TTFMSocket initialized for %s", self.base_url)

    def _make_client(self) -> socketio.AsyncClient:
        # Keep engineio_logger False to avoid excessive logs; honor allow_debug
        return socketio.AsyncClient(reconnection=True, logger=settings.allow_debug, engineio_logger=settings.allow_debug)

    async def connect(self, timeout: int = 15):
        """
        Connect using python-socketio AsyncClient.
        Tries typical strategies: Authorization header, then auth payload.
        Raises exceptions if connection fails.
        """
        if self.sio and self.connected:
            return

        self.sio = self._make_client()

        @self.sio.event
        async def connect():
            LOG.info("Socket.IO client connected")
            self.connected = True

        @self.sio.event
        async def disconnect():
            LOG.warning("Socket.IO client disconnected")
            self.connected = False

        # Use header Authorization if token present, else fallback to auth payload
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else None

        # Try header approach first, then auth payload
        connect_attempts = [
            {"headers": headers},
            {"auth": {"token": self.token}} if self.token else {"headers": None}
        ]

        last_exc = None
        for kwargs in connect_attempts:
            try:
                LOG.info("Attempting Socket.IO connect to %s with kwargs=%s", self.base_url, {k: ("<redacted>" if k in ("headers","auth") else v) for k,v in kwargs.items()})
                await self.sio.connect(self.base_url, transports=["polling", "websocket"], socketio_path="/socket.io", wait_timeout=timeout, **kwargs)
                # If connect didn't raise, mark connected and return
                if self.connected:
                    LOG.info("Connected to Socket.IO at %s", self.base_url)
                    return
                # Sometimes connect returns immediately; verify flag or short sleep
                return
            except Exception as exc:
                LOG.warning("Socket.IO connect attempt failed: %s", exc)
                last_exc = exc

        # If we reached here, all attempts failed
        raise last_exc if last_exc is not None else ConnectionError("Socket connect failed")

    async def disconnect(self):
        if self.sio:
            try:
                await self.sio.disconnect()
            except Exception as e:
                LOG.debug("Error disconnecting socket: %s", e)
            finally:
                self.sio = None
                self.connected = False

    async def joinRoom(self, token: str, payload: dict):
        """
        Convenience: ensure connection and then emit joinRoom with payload.
        Returns whatever the server ack returns when possible.
        """
        if not self.sio or not self.connected:
            await self.connect()
        try:
            # Emit and optionally wait for acknowledgement; many servers don't ack, so we don't require it
            await self.sio.emit("joinRoom", payload)
            LOG.info("joinRoom emitted with payload keys: %s", list(payload.keys()))
            return True
        except Exception as exc:
            LOG.error("Error emitting joinRoom: %s", exc)
            raise

    # Expose on/emit for callers who want to register handlers
    def on(self, event_name: str):
        return self.sio.on(event_name) if self.sio else lambda f: f

    async def emit(self, event: str, data):
        if self.sio:
            await self.sio.emit(event, data)
