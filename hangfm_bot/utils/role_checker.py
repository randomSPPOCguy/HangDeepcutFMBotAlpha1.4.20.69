# role_checker.py
from typing import Dict, Set
import logging

class RoleChecker:
    """
    Implements RBAC policy mapping user roles to permissions.
    Works with PermissionsManager for persistent UUID storage.
    """
    def __init__(self, permissions_manager):
        self.permissions_manager = permissions_manager
        
        # Role-to-permission mapping (higher roles inherit lower role permissions)
        self.role_to_permissions: Dict[str, Set[str]] = {
            "admin": {"ban", "kick", "add_dj", "remove_dj", "track", "queue", "discover", "ai", "debug", "adminhelp", "uptime", "help", "stats", "commands", "room", "gitlink", "ty", "addcoowner", "addmod", "removecoowner", "removemod", "listperms", "myuuid"},
            "moderator": {"kick", "add_dj", "remove_dj", "track", "queue", "discover", "adminhelp", "uptime", "help", "stats", "commands", "room", "gitlink", "ty", "myuuid"},
            "coowner": {"add_dj", "remove_dj", "track", "queue", "discover", "ai", "grant", "adminhelp", "uptime", "help", "stats", "commands", "room", "gitlink", "ty", "addcoowner", "addmod", "removecoowner", "removemod", "listperms", "myuuid"},
            "dj": {"add_dj", "remove_dj", "queue", "discover", "uptime", "help", "stats", "commands", "room", "gitlink", "ty", "myuuid"},
            "user": {"queue", "discover", "help", "stats", "commands", "uptime", "room", "gitlink", "ty", "myuuid"},
        }
        
        logging.debug(f"RoleChecker initialized with {len(self.permissions_manager.get_coowner_uuids())} co-owners, {len(self.permissions_manager.get_moderator_uuids())} moderators")

    def get_user_role(self, user_uuid: str) -> str:
        """Determine user role based on UUID"""
        if self.permissions_manager.is_coowner(user_uuid):
            return "coowner"
        elif self.permissions_manager.is_moderator(user_uuid):
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

