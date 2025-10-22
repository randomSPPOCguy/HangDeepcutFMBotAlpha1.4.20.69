# command_handler.py
import re
import logging
from typing import Callable, Optional, Dict
from hangfm_bot.utils.role_checker import RoleChecker

class CommandHandler:
    def __init__(self, role_checker: RoleChecker):
        self.role_checker = role_checker
        # Match commands: /cmd (public), /.cmd (admin), !cmd, .cmd
        self.command_pattern = re.compile(r'^([/!]\.?|\./)(\w+)(?:\s+(.*))?$')
        self.handlers: Dict[str, Callable] = {}
        logging.debug("CommandHandler initialized")

    def register(self, command: str, handler: Callable):
        """Register a command handler"""
        self.handlers[command.lower()] = handler
        logging.debug(f"Registered command: {command}")

    async def handle_message(self, user_uuid: str, message: str, user_nickname: str = "Unknown") -> Optional[str]:
        """Parse and handle command from message (case-insensitive)"""
        # Parse command with support for /.prefix
        match = self.command_pattern.match(message.strip())
        if not match:
            return None
            
        prefix = match.group(1)  # /, /., !, or .
        command = match.group(2).lower()  # command name
        argline = match.group(3) or ""  # arguments
        user_role = self.role_checker.get_user_role(user_uuid)
        
        # Check permission
        if not self.role_checker.has_permission(user_role, command):
            logging.warning(f"User {user_nickname} ({user_role}) denied access to /{command}")
            return f"❌ You don't have permission to use /{command}"
        
        # Get and execute handler
        handler = self.handlers.get(command)
        if handler:
            try:
                logging.info(f"Executing /{command} for {user_nickname}")
                return await handler(user_uuid, argline, user_nickname)
            except Exception as e:
                logging.error(f"Command handler error for /{command}: {e}")
                return f"❌ Command error: {str(e)[:100]}"
        else:
            return f"❓ Unknown command: /{command}. Type /help for available commands."

