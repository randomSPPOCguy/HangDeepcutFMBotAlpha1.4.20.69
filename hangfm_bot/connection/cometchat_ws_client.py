#!/usr/bin/env python3
"""
CometChat WebSocket Client (NOT HTTP)
- Logs in with AUTH token over WebSocket
- Publishes messages to group (ROOM_UUID)
- Receives chat messages
"""

import asyncio
import json
import logging
import os
from typing import Optional, Callable, Any

try:
    import websockets
except ImportError:
    websockets = None

LOG = logging.getLogger("cometchat_ws")

class CometChatWSClient:
    """
    Direct WebSocket connection to CometChat
    - Auth with COMETCHAT_AUTH token
    - Subscribe to group messages
    - Publish messages to group (ROOM_UUID)
    """
    
    def __init__(self, 
                 app_id: str,
                 auth_token: str,
                 uid: str,
                 region: str = "us",
                 message_callback: Optional[Callable] = None,
                 device_id: Optional[str] = None):
        """
        Args:
            app_id: CometChat app ID
            auth_token: AUTH token for uid (uid_timestamp_hash format)
            uid: User/bot UID
            region: CometChat region (us, eu, etc)
            message_callback: async callback(msg_data) for incoming messages
            device_id: Optional stable device ID
        """
        self.app_id = app_id
        self.auth_token = auth_token
        self.uid = uid
        self.region = region
        self.device_id = device_id or f"PYTHON-BOT-{uid[:8]}"
        self.message_callback = message_callback
        
        self.ws: Optional[Any] = None
        self._connected = asyncio.Event()
        self._authed = asyncio.Event()
        self._read_task: Optional[asyncio.Task] = None
        
        # Build WS URL (region-specific)
        # Format: wss://ws-{region}.cometchat.com/v3/authenticate
        self.ws_url = f"wss://ws-{region}.cometchat.com/v3/authenticate"
        
        LOG.info(f"CometChatWSClient init: uid={uid}, app_id={app_id}, region={region}")
    
    async def start(self):
        """Connect and authenticate"""
        if not websockets:
            LOG.error("websockets library required - pip install websockets")
            return
        
        LOG.info(f"Connecting to {self.ws_url}...")
        try:
            self.ws = await websockets.connect(self.ws_url)
            LOG.info("✅ Connected to CometChat WS")
            self._connected.set()
            
            # Start read loop
            self._read_task = asyncio.create_task(self._read_loop())
            
            # Authenticate
            await self._authenticate()
            
            # Wait for auth confirmation
            try:
                await asyncio.wait_for(self._authed.wait(), timeout=10)
                LOG.info("✅ CometChat authenticated")
            except asyncio.TimeoutError:
                LOG.warning("Auth timeout - connection may still be establishing")
                
        except Exception as e:
            LOG.error(f"Connection failed: {type(e).__name__}: {e}")
            raise
    
    async def close(self):
        """Disconnect"""
        if self._read_task:
            self._read_task.cancel()
            try:
                await self._read_task
            except:
                pass
        if self.ws:
            await self.ws.close()
    
    async def _authenticate(self):
        """Send auth frame"""
        auth_frame = {
            "event": "authentication",
            "data": {
                "appId": self.app_id,
                "auth": self.auth_token,
                "uid": self.uid,
                "deviceId": self.device_id,
            }
        }
        LOG.info(f"Authenticating: uid={self.uid}, device={self.device_id}")
        try:
            await self.ws.send(json.dumps(auth_frame))
        except Exception as e:
            LOG.error(f"Auth send failed: {e}")
    
    async def publish_message(self, group_guid: str, text: str):
        """
        Publish message to group via WS
        
        Args:
            group_guid: Target group GUID (typically ROOM_UUID)
            text: Message text
        """
        msg = {
            "event": "messageSend",
            "data": {
                "receiverId": group_guid,
                "receiverType": "group",
                "text": text,
            }
        }
        LOG.info(f"Publishing: group={group_guid}, text={text[:50]}...")
        try:
            await self.ws.send(json.dumps(msg))
        except Exception as e:
            LOG.error(f"Publish failed: {e}")
            raise
    
    async def _read_loop(self):
        """Listen for incoming messages"""
        try:
            while self.ws:
                msg_str = await self.ws.recv()
                try:
                    msg = json.loads(msg_str)
                    
                    # Check for auth response
                    if msg.get("event") == "authentication":
                        data = msg.get("data", {})
                        if data.get("status") == 0 or "success" in str(data).lower():
                            LOG.info("✅ Auth accepted")
                            self._authed.set()
                        else:
                            LOG.error(f"Auth failed: {data}")
                        continue
                    
                    # Check for message events
                    if msg.get("event") == "messageReceived":
                        LOG.debug(f"Message from CometChat: {msg}")
                        if self.message_callback:
                            try:
                                await self.message_callback(msg.get("data", {}))
                            except Exception as e:
                                LOG.error(f"Callback error: {e}")
                        continue
                    
                    # Log other events for debugging
                    LOG.debug(f"CometChat event: {msg.get('event')}")
                    
                except json.JSONDecodeError:
                    LOG.debug(f"Non-JSON: {msg_str[:50]}")
                    
        except asyncio.CancelledError:
            pass
        except Exception as e:
            LOG.error(f"Read loop error: {e}")
