"""应用配置"""
import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # 日志级别
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    # Judge LLM 配置（fallback，优先从 DB ModelConfig 读取）
    JUDGE_LLM_BASE_URL: str = os.getenv("JUDGE_LLM_BASE_URL", "")
    JUDGE_LLM_API_KEY: str = os.getenv("JUDGE_LLM_API_KEY", "")
    JUDGE_LLM_MODEL: str = os.getenv("JUDGE_LLM_MODEL", "")
    # Ingest API 认证密钥
    INGEST_API_KEY: str = os.getenv("INGEST_API_KEY", "")
    # CORS 允许的源（逗号分隔）
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "")


settings = Settings()
