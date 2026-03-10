"""Decision API — final hiring decision reports and salary negotiation chatbot."""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.decision import InterviewDecision
from app.models.pipeline import InterviewPipeline
from app.models.candidate import Candidate
from app.models.job import JobRequisition

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class FinalDecisionRequest(BaseModel):
    final_decision: str  # "hire" | "reject" | "hold"
    decision_reason: str | None = None


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class DecisionChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    language: str = "en"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_decision_by_pipeline(pipeline_id: str, db: AsyncSession) -> InterviewDecision | None:
    result = await db.execute(
        select(InterviewDecision).where(InterviewDecision.pipeline_id == pipeline_id)
    )
    return result.scalar_one_or_none()


def _serialize(decision: InterviewDecision) -> dict:
    return {
        "id": decision.id,
        "pipeline_id": decision.pipeline_id,
        "job_id": decision.job_id,
        "candidate_id": decision.candidate_id,
        "final_decision": decision.final_decision,
        "decision_reason": decision.decision_reason,
        "generated_report": decision.generated_report,
        "generation_model": decision.generation_model,
        "created_at": decision.created_at.isoformat() if decision.created_at else None,
        "updated_at": decision.updated_at.isoformat() if decision.updated_at else None,
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/generate/{pipeline_id}")
async def generate_decision(pipeline_id: str, language: str = "en", db: AsyncSession = Depends(get_db)):
    """Generate (or regenerate) the AI decision report for a pipeline entry."""
    from app.services.decision_service import generate_decision_report
    try:
        decision = await generate_decision_report(pipeline_id, db, language=language)
        return _serialize(decision)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/pipeline/{pipeline_id}")
async def get_decision(pipeline_id: str, db: AsyncSession = Depends(get_db)):
    """Get the existing decision report for a pipeline entry."""
    decision = await _get_decision_by_pipeline(pipeline_id, db)
    if not decision:
        raise HTTPException(status_code=404, detail="No decision report found for this pipeline entry")
    return _serialize(decision)


@router.put("/{decision_id}")
async def set_final_decision(
    decision_id: str,
    data: FinalDecisionRequest,
    db: AsyncSession = Depends(get_db),
):
    """Record the final HR decision (hire / reject / hold) and trigger status updates."""
    if data.final_decision not in ("hire", "reject", "hold"):
        raise HTTPException(status_code=400, detail="final_decision must be 'hire', 'reject', or 'hold'")

    result = await db.execute(
        select(InterviewDecision).where(InterviewDecision.id == decision_id)
    )
    decision = result.scalar_one_or_none()
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    decision.final_decision = data.final_decision
    decision.decision_reason = data.decision_reason

    # Side effects on candidate + pipeline
    pipeline_result = await db.execute(
        select(InterviewPipeline).where(InterviewPipeline.id == decision.pipeline_id)
    )
    pipeline = pipeline_result.scalar_one_or_none()

    candidate_result = await db.execute(
        select(Candidate).where(Candidate.id == decision.candidate_id)
    )
    candidate = candidate_result.scalar_one_or_none()

    if data.final_decision == "hire":
        if candidate:
            candidate.status = "offered"
        if pipeline:
            pipeline.stage_status = "completed"
    elif data.final_decision == "reject":
        if candidate:
            candidate.status = "rejected"
        if pipeline:
            pipeline.stage_status = "rejected"
            pipeline.rejection_reason = data.decision_reason
    # hold: no status change

    await db.flush()
    await db.refresh(decision)
    return _serialize(decision)


@router.post("/{decision_id}/chat/stream")
async def decision_chat_stream(
    decision_id: str,
    data: DecisionChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """SSE endpoint: salary/negotiation chatbot scoped to this decision's context."""
    result = await db.execute(
        select(InterviewDecision).where(InterviewDecision.id == decision_id)
    )
    decision = result.scalar_one_or_none()
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    job_result = await db.execute(
        select(JobRequisition).where(JobRequisition.id == decision.job_id)
    )
    job = job_result.scalar_one_or_none()

    cand_result = await db.execute(
        select(Candidate).where(Candidate.id == decision.candidate_id)
    )
    candidate = cand_result.scalar_one_or_none()
    candidate_name = (
        f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() if candidate else "Candidate"
    )

    from app.services.decision_service import build_salary_chatbot_context
    system_prompt = build_salary_chatbot_context(decision, job, candidate_name)

    async def event_generator():
        try:
            from app.llm.factory import get_llm_provider
            provider = get_llm_provider()
            history = [{"role": m.role, "content": m.content} for m in data.history]

            async for token in provider.generate_stream(
                messages=[*history, {"role": "user", "content": data.message}],
                system_prompt=system_prompt,
                temperature=0.4,
            ):
                yield f"data: {json.dumps({'type': 'token', 'content': token}, ensure_ascii=False)}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as exc:
            logger.error("Decision chat stream error: %s", exc)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
