@@ -11,50 +11,53 @@ import logging
import os
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
        
        self.appid = settings.cometchat_appid
        self.uid = settings.cometchat_uid
        self.auth = settings.cometchat_auth
        self.room_uuid = settings.room_uuid
        self.region = settings.cometchat_region or "us"

        # Match browser client expectations as closely as possible
        self._origin = "https://hang.fm"
        
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
@@ -78,102 +81,120 @@ class CometChatSocketClient:
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
                # Generate a per-connection device identifier like browser does
                device_id = f"WEB-4_0_10-{self.uid}-{int(time.time() * 1000)}"

                async with websockets.connect(url, ping_interval=None) as ws:
                    self._ws = ws
                    self._authed.clear()
                    
                    # Send auth frame (exact format from browser)
                    auth_frame = {
                        "appId": self.appid,
                        "deviceId": device_id,
                        "type": "auth",
                        "sender": self.uid,
                        "body": {
                            "auth": self.auth,
                            "deviceId": device_id,
                            "presenceSubscription": "ALL_USERS",
                            "params": {
                                "appInfo": {
                                    "version": "4.0.10",
                                    "apiVersion": "v3.0",
                                    "origin": "https://hang.fm",
                                    "uts": int(time.time() * 1000)
                                },
                                "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                                "deviceId": device_id,
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
                                    msg_type = data.get("type")
                                    
                                    if msg_type == "auth":
                                        body = data.get("body", {})
                                        status = body.get("status")
                                        if status and status.upper() == "SUCCESS":
                                            LOG.info("CometChat: auth response SUCCESS")
                                            self._authed.set()
                                        else:
                                            LOG.error(f"CometChat: auth failed: {body}")
                                            await ws.close()
                                            break
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

