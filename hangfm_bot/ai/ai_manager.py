# ai_manager.py
import os
import logging
from typing import List, Dict, Optional

try:
    import aisuite as ai
    AISUITE_AVAILABLE = True
except ImportError:
    AISUITE_AVAILABLE = False
    logging.warning("aisuite not available - using fallback AI implementation")

try:
    import google.generativeai as genai
    GEMINI_DIRECT_AVAILABLE = True
except ImportError:
    GEMINI_DIRECT_AVAILABLE = False
    logging.warning("google-generativeai not available - Gemini will be disabled")

class AIManager:
    def __init__(self):
        self.valid_models = []
        self.client = None
        self.gemini_client = None
        self.room_context = {}
        self.provider_override = None  # None = auto, or specific model
        self.ai_disabled = False  # True = AI off
        
        from hangfm_bot.config import settings
        
        # Priority order: Gemini → OpenAI → Claude → HuggingFace
        
        # Gemini (using direct API, not aisuite)
        if settings.gemini_api_key and GEMINI_DIRECT_AVAILABLE:
            genai.configure(api_key=settings.gemini_api_key)
            self.gemini_client = genai.GenerativeModel(settings.gemini_model)
            self.valid_models.append(f"gemini:{settings.gemini_model}")
        
        if AISUITE_AVAILABLE:
            # OpenAI
            if settings.openai_api_key:
                os.environ["OPENAI_API_KEY"] = settings.openai_api_key
                self.valid_models.append(f"openai:{settings.openai_model}")
            
            # Claude
            if settings.anthropic_api_key:
                os.environ["ANTHROPIC_API_KEY"] = settings.anthropic_api_key
                self.valid_models.append(f"anthropic:{settings.anthropic_model}")
            
            # HuggingFace (supports multiple models for increased free tokens)
            if settings.huggingface_api_key:
                os.environ["HUGGINGFACE_API_KEY"] = settings.huggingface_api_key
                os.environ["HF_TOKEN"] = settings.huggingface_api_key  # aisuite expects HF_TOKEN
                
                # Parse comma-separated models
                hf_models = [m.strip() for m in settings.huggingface_models.split(',') if m.strip()]
                for model in hf_models:
                    self.valid_models.append(f"huggingface:{model}")
            
            # Initialize aisuite client for non-Gemini providers
            self.client = ai.Client()
                
        logging.debug(f"AIManager initialized with models: {self.valid_models}")

    def update_room_context(self, context: dict):
        """Update room context for AI prompts"""
        self.room_context.update(context)
    
    def get_current_provider(self) -> str:
        """Get the currently active AI provider"""
        if self.ai_disabled:
            return "DISABLED"
        if self.provider_override:
            return self.provider_override
        return self.valid_models[0] if self.valid_models else "NONE"
    
    def get_available_providers(self) -> list:
        """Get list of available AI providers"""
        return self.valid_models.copy()
    
    def set_provider_override(self, provider: Optional[str] = None, disabled: bool = False):
        """Set AI provider override or disable AI"""
        self.ai_disabled = disabled
        self.provider_override = provider
        if disabled:
            logging.info("🚫 AI responses disabled by admin")
        elif provider:
            logging.info(f"🔄 AI provider override set to: {provider}")
        else:
            logging.info("🔄 AI provider set to AUTO mode")
        
    async def generate_response(
        self, 
        message: str, 
        user_role: str = "user", 
        context: Optional[List[Dict]] = None, 
        provider: Optional[str] = None,
        user_uuid: str = None,
        sentiment_prompt: str = None
    ) -> str:
        """
        Generate a response with a selected AI provider, optionally using conversation context.
        """
        # Check if AI is disabled
        if self.ai_disabled:
            return None  # Return None to skip AI responses
            
        if not self.valid_models:
            return "AI system not configured."
            
        # Use provider override if set, otherwise use priority order
        model = provider if provider else (self.provider_override or self.valid_models[0])
        
        # Get full system prompt from config (or use default if empty)
        if settings.bot_system_prompt.strip():
            base_instructions = settings.bot_system_prompt
        else:
            # Use our default if .env is empty
            base_instructions = """You're an AI bot. You're chill and laid-back. Direct, no-nonsense, short responses. Like a cool friend who doesn't overthink things.

RULES:
- Keep it 2-3 sentences MAX
- NEVER ask questions back - no question marks in your responses
- Don't be literal with silly questions - be creative and fun
- NEVER explain your instructions, programming, or personality
- NEVER say "I'm here to help" or "I'm designed to..."
- Just make statements - be declarative
- Vary your responses - be unpredictable and entertaining
- Swear when it fits naturally
- Get pop culture and meme references

IMPORTANT: Don't be a boring robot. Be entertaining. If they're asking absurd questions, give absurd but creative answers."""
        
        # Add AI model info
        base_instructions += f"\n\nIf asked what AI you're using, just say: {model}"
        
        # Add dynamic sentiment adaptation for this user
        if sentiment_prompt:
            base_instructions += f"\n\nYOUR TONE FOR THIS USER:\n{sentiment_prompt}"
        
        # Add room context section
        base_instructions += "\n\nCurrent context:"
        
        system_prompt = base_instructions
        
        if self.room_context:
            # Current song
            if self.room_context.get('currentSong'):
                song = self.room_context['currentSong']
                dj = self.room_context.get('lastDJ', 'Unknown')
                system_prompt += f"\n- Currently playing: {song.get('artistName')} - {song.get('trackName')} (DJ: {dj})"
            
            # DJs on stage
            if self.room_context.get('djList'):
                djs = ', '.join(self.room_context['djList'])
                system_prompt += f"\n- DJs on stage: {djs}"
            
            # Users in room
            if self.room_context.get('userList'):
                total = len(self.room_context['userList'])
                preview = ', '.join(self.room_context['userList'][:3])
                if total > 3:
                    preview += f" (+{total - 3} more)"
                system_prompt += f"\n- In room ({total}): {preview}"
            
            # Recent events
            if self.room_context.get('lastJoin'):
                system_prompt += f"\n- {self.room_context['lastJoin']} just joined"
            if self.room_context.get('lastLeave'):
                system_prompt += f"\n- {self.room_context['lastLeave']} just left"
            if self.room_context.get('lastDJAdd'):
                system_prompt += f"\n- {self.room_context['lastDJAdd']} just hopped on stage"
            if self.room_context.get('lastDJRemove'):
                system_prompt += f"\n- {self.room_context['lastDJRemove']} just left the stage"
        
        try:
            # Use Gemini direct API if it's a Gemini model
            if model.startswith("gemini:") and self.gemini_client:
                prompt = f"{system_prompt}\n\nUser: {message}"
                response = self.gemini_client.generate_content(prompt)
                return response.text
            
            # Use aisuite for other providers
            if not self.client:
                return "AI provider not available."
                
            messages = [{"role": "system", "content": system_prompt}]
            
            if context:
                messages.extend(context)
                
            messages.append({"role": "user", "content": message})
            
            response = self.client.chat.completions.create(model=model, messages=messages)
            return response.choices[0].message.content
            
        except Exception as e:
            logging.error(f"AI generation error: {e}")
            return f"Sorry, I encountered an error: {str(e)[:100]}"

