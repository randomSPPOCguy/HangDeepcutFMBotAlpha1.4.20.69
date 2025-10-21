# main.py - DEBUG VERSION
# This version logs the raw payload structure so we can fix the parsing

import asyncio
import json
import logging
import signal
import sys
from datetime import datetime

from hangfm_bot.config import settings
from hangfm_bot.ai import AIManager
from hangfm_bot.utils import RoleChecker, ContentFilter
from hangfm_bot.handlers import CommandHandler
from hangfm_bot.music import GenreClassifier
from hangfm_bot.message_queue import MessageQueue
from hangfm_bot.relay_receiver import RelayReceiver
from hangfm_bot.connection import CometChatManager, CometChatWebSocket
from hangfm_bot import uptime as uptime_module

LOG = logging.getLogger("hangfm_bot")

def setup_signal_handlers(uptime_manager: uptime_module.UptimeManager):
    def _shutdown(signum, frame):
        LOG.info("🛑 Shutdown signal received, persisting uptime...")
        try:
            uptime_manager.record_shutdown()
        except Exception:
            LOG.exception("Failed saving uptime state")
        sys.exit(0)
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _shutdown)
        except Exception:
            pass

async def process_queue_item(item, ai_manager, command_handler, content_filter, cometchat):
    """Process queue items with DEBUG logging"""
    event_type, data = item
    
    # DEBUG: Log the raw payload structure
    LOG.info("=" * 60)
    LOG.info(f"🔍 DEBUG EVENT: {event_type}")
    LOG.info(f"🔍 DEBUG PAYLOAD TYPE: {type(data)}")
    LOG.info(f"🔍 DEBUG PAYLOAD:\n{json.dumps(data, indent=2, default=str)}")
    LOG.info("=" * 60)
    
    try:
        # Handle chat messages from CometChat WebSocket
        if event_type == "chatMessage":
            text = data.get("text", "")
            sender = data.get("sender", {})
            sender_uuid = sender.get("uid", "")
            sender_name = sender.get("name", "Unknown")
            
            LOG.info(f"💬 Chat message - From: {sender_name} ({sender_uuid}) | Text: {text[:100]}")
            
            if not text or not sender_uuid:
                LOG.warning("⚠️ Missing text or sender UUID - skipping")
                return

            if not content_filter.is_clean(text):
                LOG.warning("🚫 Filtered message from %s: profanity", sender_name)
                return

            # Handle commands
            if text.startswith("/") or text.startswith("."):
                LOG.info(f"⚡ Command detected: {text}")
                response = await command_handler.handle_message(sender_uuid, text, sender_name)
                if response:
                    LOG.info(f"💬 Sending command response: {response[:100]}")
                    sent = await cometchat.send_message(response)
                    if sent:
                        LOG.info("✅ Command response sent")
                    else:
                        LOG.error("❌ Command response failed to send")
                return

            # Handle AI keywords
            if "bot" in text.lower():
                LOG.info(f"🤖 AI keyword triggered by {sender_name}: {text}")
                ai_response = await ai_manager.generate_response(text, "user", [])
                if ai_response:
                    LOG.info(f"✅ AI response generated: {ai_response[:100]}")
                    sent = await cometchat.send_message(ai_response)
                    if sent:
                        LOG.info("✅ AI response sent")
                    else:
                        LOG.error("❌ AI response failed to send")
                else:
                    LOG.warning("⚠️ AI returned empty response")
            return
        
        # Handle Socket.IO events (from relay)
        if event_type in ("statefulMessage", "statelessMessage"):
            # Try multiple possible payload structures
            text = None
            sender_uuid = None
            sender_name = None
            
            # Structure 1: CometChat style with nested data
            if isinstance(data, dict):
                if "data" in data and isinstance(data["data"], dict):
                    text = data["data"].get("text", "")
                    
                # Structure 2: Direct text field
                if not text:
                    text = data.get("text", "")
                
                # Structure 3: message.text
                if not text and "message" in data:
                    text = data["message"].get("text", "") if isinstance(data["message"], dict) else ""
                
                # Get sender info - try multiple structures
                sender = data.get("sender", {})
                if not sender:
                    sender = data.get("user", {})
                if not sender:
                    sender = data.get("from", {})
                
                if isinstance(sender, dict):
                    sender_uuid = (
                        sender.get("uid") or 
                        sender.get("userUuid") or 
                        sender.get("id") or 
                        sender.get("uuid") or
                        ""
                    )
                    sender_name = (
                        sender.get("name") or 
                        sender.get("nickname") or 
                        sender.get("username") or
                        sender_uuid
                    )
            
            LOG.info(f"📨 Parsed - From: {sender_name} ({sender_uuid}) | Text: {text[:100] if text else 'EMPTY'}")
            
            if not text or not sender_uuid:
                LOG.warning("⚠️ Missing text or sender UUID - skipping")
                return

            if not content_filter.is_clean(text):
                LOG.warning("🚫 Filtered message from %s: profanity", sender_name)
                return

            # Handle commands
            if text.startswith("/") or text.startswith("!"):
                LOG.info(f"⚡ Command detected: {text}")
                response = await command_handler.handle_message(sender_uuid, text, sender_name)
                if response:
                    LOG.info(f"💬 Sending command response: {response[:100]}")
                    sent = await cometchat.send_message(response)  # ✅ AWAIT async call
                    if sent:
                        LOG.info("✅ Command response sent")
                    else:
                        LOG.error("❌ Command response failed to send")
                return

            # Handle AI keywords
            if "bot" in text.lower():
                LOG.info(f"🤖 AI keyword triggered by {sender_name}: {text}")
                ai_response = await ai_manager.generate_response(text, "user", [])
                if ai_response:
                    LOG.info(f"✅ AI response generated: {ai_response[:100]}")
                    sent = await cometchat.send_message(ai_response)  # ✅ AWAIT async call
                    if sent:
                        LOG.info("✅ AI response sent")
                    else:
                        LOG.error("❌ AI response failed to send")
                else:
                    LOG.warning("⚠️ AI returned empty response")

        elif event_type == "playedSong":
            song_info = data if isinstance(data, dict) else {}
            artist = song_info.get("artistName", "Unknown")
            track = song_info.get("trackName", "Unknown")
            LOG.info("🎵 Now playing: %s - %s", artist, track)
            ai_manager.update_room_context({"currentSong": song_info})

        elif event_type == "roomStateUpdated":
            LOG.info("🏠 Room state updated")
            ai_manager.update_room_context({"roomState": data})

    except Exception as exc:
        LOG.exception("❌ Error processing queue item: %s", exc)


