from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    APP_NAME: str = "AI HR System"
    DEBUG: bool = True
    API_PREFIX: str = "/api"

    # Database (MSSQL via ODBC)
    DB_SERVER: str = r"localhost\SQLEXPRESS"
    DB_NAME: str = "AI_HR_DB"
    DB_DRIVER: str = "ODBC Driver 17 for SQL Server"
    DB_TRUSTED_CONNECTION: str = "yes"
    DB_TRUST_SERVER_CERT: str = "yes"

    # Storage
    STORAGE_DIR: str = "./storage"
    RESUME_UPLOAD_DIR: str = "./storage/resumes"
    GENERATED_DIR: str = "./storage/generated"
    MAX_UPLOAD_SIZE_MB: int = 10

    # LLM
    LLM_PROVIDER: str = "ollama"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen2.5:7b-instruct-q4_K_M"
    LLM_TIMEOUT_SECONDS: int = 120
    LLM_MAX_RETRIES: int = 2
    LLM_TEMPERATURE: float = 0.3

    # WhisperX (Audio Transcription)
    WHISPER_MODEL_SIZE: str = "large-v2"
    HF_TOKEN: str = ""

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]


settings = Settings()
