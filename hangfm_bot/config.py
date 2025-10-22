# config.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Room/socket parameters
    ttfm_socket_base_url: str = "https://socket.prod.tt.fm"
    ttfm_api_token: str
    room_uuid: str
    bot_name: str = "BOT"
    
    # Discogs public api
    discogs_user_token: str
    discogs_user_agent: str = 'HangFmBot/1.0'
    
    # Spotify public API
    spotify_client_id: str
    spotify_client_secret: str
    
    # CometChat
    cometchat_appid: str
    cometchat_api_key: str
    cometchat_region: str = "us"
    cometchat_uid: str
    cometchat_auth: str
    
    # AI Providers
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-3-5-sonnet-20241022"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    huggingface_api_key: str | None = None
    huggingface_models: str = "mistralai/Mistral-7B-Instruct-v0.3"  # Comma-separated for multiple models
    
    # Music Discovery
    music_year_start: int = 1950
    music_year_end: int = 2025
    recently_played_limit: int = 50
    
    # Permissions (comma-separated UUIDs)
    coowner_uuids: str = ""
    moderator_uuids: str = ""
    
    # Bot AI System Prompt (full customizable prompt from .env)
    bot_system_prompt: str = ""  # If empty, uses default in ai_manager.py
    
    # Misc
    log_level: str = "INFO"
    allow_debug: bool = False
    send_rate_per_sec: int = 2
    http_poll_interval_ms: int = 1000

    model_config = SettingsConfigDict(env_file='.env', case_sensitive=False)

settings = Settings()

