import asyncio
from pathlib import Path
from typing import Any, Dict

import pytest

import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from hangfm_bot.connection.cometchat_socket import CometChatSocketClient

SUCCESS_PAYLOADS = [
    ({"type": "auth", "body": {"status": "success"}}, "type=auth"),
    ({"type": "authSuccess"}, "type=authSuccess"),
    ({"body": {"code": "200"}}, "body.code=200"),
    ({"body": {"success": True}}, "body.success=True"),
    ({"status": "success"}, "status=success"),
    ({"code": "200"}, "code=200"),
]


def _run_in_loop(fn: Any, *args: Any, **kwargs: Dict[str, Any]):
    try:
        old_loop = asyncio.get_event_loop()
    except RuntimeError:
        old_loop = None

    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        return fn(loop, *args, **kwargs)
    finally:
        asyncio.set_event_loop(old_loop)
        loop.close()


@pytest.mark.parametrize("payload,_", SUCCESS_PAYLOADS)
def test_handle_auth_payload_sets_event(payload, _):
    def run(loop: asyncio.AbstractEventLoop, payload):
        client = CometChatSocketClient()
        client._authed.clear()

        assert client._handle_auth_payload(payload) is True
        assert client._authed.is_set() is True

    _run_in_loop(run, payload)


@pytest.mark.parametrize("payload,_", SUCCESS_PAYLOADS)
def test_wait_authed_completes_after_success(payload, _):
    def run(loop: asyncio.AbstractEventLoop, payload):
        client = CometChatSocketClient()
        client._authed.clear()

        client._handle_auth_payload(payload)

        result = loop.run_until_complete(client.wait_authed(timeout=0.1))
        assert result is True

    _run_in_loop(run, payload)
