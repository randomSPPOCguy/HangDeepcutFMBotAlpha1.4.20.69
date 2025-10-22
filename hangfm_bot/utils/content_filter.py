# content_filter.py
import logging

class ContentFilter:
    def __init__(self, languages=('en',)):
        # Permissive filter - only block empty/invalid messages
        # Let AI providers handle tone/content moderation naturally
        self.enabled = True
        logging.debug("ContentFilter initialized (permissive mode - swearing allowed)")

    def is_clean(self, text: str) -> bool:
        """Check if text is valid (not empty/spam)"""
        # Only reject empty or invalid messages
        # Swear words are allowed - let AI handle tone
        if not text or not isinstance(text, str):
            return False
        return len(text.strip()) > 0

    def censor(self, text: str) -> str:
        """Censor profanity in text"""
        if not self.enabled or not text:
            return text
        return profanity.censor(text)
    
    @staticmethod
    def is_allowed(text: str) -> bool:
        """Static method for basic validation (from original JS)"""
        if not text or not isinstance(text, str):
            return False
        return len(text.strip()) > 0

