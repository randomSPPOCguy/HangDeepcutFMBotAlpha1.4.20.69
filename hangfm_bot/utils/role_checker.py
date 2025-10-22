# role_checker.py
from typing import Dict, Set
import logging
from hangfm_bot.config import settings

class RoleChecker:
    """
    Implements RBAC policy mapping user roles to permissions.
    """
    def __init__(self):
        # Role-to-permission mapping (higher roles inherit lower role permissions)
        self.role_to_permissions: Dict[str, Set[str]] = {
            "admin": {"ban", "kick", "add_dj", "remove_dj", "track", "queue", "discover", "ai", "debug", "adminhelp", "uptime", "help", "stats", "commands", "room", "gitlink", "ty"},
            "moderator": {"kick", "add_dj", "remove_dj", "track", "queue", "discover", "adminhelp", "uptime", "help", "stats", "commands", "room", "gitlink", "ty"},
            "coowner": {"add_dj", "remove_dj", "track", "queue", "discover", "ai", "grant", "adminhelp", "uptime", "help", "stats", "commands", "room", "gitlink", "ty"},
            "dj": {"add_dj", "remove_dj", "queue", "discover", "uptime", "help", "stats", "commands", "room", "gitlink", "ty"},
            "user": {"queue", "discover", "help", "stats", "commands", "uptime", "room", "gitlink", "ty"},
        }
        
        # Load co-owner UUIDs from .env
        self.coowner_uuids = set(
            uuid.strip() 
            for uuid in settings.coowner_uuids.split(',') 
            if uuid.strip()
        )
        
        # Load moderator UUIDs from .env
        self.moderator_uuids = set(
            uuid.strip() 
            for uuid in settings.moderator_uuids.split(',') 
            if uuid.strip()
        )
        
        logging.debug(f"RoleChecker initialized with {len(self.coowner_uuids)} co-owners, {len(self.moderator_uuids)} moderators")

    def get_user_role(self, user_uuid: str) -> str:
        """Determine user role based on UUID"""
        if user_uuid in self.coowner_uuids:
            return "coowner"
        elif user_uuid in self.moderator_uuids:
            return "moderator"
        else:
            return "user"

    def has_permission(self, user_role: str, permission: str) -> bool:
        """Check if a role has a specific permission"""
        allowed = self.role_to_permissions.get(user_role.lower(), set())
        return permission.lower() in allowed
    
    def is_admin(self, user_uuid: str) -> bool:
        """Check if user is admin (co-owner or moderator)"""
        return user_uuid in self.coowner_uuids or user_uuid in self.moderator_uuids

