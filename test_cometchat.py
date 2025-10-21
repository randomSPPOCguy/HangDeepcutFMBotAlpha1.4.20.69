#!/usr/bin/env python3
"""
CometChat Connection Diagnostic Tool
Tests if the bot can send messages to the room
"""

import sys
import logging
from hangfm_bot.config import settings
from hangfm_bot.connection import CometChatManager

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

LOG = logging.getLogger("test")

def main():
    print("=" * 60)
    print("   COMETCHAT DIAGNOSTIC TEST")
    print("=" * 60)
    
    print("\n📋 Configuration:")
    print(f"  CometChat AppID: {settings.cometchat_appid}")
    print(f"  CometChat Region: {settings.cometchat_region}")
    print(f"  CometChat UID: {settings.cometchat_uid}")
    print(f"  CometChat Auth Token: {settings.cometchat_auth[:20]}..." if len(settings.cometchat_auth) > 20 else settings.cometchat_auth)
    print(f"  Room UUID: {settings.room_uuid}")
    print(f"  Bot Name: {settings.bot_name}")
    
    print("\n🔧 Initializing CometChat Manager...")
    cometchat = CometChatManager()
    
    print("\n📤 Attempting to send test message...")
    test_message = f"🧪 Test message from {settings.bot_name} diagnostic tool"
    
    success = cometchat.send_message(test_message)
    
    if success:
        print("\n✅ SUCCESS! Message sent to room!")
        print("\nIf you don't see this message in chat, check:")
        print("  1. Is the bot user actually in the room?")
        print("  2. Is the ROOM_UUID correct?")
        print("  3. Is the COMETCHAT_UID correct (bot's user ID)?")
        return 0
    else:
        print("\n❌ FAILED! Could not send message.")
        print("\nCheck the logs above for error details.")
        print("\nCommon issues:")
        print("  1. Wrong COMETCHAT_APPID")
        print("  2. Wrong COMETCHAT_AUTH token")
        print("  3. Wrong COMETCHAT_UID (must be bot's user UUID)")
        print("  4. Wrong ROOM_UUID")
        print("  5. Bot not member of group (should auto-join)")
        return 1

if __name__ == "__main__":
    sys.exit(main())

