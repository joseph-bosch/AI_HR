from fastapi import APIRouter

from app.llm.factory import get_llm_provider

router = APIRouter()


@router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "AI HR System"}


@router.get("/health/llm")
async def llm_health_check():
    provider = get_llm_provider()
    is_healthy = await provider.health_check()
    if is_healthy:
        return {"status": "connected", "provider": "ollama"}
    return {"status": "disconnected", "provider": "ollama"}


@router.get("/config/models")
async def list_models():
    provider = get_llm_provider()
    if hasattr(provider, "list_models"):
        models = await provider.list_models()
        return {"models": models}
    return {"models": []}
