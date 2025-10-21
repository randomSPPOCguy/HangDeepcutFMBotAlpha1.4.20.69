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

class AIManager:
    def __init__(self):
        self.valid_models = []
        self.client = None
        self.room_context = {}
        
        if AISUITE_AVAILABLE:
            # Set environment variables for aisuite
            from hangfm_bot.config import settings
            
            if settings.openai_api_key:
                os.environ["OPENAI_API_KEY"] = settings.openai_api_key
                self.valid_models.append("openai:gpt-4o-mini")
            if settings.anthropic_api_key:
                os.environ["ANTHROPIC_API_KEY"] = settings.anthropic_api_key
                self.valid_models.append("anthropic:claude-3-5-sonnet-20240620")
            if settings.gemini_api_key:
                os.environ["GEMINI_API_KEY"] = settings.gemini_api_key
                self.valid_models.append("google:gemini-2.0-flash-exp")
            if settings.huggingface_api_key:
                os.environ["HUGGINGFACE_API_KEY"] = settings.huggingface_api_key
                self.valid_models.append("huggingface:meta-llama/Llama-3.2-3B-Instruct")
            
            # Initialize client after setting env vars
            self.client = ai.Client()
                
        logging.info(f"AIManager initialized with models: {self.valid_models}")

    def update_room_context(self, context: dict):
        """Update room context for AI prompts"""
        self.room_context.update(context)
        
    async def generate_response(
        self, 
        message: str, 
        user_role: str = "user", 
        context: Optional[List[Dict]] = None, 
        provider: Optional[str] = None
    ) -> str:
        """
        Generate a response with a selected AI provider, optionally using conversation context.
        """
        if not self.client or not self.valid_models:
            return "AI system not configured."
            
        model = provider if provider else self.valid_models[0]
        
        # Build context-aware system prompt
        system_prompt = f"User role: {user_role}. Respond appropriately."
        if self.room_context:
            if self.room_context.get('currentSong'):
                song = self.room_context['currentSong']
                system_prompt += f"\nCurrent song: {song.get('artistName')} - {song.get('trackName')}"
            if self.room_context.get('currentDJs'):
                djs = ', '.join([dj.get('nickname', 'Unknown') for dj in self.room_context['currentDJs']])
                system_prompt += f"\nCurrent DJs: {djs}"
        
        messages = [{"role": "system", "content": system_prompt}]
        
        if context:
            messages.extend(context)
            
        messages.append({"role": "user", "content": message})
        
        try:
            response = self.client.chat.completions.create(model=model, messages=messages)
            return response.choices[0].message.content
        except Exception as e:
            logging.error(f"AI generation error: {e}")
            return f"Sorry, I encountered an error: {str(e)[:100]}"

