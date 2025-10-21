# hangfm_bot/connection/cometchat_manager.py
# CometChat HTTP API for sending messages (NO SDK - pure HTTP)

import logging
import aiohttp
from hangfm_bot.config import settings

LOG = logging.getLogger("cometchat")


class CometChatManager:
    """
    CometChat HTTP API client (no SDK, pure HTTP like original JavaScript version)
    Uses async/await for non-blocking operations
    """
    
    def __init__(self):
        # Construct base URL like original JS: https://{appid}.apiclient-{region}.cometchat.io
        self.base_url = f"https://{settings.cometchat_appid}.apiclient-{settings.cometchat_region}.cometchat.io"
        # EXACT headers from original working bot (lines 5285-5294)
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
        self.session = None
        LOG.info(f"CometChat initialized: {self.base_url}")
    
    async def _get_session(self):
        """Get or create aiohttp session"""
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession()
        return self.session
    
    async def send_group_message(self, group_id: str, text: str) -> bool:
        """
        Send a message to a group (room)
        Auto-joins group if bot is not a member
        
        Matches the EXACT payload structure from the original working JavaScript bot
        """
        url = f"{self.base_url}/v3.0/messages"
        
        # EXACT payload structure from original working bot (lines 5296-5316)
        payload = {
            "receiver": group_id,
            "receiverType": "group",
            "category": "message",
            "type": "text",
            "data": {
                "text": text,
                "metadata": {
                    "chatMessage": {
                        "message": text,
                        "avatarId": "bot-01",
                        "userName": settings.bot_name,
                        "color": "#9E4ADF",
                        "mentions": [],
                        "userUuid": settings.cometchat_uid,
                        "badges": ["VERIFIED"],
                        "id": str(int(__import__('time').time() * 1000))
                    }
                }
            }
        }
        
        try:
            LOG.info(f"Sending message to group {group_id}: {text[:50]}")
            LOG.debug(f"CometChat URL: {url}")
            LOG.debug(f"CometChat payload: {payload}")
            
            session = await self._get_session()
            async with session.post(url, json=payload, headers=self.headers, timeout=aiohttp.ClientTimeout(total=10)) as response:
                response_text = await response.text()
                
                if response.status == 200:
                    LOG.info("✅ Message sent successfully")
                    return True
                
                # If not a member, try to add user then resend once
                if response.status == 404 and "not a member" in response_text.lower():
                    LOG.warning("Bot not in group, attempting to join...")
                    add_url = f"{self.base_url}/v3.0/groups/{group_id}/members"
                    add_payload = {"members": [{"uid": settings.cometchat_uid, "scope": "participant"}]}
                    
                    try:
                        async with session.post(add_url, json=add_payload, headers=self.headers, timeout=aiohttp.ClientTimeout(total=10)) as add_resp:
                            if add_resp.status in (200, 201):
                                LOG.info("✅ Bot added to group, retrying send...")
                                # Try sending again once
                                async with session.post(url, json=payload, headers=self.headers, timeout=aiohttp.ClientTimeout(total=10)) as retry_resp:
                                    if retry_resp.status == 200:
                                        LOG.info("✅ Message sent successfully after joining")
                                        return True
                    except Exception as e:
                        LOG.error(f"Failed to add bot to group: {e}")
                
                LOG.error(f"❌ CometChat error {response.status}: {response_text[:200]}")
                return False
                    
        except Exception as e:
            LOG.error(f"❌ Failed to send message: {e}")
            return False
    
    async def send_message(self, text: str) -> bool:
        """Send message to configured room"""
        return await self.send_group_message(settings.room_uuid, text)
    
    async def close(self):
        """Close the aiohttp session"""
        if self.session and not self.session.closed:
            await self.session.close()

