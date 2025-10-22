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
from hangfm_bot.connection import CometChatManager, CometChatPoller
from hangfm_bot import uptime as uptime_module
from hangfm_bot.user_memory import UserMemory
from hangfm_bot.permissions import PermissionsManager

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

async def process_queue_item(item, ai_manager, command_handler, content_filter, cometchat, user_memory):
    """Process queue items"""
    event_type, data = item
    
    try:
        # Handle chat messages from CometChat WebSocket
        if event_type == "chatMessage":
            text = data.get("text", "")
            sender = data.get("sender", {})
            sender_uuid = sender.get("uid", "")
            sender_name = sender.get("name", "Unknown")
            
            if not text or not sender_uuid:
                # Skip empty messages silently (too spammy to log)
                return
            
            # Skip system messages (like "played" notifications from CometChat)
            if sender_uuid == "app_system" or "<@uid:" in text:
                LOG.debug(f"Skipping system message: {text[:50]}")
                return
            
            LOG.info(f"💬 {sender_name} ({sender_uuid}): {text[:50]}")

            if not content_filter.is_clean(text):
                LOG.warning("🚫 Filtered message from %s: profanity", sender_name)
                return

            # Handle commands (/, /., !, .)
            if text.startswith("/") or text.startswith(".") or text.startswith("!"):
                response = await command_handler.handle_message(sender_uuid, text, sender_name)
                if response:
                    await cometchat.send_message(response)
                return

            # Handle AI keywords
            if "bot" in text.lower():
                LOG.info(f"🤖 AI: {sender_name} asked")
                ai_response = await ai_manager.generate_response(text, "user", [])
                if ai_response:
                    await cometchat.send_message(ai_response)
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
            
            # Silently skip empty socket.io metadata messages
            if not text or not sender_uuid:
                return
            
            LOG.debug(f"📨 Socket.IO message from {sender_name}: {text[:50]}")

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
                
                # Update user sentiment based on message (like OG bot)
                sentiment = user_memory.update_sentiment(sender_uuid, text)
                sentiment_prompt, sentiment_desc = user_memory.get_personality_for_user(sender_uuid)
                LOG.info(f"🎭 Sentiment: {sentiment} ({sentiment_desc})")
                
                # Get conversation context for this user
                user_context = user_memory.get_context(sender_uuid, limit=5)
                
                # Generate AI response with sentiment-based personality
                ai_response = await ai_manager.generate_response(
                    text, 
                    "user", 
                    user_context,
                    user_uuid=sender_uuid,
                    sentiment_prompt=sentiment_prompt
                )
                
                if ai_response is None:
                    LOG.info("🚫 AI is disabled - skipping response")
                    return
                    
                if ai_response:
                    LOG.info(f"✅ AI response generated: {ai_response[:100]}")
                    
                    # Save to conversation history
                    user_memory.add_to_context(sender_uuid, "user", text)
                    user_memory.add_to_context(sender_uuid, "assistant", ai_response)
                    
                    sent = await cometchat.send_message(ai_response)
                    if sent:
                        LOG.info("✅ AI response sent")
                    else:
                        LOG.error("❌ AI response failed to send")
                else:
                    LOG.warning("⚠️ AI returned empty response")

        elif event_type == "playedSong":
            song_info = data if isinstance(data, dict) else {}
            
            # Debug: show the structure if allow_debug is enabled
            if settings.allow_debug:
                LOG.info(f"🔍 playedSong data structure: {list(song_info.keys())}")
            
            # Try multiple field names for song data
            artist = (song_info.get("artistName") or 
                     song_info.get("artist") or 
                     song_info.get("metadata", {}).get("artist"))
            track = (song_info.get("trackName") or 
                    song_info.get("track") or 
                    song_info.get("name") or
                    song_info.get("metadata", {}).get("track"))
            dj_name = (song_info.get("djName") or 
                      song_info.get("dj") or 
                      song_info.get("user", {}).get("name"))
            
            if artist and track and dj_name:
                LOG.info(f"🎵 Now playing: {artist} - {track} (DJ: {dj_name})")
                ai_manager.update_room_context({"currentSong": song_info, "lastDJ": dj_name})
            else:
                LOG.debug(f"playedSong event with incomplete data: {list(song_info.keys())}")
        
        elif event_type == "userJoined":
            if isinstance(data, dict):
                # Debug: show the structure if allow_debug is enabled
                if settings.allow_debug:
                    LOG.info(f"🔍 userJoined data structure: {list(data.keys())}")
                
                user_name = (data.get("name") or 
                           data.get("nickname") or 
                           data.get("username") or
                           data.get("user", {}).get("name"))
                if user_name:
                    LOG.info(f"👋 {user_name} joined the room")
                    ai_manager.update_room_context({"lastJoin": user_name})
                else:
                    # Only show keys if not in debug mode
                    if not settings.allow_debug:
                        LOG.debug(f"userJoined event with no name: {list(data.keys())}")
        
        elif event_type == "userLeft":
            if isinstance(data, dict):
                # Debug: show the structure if allow_debug is enabled
                if settings.allow_debug:
                    LOG.info(f"🔍 userLeft data structure: {list(data.keys())}")
                
                user_name = (data.get("name") or 
                           data.get("nickname") or 
                           data.get("username") or
                           data.get("user", {}).get("name"))
                if user_name:
                    LOG.info(f"👋 {user_name} left the room")
                    ai_manager.update_room_context({"lastLeave": user_name})
                else:
                    # Only show keys if not in debug mode
                    if not settings.allow_debug:
                        LOG.debug(f"userLeft event with no name: {list(data.keys())}")
        
        elif event_type == "addedDj":
            if isinstance(data, dict):
                dj_name = (data.get("name") or 
                          data.get("nickname") or 
                          data.get("username") or
                          data.get("user", {}).get("name"))
                if dj_name:
                    LOG.info(f"🎧 {dj_name} hopped on stage")
                    ai_manager.update_room_context({"lastDJAdd": dj_name})
        
        elif event_type == "removedDj":
            if isinstance(data, dict):
                dj_name = (data.get("name") or 
                          data.get("nickname") or 
                          data.get("username") or
                          data.get("user", {}).get("name"))
                if dj_name:
                    LOG.info(f"🎧 {dj_name} left the stage")
                    ai_manager.update_room_context({"lastDJRemove": dj_name})

        elif event_type == "roomStateUpdated":
            # Extract useful info from room state
            if isinstance(data, dict):
                room_info = {}
                
                # Get current song
                if data.get('currentSong'):
                    song = data['currentSong']
                    room_info['currentSong'] = song
                    room_info['lastDJ'] = song.get('djName', 'Unknown')
                    LOG.info(f"🎵 Playing: {song.get('artistName', 'Unknown')} - {song.get('trackName', 'Unknown')} (DJ: {room_info['lastDJ']})")
                
                # Get DJs on stage
                if data.get('djs'):
                    dj_names = [dj.get('name', 'Unknown') for dj in data['djs'] if dj.get('name')]
                    if dj_names:
                        room_info['djList'] = dj_names
                        LOG.info(f"🎧 On stage: {', '.join(dj_names)}")
                
                # Get users in room
                if data.get('users'):
                    user_names = [u.get('name') for u in data['users'] if u.get('name')]
                    if user_names:
                        room_info['userList'] = user_names
                        preview = ', '.join(user_names[:5])
                        if len(user_names) > 5:
                            preview += f" (+{len(user_names) - 5} more)"
                        LOG.info(f"👥 In room ({len(user_names)}): {preview}")
                
                ai_manager.update_room_context(room_info)
            else:
                ai_manager.update_room_context({"roomState": data})

    except Exception as exc:
        LOG.exception("❌ Error processing queue item: %s", exc)


