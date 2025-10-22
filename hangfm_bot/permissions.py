# hangfm_bot/permissions.py
import json
import logging
from pathlib import Path
from typing import Dict, Set

LOG = logging.getLogger("permissions")

PERMISSIONS_FILE = Path("permissions.json")

class PermissionsManager:
    """
    Manages co-owner and moderator permissions with persistent storage.
    Saves both UUIDs and usernames for easy reference.
    """
    def __init__(self):
        self.coowners: Dict[str, str] = {}  # uuid -> username
        self.moderators: Dict[str, str] = {}  # uuid -> username
        self._load()
    
    def _load(self):
        """Load permissions from file"""
        if PERMISSIONS_FILE.exists():
            try:
                with PERMISSIONS_FILE.open("r", encoding="utf-8") as f:
                    data = json.load(f)
                self.coowners = data.get("coowners", {})
                self.moderators = data.get("moderators", {})
                LOG.info(f"💾 Loaded permissions: {len(self.coowners)} co-owners, {len(self.moderators)} moderators")
            except Exception as e:
                LOG.warning(f"Failed to load permissions: {e}")
                self.coowners = {}
                self.moderators = {}
        else:
            LOG.info("📝 No permissions file found - starting fresh")
    
    def _save(self):
        """Save permissions to file"""
        try:
            with PERMISSIONS_FILE.open("w", encoding="utf-8") as f:
                json.dump({
                    "coowners": self.coowners,
                    "moderators": self.moderators
                }, f, indent=2)
            LOG.debug("💾 Permissions saved")
        except Exception as e:
            LOG.error(f"Failed to save permissions: {e}")
    
    def add_coowner(self, uuid: str, username: str):
        """Add a co-owner"""
        self.coowners[uuid] = username
        self._save()
        LOG.info(f"👑 Added co-owner: {username} ({uuid})")
    
    def add_moderator(self, uuid: str, username: str):
        """Add a moderator"""
        self.moderators[uuid] = username
        self._save()
        LOG.info(f"🔨 Added moderator: {username} ({uuid})")
    
    def remove_coowner(self, uuid: str):
        """Remove a co-owner"""
        username = self.coowners.pop(uuid, "Unknown")
        self._save()
        LOG.info(f"❌ Removed co-owner: {username} ({uuid})")
    
    def remove_moderator(self, uuid: str):
        """Remove a moderator"""
        username = self.moderators.pop(uuid, "Unknown")
        self._save()
        LOG.info(f"❌ Removed moderator: {username} ({uuid})")
    
    def is_coowner(self, uuid: str) -> bool:
        """Check if UUID is a co-owner"""
        return uuid in self.coowners
    
    def is_moderator(self, uuid: str) -> bool:
        """Check if UUID is a moderator"""
        return uuid in self.moderators
    
    def get_coowner_uuids(self) -> Set[str]:
        """Get all co-owner UUIDs"""
        return set(self.coowners.keys())
    
    def get_moderator_uuids(self) -> Set[str]:
        """Get all moderator UUIDs"""
        return set(self.moderators.keys())
    
    def list_all(self) -> str:
        """Get formatted list of all permissions"""
        output = "🛡️ Permissions\n\n"
        
        if self.coowners:
            output += "👑 Co-Owners:\n"
            for uuid, username in self.coowners.items():
                output += f"  • {username}\n    {uuid}\n"
        else:
            output += "👑 Co-Owners: None\n"
        
        output += "\n"
        
        if self.moderators:
            output += "🔨 Moderators:\n"
            for uuid, username in self.moderators.items():
                output += f"  • {username}\n    {uuid}\n"
        else:
            output += "🔨 Moderators: None\n"
        
        return output

