# role_checker.py
from typing import Dict, Set
import logging

class RoleChecker:
    """
    Implements RBAC policy mapping user roles to permissions.
    """
    def __init__(self):
        # Role-to-permission mapping
        self.role_to_permissions: Dict[str, Set[str]] = {
            "admin": {"ban", "kick", "add_dj", "remove_dj", "track", "queue", "discover", "ai", "debug", "adminhelp", "uptime"},
            "moderator": {"kick", "add_dj", "remove_dj", "track", "queue", "discover", "ai", "adminhelp", "uptime"},
            "coowner": {"add_dj", "remove_dj", "track", "queue", "discover", "ai", "grant", "adminhelp", "uptime"},
            "dj": {"add_dj", "remove_dj", "queue", "discover", "ai", "uptime"},
            "user": {"queue", "discover", "ai", "help", "stats", "commands", "uptime"},
        }
        
        # Hardcoded co-owner UUIDs (from original RoleChecker.js)
        self.coowner_uuids = {
            "62acab2b-8f82-4c48-9c1a-7b35adf54047",  # sumguy (owner)
            "17093f8c-1315-49cc-b221-21210e672cd8",  # AlohaPJBear
            "5540499c-cb2f-4b67-9981-1f19b3e97810",  # Co-owner
            "5d2648eb-ef18-433c-9b78-5d19ed15ebda",  # Co-owner
        }
        
        # Hardcoded moderator UUIDs
        self.moderator_uuids = {
            "64bbcbb7-d2a1-4e9d-9bed-5c84e189c929",  # Hollang616
        }
        
        logging.info(f"RoleChecker initialized with {len(self.coowner_uuids)} co-owners, {len(self.moderator_uuids)} moderators")

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

