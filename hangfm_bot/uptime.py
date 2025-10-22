# hangfm_bot/uptime.py
import json
import logging
import os
import time
from pathlib import Path
from typing import Tuple

LOG = logging.getLogger("uptime")

STATE_FILE = Path(os.getenv("UPTIME_STATE_FILE", "uptime_state.json"))

class UptimeManager:
    """
    Tracks current run start (resets on process restart) and accumulates lifetime.
    Lifetime is stored in uptime_state.json and persists across restarts.
    """
    def __init__(self):
        self.start_ts = time.time()
        self._load_state()

    def _load_state(self):
        self.total_seconds_before = 0.0
        self.first_seen = None
        try:
            if STATE_FILE.exists():
                with STATE_FILE.open("r", encoding="utf-8") as f:
                    data = json.load(f)
                self.total_seconds_before = float(data.get("total_seconds", 0.0))
                self.first_seen = float(data.get("first_seen")) if data.get("first_seen") else None
                if self.total_seconds_before > 0:
                    LOG.info(f"💾 Loaded uptime state: {self.total_seconds_before:.0f}s lifetime")
            else:
                # initialize file with first_seen now
                self.first_seen = time.time()
                self._save_state()
                LOG.info("📝 Created new uptime state file")
        except Exception as exc:
            LOG.warning("Failed to load uptime state, starting fresh: %s", exc)
            self.total_seconds_before = 0.0
            self.first_seen = time.time()
            self._save_state()

    def _save_state(self):
        try:
            STATE_FILE.write_text(
                json.dumps({
                    "total_seconds": self.total_seconds_before,
                    "first_seen": self.first_seen
                }),
                encoding="utf-8"
            )
        except Exception as exc:
            LOG.warning("Failed to save uptime state: %s", exc)

    def get_current_uptime(self) -> float:
        return time.time() - self.start_ts

    def get_lifetime_seconds(self) -> float:
        return self.total_seconds_before + self.get_current_uptime()

    def format_duration(self, seconds: float) -> str:
        seconds = int(round(seconds))
        days, rem = divmod(seconds, 86400)
        hours, rem = divmod(rem, 3600)
        minutes, secs = divmod(rem, 60)
        parts = []
        if days:
            parts.append(f"{days}d")
        if hours or days:
            parts.append(f"{hours}h")
        if minutes or hours or days:
            parts.append(f"{minutes}m")
        parts.append(f"{secs}s")
        return " ".join(parts)

    def get_uptime_strings(self) -> Tuple[str, str]:
        current = self.get_current_uptime()
        lifetime = self.get_lifetime_seconds()
        return self.format_duration(current), self.format_duration(lifetime)

    def record_shutdown(self):
        """
        Add current run duration to persistent lifetime and save.
        Call this just before process exits to persist accumulated lifetime.
        """
        try:
            run_seconds = self.get_current_uptime()
            self.total_seconds_before += run_seconds
            if not self.first_seen:
                self.first_seen = time.time() - run_seconds
            self._save_state()
            LOG.info(f"💾 Uptime saved: {run_seconds:.0f}s this session, {self.total_seconds_before:.0f}s lifetime")
        except Exception as exc:
            LOG.warning("Failed to record shutdown uptime: %s", exc)
    
    def save_periodic(self):
        """Periodically save current uptime to prevent data loss"""
        try:
            current_total = self.total_seconds_before + self.get_current_uptime()
            STATE_FILE.write_text(
                json.dumps({
                    "total_seconds": current_total,
                    "first_seen": self.first_seen
                }),
                encoding="utf-8"
            )
        except Exception as exc:
            LOG.debug(f"Periodic save failed: {exc}")

