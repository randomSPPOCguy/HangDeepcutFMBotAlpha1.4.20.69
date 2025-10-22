# user_memory.py
import json
import logging
from typing import Dict, List
from datetime import datetime
from pathlib import Path

LOG = logging.getLogger(__name__)

class UserMemory:
    """Track user sentiment and conversation history (like OG bot)"""
    
    def __init__(self, data_file: str = "user_memory.json"):
        self.data_file = Path(data_file)
        self.users: Dict[str, dict] = {}
        self._load()
        LOG.debug(f"UserMemory initialized with {len(self.users)} users")
    
    def _load(self):
        """Load user memory from file"""
        if self.data_file.exists():
            try:
                with open(self.data_file, 'r') as f:
                    self.users = json.load(f)
                LOG.info(f"Loaded memory for {len(self.users)} users")
            except Exception as e:
                LOG.error(f"Failed to load user memory: {e}")
                self.users = {}
    
    def _save(self):
        """Save user memory to file"""
        try:
            with open(self.data_file, 'w') as f:
                json.dump(self.users, f, indent=2)
        except Exception as e:
            LOG.error(f"Failed to save user memory: {e}")
    
    def get_user_data(self, user_uuid: str, user_name: str = "Unknown") -> dict:
        """Get or create user data"""
        if user_uuid not in self.users:
            self.users[user_uuid] = {
                "name": user_name,
                "sentiment": "neutral",  # neutral, positive, negative
                "interactions": 0,
                "first_seen": datetime.now().isoformat(),
                "last_seen": datetime.now().isoformat(),
                "context": []  # Recent conversation history
            }
            self._save()
        else:
            # Update last seen and name
            self.users[user_uuid]["last_seen"] = datetime.now().isoformat()
            self.users[user_uuid]["name"] = user_name
        
        return self.users[user_uuid]
    
    def update_sentiment(self, user_uuid: str, message: str):
        """Update user sentiment based on their message (simple heuristic)"""
        user_data = self.get_user_data(user_uuid)
        user_data["interactions"] += 1
        
        # Simple sentiment detection (like OG bot)
        negative_words = ['fuck you', 'bitch', 'stupid', 'dumb', 'idiot', 'shut up', 'useless']
        positive_words = ['thanks', 'thank you', 'cool', 'nice', 'awesome', 'great', 'good']
        
        msg_lower = message.lower()
        
        # Check for negative sentiment
        if any(word in msg_lower for word in negative_words):
            if user_data["sentiment"] == "positive":
                user_data["sentiment"] = "neutral"
            else:
                user_data["sentiment"] = "negative"
        # Check for positive sentiment
        elif any(word in msg_lower for word in positive_words):
            if user_data["sentiment"] == "negative":
                user_data["sentiment"] = "neutral"
            else:
                user_data["sentiment"] = "positive"
        # Otherwise, drift towards neutral
        else:
            if user_data["interactions"] > 5:
                user_data["sentiment"] = "neutral"
        
        self._save()
        return user_data["sentiment"]
    
    def add_to_context(self, user_uuid: str, role: str, content: str):
        """Add message to user's conversation context"""
        user_data = self.get_user_data(user_uuid)
        user_data["context"].append({
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })
        
        # Keep only last 10 messages
        if len(user_data["context"]) > 10:
            user_data["context"] = user_data["context"][-10:]
        
        self._save()
    
    def get_context(self, user_uuid: str, limit: int = 5) -> List[dict]:
        """Get recent conversation context for user"""
        user_data = self.get_user_data(user_uuid)
        recent = user_data["context"][-limit:] if user_data["context"] else []
        # Return in format expected by AI providers
        return [{"role": msg["role"], "content": msg["content"]} for msg in recent]
    
    def get_sentiment(self, user_uuid: str) -> str:
        """Get user's current sentiment"""
        user_data = self.get_user_data(user_uuid)
        return user_data.get("sentiment", "neutral")
    
    def get_personality_for_user(self, user_uuid: str) -> tuple:
        """Get personality prompt and description based on user sentiment"""
        sentiment = self.get_sentiment(user_uuid)
        
        if sentiment == "positive":
            prompt = "The user's been cool with you. Be friendly and engaging - you can joke around, be more relaxed. Show personality."
            description = "friendly"
        elif sentiment == "negative":
            prompt = "The user's being rude. Roast them back with creative, funny comebacks. Be witty and playful - don't take their insults seriously, flip them into jokes. Use wordplay, absurd humor, or clever responses. Don't be literal or explain things - just be entertaining and sharp. Have fun with it."
            description = "roasting/playful"
        else:  # neutral
            prompt = "The user's neutral. Just be chill and answer naturally. No forced sass, no corporate friendliness. Just be real."
            description = "neutral"
        
        return prompt, description

