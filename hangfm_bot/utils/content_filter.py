# content_filter.py
import logging

try:
    from better_profanity import profanity
    PROFANITY_FILTER_AVAILABLE = True
    profanity.load_censor_words()
except ImportError:
    PROFANITY_FILTER_AVAILABLE = False
    logging.warning("better-profanity not available - content filtering disabled")

class ContentFilter:
    def __init__(self, languages=('en',)):
        self.enabled = PROFANITY_FILTER_AVAILABLE
        if self.enabled:
            logging.info("ContentFilter initialized with better-profanity")
        else:
            logging.warning("ContentFilter initialized WITHOUT profanity detection")

    def is_clean(self, text: str) -> bool:
        """Check if text is clean (no profanity)"""
        if not self.enabled or not text:
            return True
        return not profanity.contains_profanity(text)

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

