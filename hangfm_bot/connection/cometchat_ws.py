# hangfm_bot/connection/cometchat_ws.py
# CometChat WebSocket listener for receiving chat messages

import asyncio
import json
import logging
import websockets
from hangfm_bot.config import settings

LOG = logging.getLogger("cometchat_ws")


class CometChatWebSocket:
    """
    CometChat WebSocket client for receiving chat messages
    Matches the original bot's WebSocket implementation
    """
    
    def __init__(self, message_queue):
        self.message_queue = message_queue
        self.ws = None
        self.authenticated = False
        self.running = False
        
        # WebSocket URL from original bot
        self.ws_url = f"wss://{settings.cometchat_appid}.websocket-{settings.cometchat_region}.cometchat.io/v3.0/"
        LOG.info(f"CometChat WebSocket URL: {self.ws_url}")
    
    async def connect(self):
        """Connect to CometChat WebSocket and authenticate"""
        try:
            LOG.info("🔌 Connecting to CometChat WebSocket...")
            
            self.ws = await websockets.connect(self.ws_url)
            LOG.info("✅ CometChat WebSocket connected")
            
            # Send authentication (from original bot lines 3091-3098)
            auth_message = {
                "appId": settings.cometchat_appid,
                "type": "auth",
                "sender": settings.cometchat_uid,
                "body": {
                    "auth": settings.cometchat_auth,
                    "deviceId": f"PYTHON-BOT-{settings.cometchat_uid}",
                    "presenceSubscription": "ALL_USERS"
                }
            }
            
            await self.ws.send(json.dumps(auth_message))
            LOG.info("🔐 CometChat auth sent")
            
            # Start listening for messages
            self.running = True
            asyncio.create_task(self._listen())
            
        except Exception as e:
            LOG.error(f"❌ CometChat WebSocket connection failed: {e}")
            raise
    
    async def _listen(self):
        """Listen for incoming WebSocket messages"""
        try:
            async for message in self.ws:
                try:
                    LOG.debug(f"📩 Raw WebSocket message: {message[:200]}")
                    await self._handle_message(message)
                except Exception as e:
                    LOG.error(f"Error handling message: {e}")
                    
        except websockets.exceptions.ConnectionClosed as e:
            LOG.warning(f"⚠️ CometChat WebSocket closed: {e}")
            self.authenticated = False
            self.running = False
        except Exception as e:
            LOG.error(f"❌ CometChat WebSocket listen error: {e}")
            self.running = False
    
    async def _handle_message(self, data: str):
        """
        Handle incoming CometChat WebSocket message
        Based on original bot's handleCometChatMessage (lines 3229-3336)
        """
        try:
            message = json.loads(data)
            LOG.debug(f"📨 Parsed message: {json.dumps(message, indent=2)[:300]}")
            
            # Check for authentication success (multiple possible formats)
            if (message.get('type') == 'auth' or 
                message.get('type') == 'authSuccess' or
                message.get('status') == 'success' or
                message.get('code') == '200' or
                (message.get('body', {}).get('code') == '200') or
                (message.get('body', {}).get('success'))):
                
                self.authenticated = True
                LOG.info("✅ CometChat WebSocket authenticated!")
                return
            
            # Handle chat messages (type: message, body.type: text)
            if message.get('type') == 'message':
                body = message.get('body', {})
                
                LOG.info(f"🔔 CometChat message type: {message.get('type')}, body type: {body.get('type')}")
                
                if body.get('type') == 'text':
                    sender_uuid = body.get('sender')
                    sender_name = body.get('senderName', 'Unknown')
                    text = body.get('data', {}).get('text', '')
                    
                    LOG.info(f"💬 Text message from {sender_name} ({sender_uuid}): {text}")
                    
                    # Ignore own messages
                    if sender_uuid == settings.cometchat_uid:
                        LOG.debug("Ignoring own message")
                        return
                    
                    if text and sender_uuid:
                        LOG.info(f"✅ Forwarding to queue: {text[:50]}")
                        
                        # Put message in queue for processing
                        await self.message_queue.put(('chatMessage', {
                            'text': text,
                            'sender': {
                                'uid': sender_uuid,
                                'name': sender_name
                            }
                        }))
                    else:
                        LOG.warning(f"⚠️ Missing text or sender_uuid - text={bool(text)}, sender={sender_uuid}")
                else:
                    LOG.debug(f"Ignoring non-text message type: {body.get('type')}")
            else:
                LOG.debug(f"Ignoring message type: {message.get('type')}")
                    
        except json.JSONDecodeError as e:
            LOG.warning(f"Invalid JSON from CometChat: {data[:100]} - {e}")
        except Exception as e:
            LOG.error(f"Error parsing CometChat message: {e}", exc_info=True)
    
    async def close(self):
        """Close WebSocket connection"""
        self.running = False
        if self.ws:
            await self.ws.close()
            LOG.info("CometChat WebSocket closed")