async def main():
    logging.basicConfig(
        level=logging.DEBUG,  # Changed to DEBUG for troubleshooting
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    LOG.info("=" * 60)
    LOG.info("   HANG.FM BOT - DEBUG VERSION")
    LOG.info("=" * 60)

    # Initialize modules
    LOG.info("Initializing modules...")
    content_filter = ContentFilter()
    ai_manager = AIManager()
    role_checker = RoleChecker()
    genre_classifier = GenreClassifier()
    command_handler = CommandHandler(role_checker)
    message_queue = MessageQueue(maxsize=200)
    cometchat = CometChatManager()

    uptime_manager = uptime_module.UptimeManager()
    setup_signal_handlers(uptime_manager)

    # Commands
    async def uptime_cmd(user_uuid, argline, user_nickname):
        current_str, lifetime_str = uptime_manager.get_uptime_strings()
        started_at = datetime.fromtimestamp(uptime_manager.start_ts).isoformat(timespec="seconds")
        first_seen = datetime.fromtimestamp(uptime_manager.first_seen).isoformat(timespec="seconds") if uptime_manager.first_seen else "unknown"
        return f"⏱️ Uptime: {current_str}  •  🔁 Lifetime: {lifetime_str}  •  Started: {started_at}  •  First seen: {first_seen}"

    async def help_cmd(user_uuid, argline, user_nickname):
        return "Available commands: /uptime, /help, /commands, /stats, /ai"

    command_handler.register("uptime", uptime_cmd)
    command_handler.register("help", help_cmd)
    command_handler.register("commands", help_cmd)
    command_handler.register("stats", help_cmd)
    command_handler.register("ai", help_cmd)

    LOG.info(f"Registered {len(command_handler.handlers)} commands")

    # Start relay receiver
    receiver = RelayReceiver(message_queue)
    runner = await receiver.start(port=4000)

    LOG.info("=" * 60)
    LOG.info("   RELAY RECEIVER READY!")
    LOG.info("=" * 60)
    LOG.info("   Listening on: http://127.0.0.1:4000/events")
    LOG.info("=" * 60)
    
    # Start CometChat WebSocket (for receiving chat messages)
    cometchat_ws = CometChatWebSocket(message_queue)
    try:
        await cometchat_ws.connect()
        LOG.info("✅ CometChat WebSocket connected")
    except Exception as e:
        LOG.error(f"❌ CometChat WebSocket failed: {e}")
        LOG.warning("⚠️ Bot will continue without CometChat WebSocket (no chat message reception)")

    # Send boot greeting
    try:
        greeting_text = await command_handler.handle_message("system", "/uptime", settings.bot_name)
        if greeting_text:
            outgoing = f"👋 {settings.bot_name} online! {greeting_text}"
            sent = await cometchat.send_message(outgoing)  # ✅ AWAIT async call
            if sent:
                LOG.info("✅ Boot greeting sent")
            else:
                LOG.error("❌ Boot greeting failed")
    except Exception as e:
        LOG.exception(f"❌ Boot greeting exception: {e}")

    # Message processing loop
    async def process_messages():
        while True:
            item = await message_queue.get()
            await process_queue_item(item, ai_manager, command_handler, content_filter, cometchat)

    try:
        await process_messages()
    finally:
        LOG.info("Shutting down, persisting uptime")
        uptime_manager.record_shutdown()
        await cometchat.close()  # Close aiohttp session
        await cometchat_ws.close()  # Close WebSocket
        await runner.cleanup()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Shutdown complete")
