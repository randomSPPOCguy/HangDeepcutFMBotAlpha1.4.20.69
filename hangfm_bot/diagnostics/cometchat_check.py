# hangfm_bot/diagnostics/cometchat_check.py
# Lightweight runtime sanity check to catch the "UID self does not exist" class of issues early
# - Verifies that COMETCHAT_AUTH (JWT) appears to belong to COMETCHAT_UID
# - Pure decode only (no verification, no network calls)
# - Safe to import in main before connecting to CometChat

from __future__ import annotations

import base64
import json
import logging
from typing import Optional

from hangfm_bot.config import settings

LOG = logging.getLogger("diag.cometchat")


def _b64url_decode(data: str) -> bytes:
    pad = '=' * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def decode_jwt_unverified(token: str) -> Optional[dict]:
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return None
        payload = json.loads(_b64url_decode(parts[1]).decode("utf-8", errors="replace"))
        return payload
    except Exception:
        return None


def run_cometchat_uid_auth_sanity_check() -> None:
    """
    Checks whether COMETCHAT_AUTH seems to match COMETCHAT_UID.
    Logs clear, actionable warnings (does not raise by default).
    """
    uid = settings.cometchat_uid
    tok = settings.cometchat_auth

    if not uid or not tok:
        LOG.warning("CometChat UID/Auth not fully configured (COMETCHAT_UID or COMETCHAT_AUTH missing)")
        return

    payload = decode_jwt_unverified(tok)
    if payload is None:
        LOG.warning("COMETCHAT_AUTH does not look like a JWT; ensure it matches the user '%s'", uid)
        return

    # Try common claim names used by various gateways
    claimed_uid = (
        payload.get("uid")
        or payload.get("user")
        or payload.get("userId")
        or payload.get("sub")
    )

    if claimed_uid and str(claimed_uid) != str(uid):
        LOG.error(
            "COMETCHAT_AUTH appears to belong to '%s' but COMETCHAT_UID is '%s'. "
            "Obtain a new auth token for the correct UID or update COMETCHAT_UID to match.",
            claimed_uid,
            uid,
        )
    else:
        LOG.info("CometChat UID/Auth sanity check passed (uid=%s)", uid)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(name)s | %(levelname)s | %(message)s")
    run_cometchat_uid_auth_sanity_check()
