import json
import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.job import JobRequisition
from app.models.candidate import ScreeningScore
from app.models.interview import InterviewEvaluation
from app.models.offer import GeneratedOffer
from app.schemas.job import JobCreate, JobUpdate, JobResponse, JobStats
from app.llm.factory import get_llm_provider
from app.llm.prompts.job_description import (
    DESCRIPTION_SYSTEM_PROMPT,
    DESCRIPTION_PROMPT_TEMPLATE,
    REQUIREMENTS_PROMPT_TEMPLATE,
)

router = APIRouter()

_LANG_INSTRUCTIONS = {
    "zh": "IMPORTANT: Write everything in Chinese (Simplified).",
    "en": "Write in English.",
}


class GenerateDescriptionRequest(BaseModel):
    title: str
    department: str
    seniority_level: str
    employment_type: str
    language: str = "en"


@router.post("/generate-description")
async def generate_job_description(data: GenerateDescriptionRequest):
    """SSE endpoint: streams job description tokens, then emits a done event with weighted requirements."""
    language_instruction = _LANG_INSTRUCTIONS.get(data.language, _LANG_INSTRUCTIONS["en"])

    async def event_generator():
        provider = get_llm_provider()
        full_description: list[str] = []

        messages = [
            {"role": "system", "content": DESCRIPTION_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": DESCRIPTION_PROMPT_TEMPLATE.format(
                    job_title=data.title,
                    department=data.department,
                    seniority_level=data.seniority_level,
                    employment_type=data.employment_type,
                    language_instruction=language_instruction,
                ),
            },
        ]
        try:
            async for token in provider.generate_stream(messages, temperature=0.7):
                full_description.append(token)
                yield f"data: {json.dumps({'type': 'token', 'content': token}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            return

        description_text = "".join(full_description)
        try:
            req_response = await provider.generate(
                prompt=REQUIREMENTS_PROMPT_TEMPLATE.format(
                    job_title=data.title,
                    department=data.department,
                    seniority_level=data.seniority_level,
                    description=description_text,
                    language_instruction=language_instruction,
                ),
                temperature=0.2,
                json_mode=True,
            )
            result = req_response.parsed or {}
        except Exception:
            result = {}

        yield f"data: {json.dumps({'type': 'done', 'result': result}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


_ALLOWED_JOB_FILE_TYPES = {".pdf", ".docx", ".txt"}


@router.post("/extract-from-file")
async def extract_job_from_file(file: UploadFile = File(...)):
    """Extract job posting fields from an uploaded PDF, DOCX, or TXT file."""
    from app.utils.text_extraction import extract_text
    from app.llm.prompts.job_extraction import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE

    ext = Path(file.filename or "").suffix.lower()
    if ext not in _ALLOWED_JOB_FILE_TYPES:
        raise HTTPException(status_code=400, detail="Supported formats: PDF, DOCX, TXT")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 20 MB)")

    # Write to temp file so text_extraction can open by path
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        text = extract_text(tmp_path)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read file: {exc}") from exc
    finally:
        os.unlink(tmp_path)

    if not text or len(text.strip()) < 20:
        raise HTTPException(status_code=422, detail="Could not extract meaningful text from file")

    response = await get_llm_provider().generate(
        prompt=USER_PROMPT_TEMPLATE.format(document_text=text[:12000]),
        system_prompt=SYSTEM_PROMPT,
        temperature=0.1,
        json_mode=True,
    )

    if not response.parsed:
        raise HTTPException(status_code=500, detail="LLM could not extract job information")

    return response.parsed


@router.get("/", response_model=list[JobResponse])
async def list_jobs(
    status: str | None = None,
    department: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    query = select(JobRequisition)
    if status:
        query = query.where(JobRequisition.status == status)
    if department:
        query = query.where(JobRequisition.department == department)
    query = query.order_by(JobRequisition.created_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/", response_model=JobResponse, status_code=201)
async def create_job(data: JobCreate, db: AsyncSession = Depends(get_db)):
    job = JobRequisition(**data.model_dump())
    db.add(job)
    await db.flush()
    await db.refresh(job)
    return job


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(JobRequisition).where(JobRequisition.id == job_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.put("/{job_id}", response_model=JobResponse)
async def update_job(job_id: str, data: JobUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(JobRequisition).where(JobRequisition.id == job_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(job, field, value)
    await db.flush()
    await db.refresh(job)
    return job


@router.delete("/{job_id}", status_code=204)
async def delete_job(job_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(JobRequisition).where(JobRequisition.id == job_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # Explicitly delete related records that lack DB-level CASCADE
    await db.execute(delete(InterviewEvaluation).where(InterviewEvaluation.job_id == job_id))
    await db.execute(delete(GeneratedOffer).where(GeneratedOffer.job_id == job_id))
    await db.delete(job)
    await db.commit()


@router.get("/{job_id}/stats", response_model=JobStats)
async def get_job_stats(job_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(JobRequisition).where(JobRequisition.id == job_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    stats_result = await db.execute(
        select(
            func.count(ScreeningScore.id),
            func.avg(ScreeningScore.overall_score),
        ).where(
            ScreeningScore.job_id == job_id,
            ScreeningScore.status == "completed",
        )
    )
    row = stats_result.one()

    shortlisted_result = await db.execute(
        select(func.count(ScreeningScore.id)).where(
            ScreeningScore.job_id == job_id,
            ScreeningScore.recommendation.in_(["strong_yes", "yes"]),
        )
    )
    shortlisted = shortlisted_result.scalar() or 0

    return JobStats(
        job_id=job_id,
        total_candidates=0,
        screened_candidates=row[0] or 0,
        shortlisted_candidates=shortlisted,
        avg_score=float(row[1]) if row[1] else None,
        status=job.status,
    )
