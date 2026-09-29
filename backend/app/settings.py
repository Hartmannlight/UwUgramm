from functools import lru_cache
from urllib.parse import urlparse

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    environment: str = "development"
    app_origin: str = "http://127.0.0.1:5193"
    database_url: str = "postgresql+psycopg://uwugramm:uwugramm@localhost:5432/uwugramm"
    secret_key: str = "development-only-change-before-production"
    identity_key: str = "development-identity-change-before-production"
    google_client_id: str = ""
    google_client_secret: str = ""

    @model_validator(mode="after")
    def production_checks(self):
        parsed = urlparse(self.app_origin)
        if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
            raise ValueError("APP_ORIGIN muss eine reine Origin sein.")
        self.app_origin = self.app_origin.rstrip("/")
        if self.production:
            if parsed.scheme != "https" or not parsed.hostname:
                raise ValueError("In Produktion ist eine HTTPS-Origin erforderlich.")
            for secret in (self.secret_key, self.identity_key):
                if len(secret) < 32 or secret.startswith(("development", "replace-")):
                    raise ValueError("Setze unabhängige zufällige Schlüssel mit mindestens 32 Zeichen.")
            if self.secret_key == self.identity_key:
                raise ValueError("SECRET_KEY und IDENTITY_KEY müssen verschieden sein.")
        return self

    @property
    def production(self):
        return self.environment == "production"

    @property
    def cookie_name(self):
        return "__Host-uwu-session" if self.production else "uwu-session"


@lru_cache
def settings():
    return Settings()
