# Ensure env is loaded BEFORE settings are imported
from dotenv import load_dotenv
load_dotenv("hang-fm-config.env")
load_dotenv()  # also allow .env if present

import asyncio
import logging
import os
import signal

from hangfm_bot.message_queue import MessageQueue
from hangfm_bot.connection import TTFMSocketClient, CometChatSocketClient
from hangfm_bot.config import settings

LOG = logging.getLogger(__name__)
logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)
)

def _preflight() -> bool:
    missing = []
    if not (getattr(settings, "room_uuid", None) or os.getenv("ROOM_UUID")):
        missing.append("ROOM_UUID")
    if not (os.getenv("TTFM_AUTH_TOKEN") or os.getenv("HANG_AUTH_TOKEN") or getattr(settings, "ttfm_auth_token", None)):
        missing.append("TTFM_AUTH_TOKEN (or HANG_AUTH_TOKEN)")
    if not (getattr(settings, "cometchat_appid", None) or os.getenv("COMETCHAT_APPID")):
        missing.append("COMETCHAT_APPID")
    if not (getattr(settings, "cometchat_uid", None) or os.getenv("COMETCHAT_UID")):
        missing.append("COMETCHAT_UID")
    if not (getattr(settings, "cometchat_auth", None) or os.getenv("COMETCHAT_AUTH")):
        missing.append("COMETCHAT_AUTH")

    if missing:
        LOG.error("Missing required env: %s", ", ".join(missing))
        LOG.error("Fill hang-fm-config.env and restart.")
        return False
    return True

async def run():
    if not _preflight():
        return

    mq = MessageQueue()
    cc = CometChatSocketClient()
    ttfm = TTFMSocketClient(message_queue=mq)

    await cc.start()
    await ttfm.start()

    cc_ok = await cc.wait_authed(timeout=15.0)
    tt_ok = await ttfm.wait_joined(timeout=15.0)

    if cc_ok and tt_ok:
        greet_on = str(getattr(settings, "boot_greet", "true")).lower() == "true"
        if greet_on:
            greet = getattr(settings, "boot_greet_message", None) or "BOT Online 🦾🤖"
            try:
                if await cc.send_group_text(greet):
                    LOG.info("Boot greet sent via CometChat WS.")
            except Exception as e:
                LOG.error("Boot greet failed: %s", e)
    else:
        if not cc_ok:
            LOG.warning("CometChat WS not authed — chat greet will not send.")
        if not tt_ok:
            LOG.warning("TT.fm join not confirmed — bot may not show as visible.")

    # Keep process alive; drain TT.fm events as needed
    stop = asyncio.Event()

    def _sig(*_):
        stop.set()
    for s in (signal.SIGINT, signal.SIGTERM):
        try:
            asyncio.get_running_loop().add_signal_handler(s, _sig)
        except NotImplementedError:
            pass  # Windows

    while not stop.is_set():
        try:
            topic, payload = await asyncio.wait_for(mq.get(), timeout=5.0)
            if topic.startswith("ttfm_"):
                LOG.debug("TTFM evt: %s", topic)
        except asyncio.TimeoutError:
            pass
        except Exception as e:
            LOG.error("Main loop error: %s", e)

    await ttfm.stop()
    await cc.stop()

if __name__ == "__main__":
    asyncio.run(run())


