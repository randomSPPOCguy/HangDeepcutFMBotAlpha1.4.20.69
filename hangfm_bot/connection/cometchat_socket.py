#!/usr/bin/env python3
"""
CometChat WebSocket Client
Uses the exact handshake format from browser capture.
Direct WS connection to send messages.
"""

import asyncio
import json
import logging
import time
from typing import Optional

import websockets

from hangfm_bot.config import settings

LOG = logging.getLogger(__name__)

class CometChatSocketClient:
    """
    CometChat WebSocket client using exact browser handshake format.
    """
    
    def __init__(self):
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._authed = asyncio.Event()
        self._stop = asyncio.Event()
        self._task: Optional[asyncio.Task] = None
        self._device_id: Optional[str] = None
        
        self.appid = settings.cometchat_appid
        self.uid = settings.cometchat_uid
        self.auth = settings.cometchat_auth
        self.room_uuid = settings.room_uuid
        self.region = settings.cometchat_region or "us"
        
        LOG.info(f"CometChat ready: uid={self.uid}, room={self.room_uuid}")
    
    async def start(self):
        """Start WebSocket connection"""
        if self._task and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run())
    
    async def stop(self):
        """Stop WebSocket connection"""
        self._stop.set()
        if self._ws:
            try:
                await self._ws.close()
            except:
                pass
        if self._task:
            try:
                await asyncio.wait_for(asyncio.gather(self._task), timeout=2)
            except:
                pass
    
    async def wait_authed(self, timeout: float = 15.0) -> bool:
        """Wait for authentication"""
        try:
            await asyncio.wait_for(self._authed.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            LOG.warning(f"Auth timeout ({timeout}s)")
            return False
    
    async def send_group_text(self, text: str) -> bool:
        """Send message to group via WebSocket"""
        if not self._ws or not self._authed.is_set():
            LOG.warning("CometChat WS not authed; cannot send message")
            return False
        
        if not self._device_id:
            # Guard against messages being sent before start() completes.
            self._device_id = (
                f"WEB-4_0_10-{self.uid}-{int(time.time() * 1000)}"
            )

        frame = {
            "appId": self.appid,
            "deviceId": self._device_id,
            "sender": self.uid,
            "receiverType": "group",
            "receiver": self.room_uuid,
            "type": "message",
            "body": {
                "category": "message",
                "type": "text",
                "data": {
                    "text": text,
                    "metadata": {"incrementUnreadCount": True}
                }
            }
        }
        
        try:
            LOG.info(f"CometChat: sending to group {self.room_uuid[:8]}... text={text[:40]}")
            await self._ws.send(json.dumps(frame, separators=(",", ":")))
            LOG.info(f"CometChat: message sent")
            return True
        except Exception as e:
            LOG.error(f"CometChat: send error: {e}")
            return False
    
    async def _run(self):
        """Main WebSocket loop"""
        url = f"wss://{self.appid}.websocket-{self.region}.cometchat.io/v3.0/"

        while not self._stop.is_set():
            try:
                LOG.info(f"CometChat: connecting {url}")
                # Recreate the browser handshake headers. CometChat is picky
                # about Origin/User-Agent and will silently drop auth otherwise.
                headers = {
                    "Origin": "https://hang.fm",
                    "Pragma": "no-cache",
                    "Cache-Control": "no-cache",
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/122.0.0.0 Safari/537.36"
                    ),
                }

                # Generate a browser-style device ID for every reconnect.
                self._device_id = (
                    f"WEB-4_0_10-{self.uid}-{int(time.time() * 1000)}"
                )

                # Simply connect; headers handled by WebSocket handshake
                async with websockets.connect(
                    url,
                    ping_interval=None,
                ) as ws:
                    self._ws = ws
                    self._authed.clear()
                    
                    # Send auth frame (exact format from browser)
                    auth_frame = {
                        "appId": self.appid,
                        "deviceId": self._device_id,
                        "type": "auth",
                        "sender": self.uid,
                        "body": {
                            "auth": self.auth,
                            "deviceId": self._device_id,
                            "presenceSubscription": "ALL_USERS",
                            "params": {
                                "appInfo": {
                                    "version": "4.0.10",
                                    "apiVersion": "v3.0",
                                    "origin": "https://hang.fm",
                                    "uts": int(time.time() * 1000)
                                },
                                "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                                "deviceId": self._device_id,
                                "platform": "javascript"
                            }
                        }
                    }
                    
                    LOG.info(f"CometChat: auth frame sending for uid={self.uid}")
                    await ws.send(json.dumps(auth_frame, separators=(",", ":")))
                    
                    # Receive messages
                    while not self._stop.is_set():
                        try:
                            msg = await asyncio.wait_for(ws.recv(), timeout=45)
                            if isinstance(msg, (bytes, bytearray)):
                                continue
                            
                            msg = msg.strip()
                            if not msg:
                                continue
                            
                            if msg[0] in "{[":
                                try:
                                    data = json.loads(msg)
                                    if self._handle_auth_payload(data):
                                        continue
                                    LOG.debug(
                                        "CometChat: JSON message (no auth success): %s",
                                        data,
                                    )
                                except json.JSONDecodeError:
                                    LOG.debug(f"CometChat: non-JSON: {msg[:100]}")
                            else:
                                LOG.debug(f"CometChat: text: {msg[:100]}")
                        
                        except asyncio.TimeoutError:
                            LOG.debug("CometChat: recv timeout")
                            continue
                
            except websockets.exceptions.ConnectionClosedError as e:
                LOG.error(f"CometChat: connection closed: code={e.code} reason={e.reason}")
            except Exception as e:
                LOG.error(f"CometChat: error: {type(e).__name__}: {e}")
            finally:
                self._ws = None
                await asyncio.sleep(2.0)

    def _handle_auth_payload(self, data: dict) -> bool:
        """Inspect a JSON message for auth success indicators."""

        indicator_parts = []

        msg_type = data.get("type")
        if isinstance(msg_type, str) and msg_type in {"auth", "authSuccess"}:
            indicator_parts.append(f"type={msg_type}")

        body = data.get("body")
        if isinstance(body, dict):
            body_code = body.get("code")
            if body_code is not None and str(body_code) == "200":
                indicator_parts.append(f"body.code={body_code}")

            body_success = body.get("success")
            if isinstance(body_success, str):
                if body_success.lower() in {"true", "success", "1"}:
                    indicator_parts.append(f"body.success={body_success}")
            elif body_success:
                indicator_parts.append(f"body.success={body_success}")

            body_status = body.get("status")
            if isinstance(body_status, str) and body_status.lower() == "success":
                indicator_parts.append(f"body.status={body_status}")

        status = data.get("status")
        if isinstance(status, str) and status.lower() == "success":
            indicator_parts.append(f"status={status}")

        code = data.get("code")
        if code is not None and str(code) == "200":
            indicator_parts.append(f"code={code}")

        if indicator_parts:
            indicator = ", ".join(indicator_parts)
            LOG.info(
                "CometChat: auth success detected (%s); response=%s",
                indicator,
                data,
            )
            self._authed.set()
            return True

        return False

