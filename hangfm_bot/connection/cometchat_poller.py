# hangfm_bot/connection/cometchat_poller.py
# CometChat HTTP polling for receiving chat messages (fallback when WebSocket doesn't work)

import asyncio
import logging
import aiohttp
from hangfm_bot.config import settings

LOG = logging.getLogger("cometchat_poller")


class CometChatPoller:
    """
    CometChat HTTP polling for receiving chat messages
    Polls the CometChat REST API for new messages every second
    """
    
    def __init__(self, message_queue):
        self.message_queue = message_queue
        self.session = None
        self.running = False
        self.last_message_id = None
        
        self.base_url = f"https://{settings.cometchat_appid}.apiclient-{settings.cometchat_region}.cometchat.io"
        self.headers = {
            "Content-Type": "application/json",
            "authtoken": settings.cometchat_auth,
            "appid": settings.cometchat_appid,
            "onBehalfOf": settings.cometchat_uid,
            "dnt": "1",
            "origin": "https://tt.live",
            "referer": "https://tt.live/",
            "sdk": "javascript@3.0.10"
        }
        
        LOG.info("CometChat Poller initialized")
    
    async def start(self):
        """Start polling for messages"""
        self.running = True
        self.session = aiohttp.ClientSession()
        LOG.info("🔄 Starting CometChat HTTP polling...")
        
        asyncio.create_task(self._poll_loop())
    
    async def _poll_loop(self):
        """Poll for new messages every second"""
        while self.running:
            try:
                await self._poll_messages()
                await asyncio.sleep(1)  # Poll every second
            except Exception as e:
                LOG.error(f"Poll error: {e}")
                await asyncio.sleep(1)
    
    async def _poll_messages(self):
        """Poll CometChat for new messages"""
        try:
            url = f"{self.base_url}/v3/groups/{settings.room_uuid}/messages"
            params = {
                "limit": "10",
            }
            
            async with self.session.get(url, headers=self.headers, params=params, timeout=aiohttp.ClientTimeout(total=5)) as response:
                if response.status == 200:
                    data = await response.json()
                    messages = data.get("data", [])
                    
                    if not messages:
                        return
                    
                    # Process messages in chronological order (oldest first)
                    for msg in reversed(messages):
                        await self._handle_message(msg)
                        
                elif response.status != 304:  # 304 = Not Modified (no new messages)
                    text = await response.text()
                    if response.status != 401:  # Don't spam 401 errors
                        LOG.warning(f"Poll failed {response.status}: {text[:200]}")
                    
        except asyncio.TimeoutError:
            LOG.debug("Poll timeout (normal)")
        except Exception as e:
            LOG.error(f"Poll exception: {e}")
    
    async def _handle_message(self, message):
        """Handle a polled message"""
        try:
            # Handle both dict and string (API might return different formats)
            if isinstance(message, str):
                LOG.debug(f"Skipping string message: {message[:50]}")
                return
            
            if not isinstance(message, dict):
                LOG.warning(f"Unexpected message type: {type(message)}")
                return
            
            msg_id = message.get("id")
            msg_type = message.get("type")
            
            # Skip messages we've already seen
            if msg_id:
                if self.last_message_id and int(msg_id) <= int(self.last_message_id):
                    LOG.debug(f"Skipping already-seen message ID: {msg_id}")
                    return
                
                # Update last seen message ID
                self.last_message_id = msg_id
            
            # Only process text messages
            if msg_type != "text":
                LOG.debug(f"Skipping non-text message type: {msg_type}")
                return
            
            # Get sender (can be string UID or dict object)
            sender = message.get("sender")
            if isinstance(sender, dict):
                sender_uuid = sender.get("uid", "")
                sender_name = sender.get("name", "Unknown")
            elif isinstance(sender, str):
                # Sender is just the UID string
                sender_uuid = sender
                sender_name = message.get("senderName", "Unknown") or "Unknown"
            else:
                LOG.warning(f"Unknown sender format: {type(sender)}")
                return
            
            # Get text from data
            data = message.get("data", {})
            if isinstance(data, dict):
                text = data.get("text", "")
            else:
                text = ""
            
            # Ignore own messages
            if sender_uuid == settings.cometchat_uid:
                LOG.debug("Ignoring own message")
                return
            
            if text and sender_uuid:
                LOG.debug(f"📨 Polled message from {sender_name}: {text[:50]}")
                
                # Put message in queue for processing
                await self.message_queue.put(('chatMessage', {
                    'text': text,
                    'sender': {
                        'uid': sender_uuid,
                        'name': sender_name
                    }
                }))
            else:
                LOG.debug(f"Skipping message - text={bool(text)}, sender={sender_uuid}")
                
        except Exception as e:
            LOG.error(f"Error handling polled message: {e}", exc_info=True)
    
    async def close(self):
        """Stop polling and close session"""
        self.running = False
        if self.session and not self.session.closed:
            await self.session.close()
            LOG.info("CometChat Poller closed")

