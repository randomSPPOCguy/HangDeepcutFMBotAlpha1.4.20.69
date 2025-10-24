#!/usr/bin/env python3
from __future__ import annotations
from typing import Optional

from dotenv import load_dotenv
# Load both files; do not override explicit env already set by the shell
load_dotenv("hang-fm-config.env")
load_dotenv()

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Core
    room_uuid: Optional[str] = Field(default=None, validation_alias="ROOM_UUID")
    log_level: str = Field(default="INFO", validation_alias="LOG_LEVEL")

    # TT.fm / Primus
    ttfm_socket_base_url: Optional[str] = Field(default=None, validation_alias="TTFM_PRIMUS_URL")
    ttfm_auth_token: Optional[str] = Field(default=None, validation_alias="TTFM_AUTH_TOKEN")

    # CometChat
    cometchat_appid: Optional[str] = Field(default=None, validation_alias="COMETCHAT_APPID")
    cometchat_region: Optional[str] = Field(default="us", validation_alias="COMETCHAT_REGION")
    cometchat_uid: Optional[str] = Field(default=None, validation_alias="COMETCHAT_UID")
    cometchat_auth: Optional[str] = Field(default=None, validation_alias="COMETCHAT_AUTH")

    # Boot greet
    boot_greet: bool = Field(default=True, validation_alias="BOOT_GREET")
    boot_greet_message: Optional[str] = Field(default=None, validation_alias="BOOT_GREET_MESSAGE")

    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

settings = Settings()



