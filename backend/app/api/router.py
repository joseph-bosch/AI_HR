from fastapi import APIRouter

from app.api.jobs import router as jobs_router
from app.api.candidates import router as candidates_router
from app.api.screening import router as screening_router
from app.api.interviews import router as interviews_router
from app.api.offers import router as offers_router
from app.api.templates import router as templates_router
from app.api.question_sets import router as question_sets_router
from app.api.health import router as health_router
from app.api.chat import router as chat_router
from app.api.pipeline import router as pipeline_router
from app.api.decisions import router as decisions_router

api_router = APIRouter()

api_router.include_router(health_router, tags=["Health"])
api_router.include_router(chat_router, prefix="/chat", tags=["Chat"])
api_router.include_router(jobs_router, prefix="/jobs", tags=["Jobs"])
api_router.include_router(candidates_router, prefix="/candidates", tags=["Candidates"])
api_router.include_router(screening_router, prefix="/screening", tags=["Screening"])
api_router.include_router(interviews_router, prefix="/interviews", tags=["Interviews"])
api_router.include_router(offers_router, prefix="/offers", tags=["Offers"])
api_router.include_router(templates_router, prefix="/templates", tags=["Templates"])
api_router.include_router(question_sets_router, prefix="/question-sets", tags=["Question Sets"])
api_router.include_router(pipeline_router, prefix="/pipeline", tags=["Pipeline"])
api_router.include_router(decisions_router, prefix="/decisions", tags=["Decisions"])
