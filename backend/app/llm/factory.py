from app.config import settings
from app.llm.base import LLMProvider
from app.llm.ollama_provider import OllamaProvider


_provider: LLMProvider | None = None


def get_llm_provider() -> LLMProvider:
    global _provider
    if _provider is None:
        if settings.LLM_PROVIDER == "ollama":
            _provider = OllamaProvider(
                base_url=settings.OLLAMA_BASE_URL,
                model=settings.OLLAMA_MODEL,
                timeout=settings.LLM_TIMEOUT_SECONDS,
                max_retries=settings.LLM_MAX_RETRIES,
            )
        else:
            raise ValueError(f"Unknown LLM provider: {settings.LLM_PROVIDER}")
    return _provider