async def main():
    # Set up clean logging
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    # Silence noisy libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)
    logging.getLogger("aiohttp.access").setLevel(logging.WARNING)  # Hide HTTP access logs
    logging.getLogger("relay_receiver").setLevel(logging.WARNING)  # Only show warnings
    logging.getLogger("cometchat_poller").setLevel(logging.INFO)  # Hide DEBUG spam
    
    LOG.info("=" * 60)
    LOG.info("   🎵 HANG.FM BOT v2.0")
    LOG.info("=" * 60)
    LOG.info(f"🤖 Bot: {settings.bot_name}")
    LOG.info(f"🆔 Room: {settings.room_uuid}")
    LOG.info("=" * 60)
    
    content_filter = ContentFilter()
    ai_manager = AIManager()
    permissions_manager = PermissionsManager()  # Load permissions from file
    role_checker = RoleChecker(permissions_manager)
    genre_classifier = GenreClassifier()
    command_handler = CommandHandler(role_checker)
    message_queue = MessageQueue(maxsize=200)
    cometchat = CometChatManager()
    user_memory = UserMemory()  # Track user sentiment and conversation history

    uptime_manager = uptime_module.UptimeManager()
    setup_signal_handlers(uptime_manager)

    # Commands
    async def uptime_cmd(user_uuid, argline, user_nickname):
        current_str, lifetime_str = uptime_manager.get_uptime_strings()
        started_at = datetime.fromtimestamp(uptime_manager.start_ts).isoformat(timespec="seconds")
        first_seen = datetime.fromtimestamp(uptime_manager.first_seen).isoformat(timespec="seconds") if uptime_manager.first_seen else "unknown"
        return f"⏱️ Uptime: {current_str}  •  🔁 Lifetime: {lifetime_str}  •  Started: {started_at}  •  First seen: {first_seen}"
    
    async def room_cmd(user_uuid, argline, user_nickname):
        """Show current room context"""
        ctx = ai_manager.room_context
        if not ctx:
            return "📭 No room events yet"
        
        info = "🏠 Room Status\n\n"
        
        # Current song
        if ctx.get('currentSong'):
            song = ctx['currentSong']
            info += f"🎵 Playing: {song.get('artistName')} - {song.get('trackName')}\n"
            if ctx.get('lastDJ'):
                info += f"   🎧 DJ: {ctx['lastDJ']}\n"
        
        # DJs on stage
        if ctx.get('djList'):
            info += f"\n🎧 On stage: {', '.join(ctx['djList'])}\n"
        
        # Users in room
        if ctx.get('userList'):
            total = len(ctx['userList'])
            preview = ', '.join(ctx['userList'][:5])
            if total > 5:
                preview += f" (+{total - 5} more)"
            info += f"\n👥 In room ({total}): {preview}\n"
        
        # Recent events
        if ctx.get('lastJoin'):
            info += f"\n👋 Last joined: {ctx['lastJoin']}"
        if ctx.get('lastLeave'):
            info += f"\n👋 Last left: {ctx['lastLeave']}"
        
        return info.strip() or "📭 No recent events"

    async def help_cmd(user_uuid, argline, user_nickname):
        # Check if user is admin
        user_role = role_checker.get_user_role(user_uuid)
        
        commands_text = f"""✨ {settings.bot_name} Commands

📊 Info
  /uptime - Bot uptime

🤖 AI Chat
  Say "bot" to chat with AI"""
        
        # Add admin notice for mods/co-owners
        if user_role in ("coowner", "moderator"):
            commands_text += f"\n\n👑 Admin\n  /.adminhelp - Show admin commands"
        
        return commands_text
    
    async def ai_switch_cmd(user_uuid, argline, user_nickname):
        """Switch AI provider (co-owner only)"""
        user_role = role_checker.get_user_role(user_uuid)
        
        if user_role != "coowner":
            return "❌ Only co-owners can switch AI providers."
        
        # Get current provider
        current = ai_manager.get_current_provider()
        available = ai_manager.get_available_providers()
        
        if not argline:
            # Show current status with HuggingFace models numbered
            hf_models = [m for m in available if m.startswith("huggingface:")]
            status = f"🤖 **AI Provider Status**\n\nCurrent: {current}\n\nAvailable:\n"
            
            for model in available:
                if model.startswith("huggingface:"):
                    idx = hf_models.index(model) + 1
                    model_name = model.split("/")[-1]  # Get short name
                    status += f"• huggingface #{idx} - {model_name}\n"
                else:
                    status += f"• {model}\n"
            
            status += "\n**Usage:** /.ai <gemini|openai|claude|huggingface|hf [1-4]|off|auto>"
            return status
        
        args = argline.strip().lower().split()
        provider = args[0] if args else ""
        
        if provider == "off":
            ai_manager.set_provider_override(None, disabled=True)
            return "❌ AI responses disabled"
        
        if provider == "auto":
            ai_manager.set_provider_override(None, disabled=False)
            return f"🔄 AI set to AUTO (priority order)"
        
        # Handle HuggingFace with number (e.g., "hf 2" or "huggingface 3")
        if provider in ("huggingface", "hf"):
            hf_models = [m for m in available if m.startswith("huggingface:")]
            if not hf_models:
                return "❌ HuggingFace is not configured (missing API key)"
            
            # Check if number was provided
            if len(args) > 1 and args[1].isdigit():
                idx = int(args[1]) - 1
                if 0 <= idx < len(hf_models):
                    selected = hf_models[idx]
                    ai_manager.set_provider_override(selected)
                    model_name = selected.split("/")[-1]
                    return f"✅ AI switched to HUGGINGFACE #{idx + 1} ({model_name})"
                else:
                    return f"❌ HuggingFace model #{args[1]} doesn't exist (1-{len(hf_models)} available)"
            else:
                # No number - use first HF model
                ai_manager.set_provider_override(hf_models[0])
                model_name = hf_models[0].split("/")[-1]
                return f"✅ AI switched to HUGGINGFACE #1 ({model_name})"
        
        # Map other friendly names
        provider_map = {
            "gemini": "gemini",
            "openai": "openai",
            "claude": "anthropic",
        }
        
        mapped_provider = provider_map.get(provider)
        if not mapped_provider:
            return f"❌ Unknown provider: {provider}\n\nAvailable: gemini, openai, claude, huggingface [1-4], off, auto"
        
        # Check if provider is available
        matching_models = [m for m in available if m.startswith(mapped_provider)]
        if not matching_models:
            return f"❌ {provider.upper()} is not configured (missing API key)"
        
        ai_manager.set_provider_override(matching_models[0])
        return f"✅ AI switched to {provider.upper()} ({matching_models[0]})"
    
    async def adminhelp_cmd(user_uuid, argline, user_nickname):
        user_role = role_checker.get_user_role(user_uuid)
        
        if user_role not in ("coowner", "moderator"):
            return "❌ Admin commands are only available to moderators and co-owners."
        
        admin_text = f"🛡️ {user_role.upper()} COMMANDS\n\n"
        
        if user_role == "coowner":
            admin_text += """👑 Co-Owner Commands
  /.ai <provider> - Switch AI provider
    (gemini, openai, claude, huggingface, off, auto)
  /.addcoowner <uuid> - Add co-owner
  /.addmod <uuid> - Add moderator
  /.removecoowner <uuid> - Remove co-owner
  /.removemod <uuid> - Remove moderator
  /.listperms - List all permissions

"""
        
        admin_text += """🔨 Moderator Commands
  /kick <user> - Kick user
  /track - Track info
  /queue - Show queue

📋 Utility
  /myuuid - Show your UUID"""
        
        return admin_text
    
    async def gitlink_cmd(user_uuid, argline, user_nickname):
        """Link to GitHub project"""
        return """🚀 HangDeepcutFMBotAlpha1.4.20.69

Open-source music bot collection on GitHub.

What's Inside:
• 🐍 Python Bot (WIP) - Modern modular rebuild
• 📜 OG Hang.fm Bot - Original bot, base for modular version
• 📜 OG Deepcut Bot - Deepcut.live bot (future modular version planned)

Current Features:
• Multi-AI support (Gemini, OpenAI, Claude, HuggingFace)
• Real-time room events & health monitoring
• Dynamic AI personality with user memory
• Role-based permissions system

🔗 https://github.com/randomSPPOCguy/HangDeepcutFMBotAlpha1.4.20.69"""
    
    async def ty_cmd(user_uuid, argline, user_nickname):
        """Thank the community"""
        return """Thank you to:

Jodrell
noiz
Kai the Husky
butter
The music sharing community"""
    
    async def addcoowner_cmd(user_uuid, argline, user_nickname):
        """Add co-owner UUID (co-owner only)"""
        user_role = role_checker.get_user_role(user_uuid)
        
        if user_role != "coowner":
            return f"🔑 Your UUID: {user_uuid}\n\nType /myuuid to see your UUID"
        
        if not argline or not argline.strip():
            return f"Usage: /.addcoowner <uuid>"
        
        new_uuid = argline.strip()
        
        # Add to permissions manager (saves to file)
        permissions_manager.add_coowner(new_uuid, "Unknown")
        return f"✅ Added {new_uuid} as co-owner\n💾 Saved to permissions.json\n\n📝 They'll have access immediately!"
    
    async def addmod_cmd(user_uuid, argline, user_nickname):
        """Add moderator UUID (co-owner only)"""
        user_role = role_checker.get_user_role(user_uuid)
        
        if user_role != "coowner":
            return "❌ Only co-owners can add moderators."
        
        if not argline or not argline.strip():
            return f"Usage: /.addmod <uuid>"
        
        new_uuid = argline.strip()
        
        # Add to permissions manager (saves to file)
        permissions_manager.add_moderator(new_uuid, "Unknown")
        return f"✅ Added {new_uuid} as moderator\n💾 Saved to permissions.json\n\n📝 They'll have access immediately!"
    
    async def removecoowner_cmd(user_uuid, argline, user_nickname):
        """Remove co-owner UUID (co-owner only)"""
        user_role = role_checker.get_user_role(user_uuid)
        
        if user_role != "coowner":
            return "❌ Only co-owners can remove co-owners."
        
        if not argline or not argline.strip():
            return f"Usage: /.removecoowner <uuid>"
        
        remove_uuid = argline.strip()
        
        if not permissions_manager.is_coowner(remove_uuid):
            return f"❌ {remove_uuid} is not a co-owner"
        
        permissions_manager.remove_coowner(remove_uuid)
        return f"✅ Removed co-owner\n💾 Saved to permissions.json"
    
    async def removemod_cmd(user_uuid, argline, user_nickname):
        """Remove moderator UUID (co-owner only)"""
        user_role = role_checker.get_user_role(user_uuid)
        
        if user_role != "coowner":
            return "❌ Only co-owners can remove moderators."
        
        if not argline or not argline.strip():
            return f"Usage: /.removemod <uuid>"
        
        remove_uuid = argline.strip()
        
        if not permissions_manager.is_moderator(remove_uuid):
            return f"❌ {remove_uuid} is not a moderator"
        
        permissions_manager.remove_moderator(remove_uuid)
        return f"✅ Removed moderator\n💾 Saved to permissions.json"
    
    async def listperms_cmd(user_uuid, argline, user_nickname):
        """List all permissions (co-owner only)"""
        user_role = role_checker.get_user_role(user_uuid)
        
        if user_role != "coowner":
            return "❌ Only co-owners can view permissions."
        
        return permissions_manager.list_all()
    
    async def myuuid_cmd(user_uuid, argline, user_nickname):
        """Show your UUID"""
        return f"🔑 Your UUID: {user_uuid}\n\n📝 Use /.addcoowner or /.addmod to grant permissions"

    command_handler.register("uptime", uptime_cmd)
    command_handler.register("commands", help_cmd)
    command_handler.register("ai", ai_switch_cmd)
    command_handler.register("adminhelp", adminhelp_cmd)
    command_handler.register("gitlink", gitlink_cmd)
    command_handler.register("ty", ty_cmd)
    command_handler.register("addcoowner", addcoowner_cmd)
    command_handler.register("addmod", addmod_cmd)
    command_handler.register("removecoowner", removecoowner_cmd)
    command_handler.register("removemod", removemod_cmd)
    command_handler.register("listperms", listperms_cmd)
    command_handler.register("myuuid", myuuid_cmd)

    # Start relay receiver
    receiver = RelayReceiver(message_queue)
    runner = await receiver.start(port=4000)
    
    # Start CometChat HTTP Poller (for receiving chat messages)
    cometchat_poller = CometChatPoller(message_queue)
    await cometchat_poller.start()
    LOG.info("✅ CometChat HTTP polling started")

    # Send boot greeting
    try:
        greeting_text = await command_handler.handle_message("system", "/uptime", settings.bot_name)
        if greeting_text:
            outgoing = f"👋 {settings.bot_name} online! {greeting_text}"
            await cometchat.send_message(outgoing)
            LOG.info("✅ Bot online and visible in room")
    except Exception as e:
        LOG.error(f"❌ Boot greeting failed: {e}")
    
    # Request room state from relay
    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.get("http://127.0.0.1:3000/roomstate", timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status == 200:
                    LOG.info("📊 Requested room state from relay")
                else:
                    LOG.warning(f"⚠️  Room state request failed: {resp.status}")
    except Exception as e:
        LOG.debug(f"Room state request failed (relay might still be starting): {e}")

    # Periodic uptime save (every 60 seconds to prevent data loss)
    async def periodic_save():
        while True:
            await asyncio.sleep(60)
            uptime_manager.save_periodic()
    
    # Health check: verify bot is still visible in room (every 5 minutes)
    async def health_check():
        while True:
            await asyncio.sleep(300)  # 5 minutes
            try:
                # Try to send a heartbeat to verify connection
                session = await cometchat._get_session()
                url = f"{cometchat.base_url}/v3/users/{settings.cometchat_uid}"
                async with session.get(url, headers=cometchat.headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status == 200:
                        LOG.debug("✅ Health check passed - bot is connected")
                    else:
                        LOG.error(f"⚠️  Health check failed: {resp.status} - bot may not be visible!")
            except Exception as e:
                LOG.error(f"⚠️  Health check error: {e} - connection may be lost!")
    
    # Message processing loop
    async def process_messages():
        while True:
            item = await message_queue.get()
            await process_queue_item(item, ai_manager, command_handler, content_filter, cometchat, user_memory)

    try:
        # Start background tasks
        save_task = asyncio.create_task(periodic_save())
        health_task = asyncio.create_task(health_check())
        
        # Run message processing (this blocks until shutdown)
        await process_messages()
    finally:
        LOG.info("Shutting down, persisting uptime")
        save_task.cancel()
        health_task.cancel()
        uptime_manager.record_shutdown()
        await cometchat.close()  # Close aiohttp session
        await cometchat_poller.close()  # Stop polling
        await runner.cleanup()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Shutdown complete")
