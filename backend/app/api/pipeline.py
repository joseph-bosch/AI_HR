"""Interview pipeline API — tracks candidates through interview stages."""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.pipeline import InterviewPipeline
from app.models.candidate import Candidate, ScreeningScore
from app.models.job import JobRequisition
from app.models.interview import InterviewEvaluation
from app.models.question_set import QuestionSet

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class PipelineAddRequest(BaseModel):
    job_id: str
    candidate_id: str
    promoted_by: str | None = None


class PipelineAdvanceRequest(BaseModel):
    promoted_by: str | None = None
    target_stage: str | None = None  # optional override for dept→third vs dept→decision


class PipelineRejectRequest(BaseModel):
    rejection_reason: str


# Valid stage progression
_NEXT_STAGES: dict[str, list[str]] = {
    "hr_interview":   ["dept_interview"],
    "dept_interview": ["third_interview", "decision"],
    "third_interview": ["decision"],
}

_STAGE_ORDER = ["hr_interview", "dept_interview", "third_interview", "decision"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_or_404(pipeline_id: str, db: AsyncSession) -> InterviewPipeline:
    result = await db.execute(
        select(InterviewPipeline).where(InterviewPipeline.id == pipeline_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Pipeline entry not found")
    return entry


async def _has_completed_evaluation(job_id: str, candidate_id: str, db: AsyncSession) -> bool:
    """Check if at least one completed evaluation exists for this candidate+job."""
    result = await db.execute(
        select(func.count()).select_from(InterviewEvaluation).where(
            InterviewEvaluation.job_id == job_id,
            InterviewEvaluation.candidate_id == candidate_id,
            InterviewEvaluation.status == "completed",
        )
    )
    return (result.scalar() or 0) > 0


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("", status_code=201)
async def add_to_pipeline(data: PipelineAddRequest, db: AsyncSession = Depends(get_db)):
    """Add a candidate to the interview pipeline for a job."""
    # Verify job + candidate exist
    job = (await db.execute(select(JobRequisition).where(JobRequisition.id == data.job_id))).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    candidate = (await db.execute(select(Candidate).where(Candidate.id == data.candidate_id))).scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Check for duplicate
    existing = (await db.execute(
        select(InterviewPipeline).where(
            InterviewPipeline.job_id == data.job_id,
            InterviewPipeline.candidate_id == data.candidate_id,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Candidate is already in the pipeline for this job")

    entry = InterviewPipeline(
        job_id=data.job_id,
        candidate_id=data.candidate_id,
        current_stage="hr_interview",
        stage_status="pending",
        promoted_by=data.promoted_by,
    )
    db.add(entry)

    # Update candidate status to interviewing
    candidate.status = "interviewing"

    await db.flush()
    await db.refresh(entry)
    return _serialize(entry)


@router.get("/job/{job_id}")
async def list_pipeline_for_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """Return all pipeline entries for a job, enriched with candidate + score data."""
    result = await db.execute(
        select(InterviewPipeline).where(InterviewPipeline.job_id == job_id)
        .order_by(InterviewPipeline.created_at.asc())
    )
    entries = result.scalars().all()

    rows = []
    for entry in entries:
        candidate = (await db.execute(
            select(Candidate).where(Candidate.id == entry.candidate_id)
        )).scalar_one_or_none()

        score = (await db.execute(
            select(ScreeningScore).where(
                ScreeningScore.job_id == job_id,
                ScreeningScore.candidate_id == entry.candidate_id,
                ScreeningScore.status == "completed",
            )
        )).scalar_one_or_none()

        eval_count = (await db.execute(
            select(func.count()).select_from(InterviewEvaluation).where(
                InterviewEvaluation.job_id == job_id,
                InterviewEvaluation.candidate_id == entry.candidate_id,
                InterviewEvaluation.status == "completed",
            )
        )).scalar() or 0

        question_count = (await db.execute(
            select(func.count()).select_from(QuestionSet).where(
                QuestionSet.job_id == job_id,
                QuestionSet.candidate_id == entry.candidate_id,
            )
        )).scalar() or 0

        # Latest fit_score from evaluations
        latest_eval = (await db.execute(
            select(InterviewEvaluation).where(
                InterviewEvaluation.job_id == job_id,
                InterviewEvaluation.candidate_id == entry.candidate_id,
                InterviewEvaluation.status == "completed",
            ).order_by(InterviewEvaluation.updated_at.desc())
        )).scalar_one_or_none()

        latest_fit_score = None
        if latest_eval and latest_eval.generated_report:
            latest_fit_score = latest_eval.generated_report.get("fit_score")

        rows.append({
            **_serialize(entry),
            "candidate_name": f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() if candidate else "Unknown",
            "candidate_email": candidate.email if candidate else None,
            "overall_score": float(score.overall_score) if score else None,
            "recommendation": score.recommendation if score else None,
            "completed_evaluations": eval_count,
            "question_sets": question_count,
            "latest_fit_score": latest_fit_score,
        })

    return rows


@router.get("/{pipeline_id}")
async def get_pipeline_entry(pipeline_id: str, db: AsyncSession = Depends(get_db)):
    entry = await _get_or_404(pipeline_id, db)
    return _serialize(entry)


@router.put("/{pipeline_id}/advance")
async def advance_stage(
    pipeline_id: str,
    data: PipelineAdvanceRequest,
    db: AsyncSession = Depends(get_db),
):
    """Advance a candidate to the next interview stage."""
    entry = await _get_or_404(pipeline_id, db)

    if entry.stage_status == "rejected":
        raise HTTPException(status_code=400, detail="Cannot advance a rejected candidate")

    allowed_next = _NEXT_STAGES.get(entry.current_stage)
    if not allowed_next:
        raise HTTPException(status_code=400, detail="Candidate has reached the final stage")

    # Gate: hr_interview requires a completed evaluation before advancing
    if entry.current_stage == "hr_interview":
        if not await _has_completed_evaluation(entry.job_id, entry.candidate_id, db):
            raise HTTPException(
                status_code=400,
                detail="A completed interview evaluation is required before advancing from HR interview",
            )

    # Determine target stage
    if data.target_stage:
        if data.target_stage not in allowed_next:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid target stage '{data.target_stage}'. Allowed: {allowed_next}",
            )
        next_stage = data.target_stage
    else:
        next_stage = allowed_next[0]

    entry.current_stage = next_stage
    entry.stage_status = "pending"
    if data.promoted_by:
        entry.promoted_by = data.promoted_by

    await db.flush()
    return _serialize(entry)


@router.put("/{pipeline_id}/reject")
async def reject_candidate(
    pipeline_id: str,
    data: PipelineRejectRequest,
    db: AsyncSession = Depends(get_db),
):
    """Reject a candidate at any stage. Reason is required."""
    if not data.rejection_reason or not data.rejection_reason.strip():
        raise HTTPException(status_code=400, detail="Rejection reason is required")

    entry = await _get_or_404(pipeline_id, db)

    if entry.stage_status == "rejected":
        raise HTTPException(status_code=400, detail="Candidate is already rejected")

    entry.stage_status = "rejected"
    entry.rejection_reason = data.rejection_reason.strip()

    # Update candidate status
    candidate = (await db.execute(
        select(Candidate).where(Candidate.id == entry.candidate_id)
    )).scalar_one_or_none()
    if candidate:
        candidate.status = "rejected"

    await db.flush()
    return _serialize(entry)


@router.delete("/{pipeline_id}", status_code=204)
async def remove_from_pipeline(pipeline_id: str, db: AsyncSession = Depends(get_db)):
    """Remove a candidate from the pipeline entirely."""
    entry = await _get_or_404(pipeline_id, db)

    # Revert candidate status to shortlisted
    candidate = (await db.execute(
        select(Candidate).where(Candidate.id == entry.candidate_id)
    )).scalar_one_or_none()
    if candidate and candidate.status == "interviewing":
        candidate.status = "shortlisted"

    await db.delete(entry)
    await db.flush()


_LANG_INSTRUCTIONS = {
    "zh": "IMPORTANT: Write the sentence in Chinese (Simplified).",
    "en": "Write in English.",
}


@router.get("/{pipeline_id}/remark")
async def get_pipeline_remark(
    pipeline_id: str,
    lang: str = Query("en"),
    db: AsyncSession = Depends(get_db),
):
    """Generate an AI remark summarising this candidate's pipeline status."""
    entry = await _get_or_404(pipeline_id, db)

    candidate = (await db.execute(
        select(Candidate).where(Candidate.id == entry.candidate_id)
    )).scalar_one_or_none()
    candidate_name = f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() if candidate else "Candidate"

    score = (await db.execute(
        select(ScreeningScore).where(
            ScreeningScore.job_id == entry.job_id,
            ScreeningScore.candidate_id == entry.candidate_id,
            ScreeningScore.status == "completed",
        )
    )).scalar_one_or_none()

    eval_count = (await db.execute(
        select(func.count()).select_from(InterviewEvaluation).where(
            InterviewEvaluation.job_id == entry.job_id,
            InterviewEvaluation.candidate_id == entry.candidate_id,
            InterviewEvaluation.status == "completed",
        )
    )).scalar() or 0

    question_count = (await db.execute(
        select(func.count()).select_from(QuestionSet).where(
            QuestionSet.job_id == entry.job_id,
            QuestionSet.candidate_id == entry.candidate_id,
        )
    )).scalar() or 0

    latest_eval = (await db.execute(
        select(InterviewEvaluation).where(
            InterviewEvaluation.job_id == entry.job_id,
            InterviewEvaluation.candidate_id == entry.candidate_id,
            InterviewEvaluation.status == "completed",
        ).order_by(InterviewEvaluation.updated_at.desc())
    )).scalar_one_or_none()

    fit_score = None
    overall_recommendation = None
    if latest_eval and latest_eval.generated_report:
        fit_score = latest_eval.generated_report.get("fit_score")
        overall_recommendation = latest_eval.generated_report.get("overall_recommendation")

    # Build context for LLM
    context = {
        "candidate_name": candidate_name,
        "current_stage": entry.current_stage.replace("_", " "),
        "stage_status": entry.stage_status,
        "screening_score": float(score.overall_score) if score else None,
        "screening_recommendation": score.recommendation if score else None,
        "completed_evaluations": eval_count,
        "question_sets_generated": question_count,
        "latest_fit_score": fit_score,
        "latest_overall_recommendation": overall_recommendation,
    }

    if entry.stage_status == "rejected":
        return {"remark": f"Rejected at {entry.current_stage.replace('_', ' ')} stage. Reason: {entry.rejection_reason or 'Not specified'}."}

    try:
        from app.llm.factory import get_llm_provider
        provider = get_llm_provider()
        language_instruction = _LANG_INSTRUCTIONS.get(lang, _LANG_INSTRUCTIONS["en"])
        system = (
            "You are an HR assistant. Given pipeline status data, write a single concise sentence "
            "(max 20 words) describing what has been done for this candidate and what the next step is. "
            f"Do not use bullet points. Plain text only. {language_instruction}"
        )
        prompt = f"Pipeline data: {json.dumps(context)}"
        resp = await provider.generate(prompt=prompt, system_prompt=system, temperature=0.2)
        remark = resp.content.strip().strip('"')
    except Exception as e:
        logger.warning("Remark generation failed: %s", e)
        parts = []
        if eval_count:
            suffix = f"(fit score: {fit_score})" if fit_score else ""
            parts.append(f"{eval_count} evaluation(s) completed {suffix}".strip())
        if question_count:
            parts.append(f"{question_count} question set(s) generated")
        if not parts:
            parts.append("Pending interview activities")
        remark = ". ".join(parts) + "."

    return {"remark": remark}


# ---------------------------------------------------------------------------
# Serialiser
# ---------------------------------------------------------------------------

def _serialize(entry: InterviewPipeline) -> dict:
    return {
        "id": entry.id,
        "job_id": entry.job_id,
        "candidate_id": entry.candidate_id,
        "current_stage": entry.current_stage,
        "stage_status": entry.stage_status,
        "rejection_reason": entry.rejection_reason,
        "promoted_by": entry.promoted_by,
        "notes": entry.notes,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
        "updated_at": entry.updated_at.isoformat() if entry.updated_at else None,
    }
