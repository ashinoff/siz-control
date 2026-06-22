"""Application settings loaded from environment variables / .env file."""
import os
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database — must be set via environment variable or .env file.
    # Example: DATABASE_URL=postgresql://user:pass@host:5432/dbname
    DATABASE_URL: str

    # Security
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION_use_a_long_random_string"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12  # 12 hours
    ALGORITHM: str = "HS256"

    # First administrator, created on seed if it does not exist yet.
    ADMIN_LOGIN: str = "admin"
    ADMIN_PASSWORD: str = "admin123"
    ADMIN_FULL_NAME: str = "Администратор системы"

    # CORS — comma separated list of allowed origins for the frontend.
    # Example: CORS_ORIGINS=https://my-app.amvera.io,http://localhost:5173
    CORS_ORIGINS: str

    # Where uploaded files are stored. Note: on Render the filesystem is
    # ephemeral, so for permanent storage use an external bucket (S3/Supabase).
    UPLOAD_DIR: str = "./uploads"

    @property
    def cors_origins_list(self) -> List[str]:
        if self.CORS_ORIGINS.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def normalized_database_url(self) -> str:
        """Render/Heroku sometimes provide 'postgres://' which SQLAlchemy needs
        as 'postgresql+psycopg://'. Normalize it here."""
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+psycopg://", 1)
        elif url.startswith("postgresql://") and "+psycopg" not in url:
            url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url

    @property
    def is_sqlite(self) -> bool:
        return self.normalized_database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
