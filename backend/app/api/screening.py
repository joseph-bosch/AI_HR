import logging

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.models.candidate import Candidate, Resume, ScreeningScore
from app.models.job import JobRequisition
from app.schemas.candidate import (
    ScreeningRequest, BatchScreeningRequest, ScreeningScoreResponse,
    CandidateWithScore, CandidateResponse, ResumeResponse, ShortlistRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _candidate_identity_key(candidate: Candidate | None) -> str | None:
    """Build a dedup key from a candidate's email or name.

    Returns None if there is no identifying info yet (e.g. resume still parsing).
    Handles Chinese names where the full name is stored in first_name only
    (no space to split on), as well as standard first+last name formats.
    """
    if not candidate:
        return None
    if candidate.email:
        return f"email:{candidate.email.lower().strip()}"
    # Build name key from whatever name fields are available.
    # Chinese names like "袁笑" end up as first_name="袁笑", last_name=None
    # because there is no space to split on in resume_parser.
    name_parts: list[str] = []
    if candidate.first_name:
        name_parts.append(candidate.first_name.lower().strip())
    if candidate.last_name:
        name_parts.append(candidate.last_name.lower().strip())
    if name_parts:
        return f"name:{'|'.join(name_parts)}"
    return None


async def _score_candidate_background(job_id: str, candidate_id: str, resume_id: str, language: str = "en"):
    from app.database import async_session
    from app.services.screening_service import score_candidate
    from app.services.translation_service import translate_screening_score

    score_id = None
    async with async_session() as db:
        try:
            await score_candidate(job_id, candidate_id, resume_id, db, language)
            result = await db.execute(
                select(ScreeningScore.id).where(
                    ScreeningScore.job_id == job_id,
                    ScreeningScore.candidate_id == candidate_id,
                )
            )
            score_id = result.scalar_one_or_none()
        except Exception:
            logger.exception(
                "Screening failed for job_id=%s candidate_id=%s resume_id=%s",
                job_id, candidate_id, resume_id,
            )
            await db.rollback()
            try:
                result = await db.execute(
                    select(ScreeningScore).where(
                        ScreeningScore.job_id == job_id,
                        ScreeningScore.candidate_id == candidate_id,
                    )
                )
                score = result.scalar_one_or_none()
                if score:
                    score.status = "failed"
                    await db.commit()
            except Exception:
                logger.exception("Failed to mark screening score as failed")

    if score_id:
        await translate_screening_score(score_id)


@router.post("/score", response_model=ScreeningScoreResponse, status_code=201)
async def score_single(
    data: ScreeningRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    # Verify job exists
    job_result = await db.execute(
        select(JobRequisition).where(JobRequisition.id == data.job_id)
    )
    if not job_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Job not found")

    # Get resume
    resume_result = await db.execute(
        select(Resume).where(
            Resume.candidate_id == data.candidate_id,
            Resume.parse_status == "completed",
        ).order_by(Resume.created_at.desc())
    )
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=400, detail="No parsed resume found for candidate")

    # Check if already scored
    existing = await db.execute(
        select(ScreeningScore).where(
            ScreeningScore.job_id == data.job_id,
            ScreeningScore.candidate_id == data.candidate_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Candidate already scored for this job")

    # Create pending score
    score = ScreeningScore(
        job_id=data.job_id,
        candidate_id=data.candidate_id,
        resume_id=resume.id,
        overall_score=0,
        explanation="Scoring in progress...",
        status="processing",
    )
    db.add(score)
    await db.flush()
    await db.refresh(score)

    # Commit NOW so the background task's independent session can find this record
    await db.commit()

    lang = data.language or "en"
    background_tasks.add_task(
        _score_candidate_background, data.job_id, data.candidate_id, resume.id, lang
    )

    return score


@router.post("/score-batch", status_code=202)
async def score_batch(
    data: BatchScreeningRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    # Get all candidates with parsed resumes that haven't been scored for this job
    resume_query = (
        select(Resume)
        .where(Resume.parse_status == "completed")
        .options(joinedload(Resume.candidate))
        .order_by(Resume.created_at.desc())
    )
    resume_result = await db.execute(resume_query)
    resumes = resume_result.scalars().unique().all()

    lang = data.language or "en"
    seen_candidate_ids: set[str] = set()
    seen_persons: set[str] = set()
    count = 0
    for resume in resumes:
        if resume.candidate_id in seen_candidate_ids:
            continue

        # Skip archived candidates
        if resume.candidate and resume.candidate.is_archived:
            seen_candidate_ids.add(resume.candidate_id)
            continue

        existing = await db.execute(
            select(ScreeningScore).where(
                ScreeningScore.job_id == data.job_id,
                ScreeningScore.candidate_id == resume.candidate_id,
            )
        )
        if existing.scalar_one_or_none():
            seen_candidate_ids.add(resume.candidate_id)
            # Register identity so duplicate candidates (same person, diff id) are also skipped
            identity_key = _candidate_identity_key(resume.candidate)
            if identity_key:
                seen_persons.add(identity_key)
            continue

        # Deduplicate by person identity (email or full name), not just candidate_id
        identity_key = _candidate_identity_key(resume.candidate)
        if identity_key and identity_key in seen_persons:
            logger.info(
                "Skipping duplicate person in batch scoring: candidate_id=%s (identity=%s)",
                resume.candidate_id, identity_key,
            )
            seen_candidate_ids.add(resume.candidate_id)
            continue

        if identity_key:
            seen_persons.add(identity_key)
        seen_candidate_ids.add(resume.candidate_id)

        score = ScreeningScore(
            job_id=data.job_id,
            candidate_id=resume.candidate_id,
            resume_id=resume.id,
            overall_score=0,
            explanation="Scoring in progress...",
            status="processing",
        )
        db.add(score)
        await db.flush()

        background_tasks.add_task(
            _score_candidate_background, data.job_id, resume.candidate_id, resume.id, lang
        )
        count += 1

    # Commit all scores so background tasks' independent sessions can find them
    await db.commit()

    return {"status": "ok", "message": f"Scoring started for {count} candidates"}


@router.post("/job/{job_id}/rescore", status_code=202)
async def rescore_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    language: str = Query(default="en"),
    db: AsyncSession = Depends(get_db),
):
    """Delete all existing scores for a job and re-score all candidates."""
    if not (await db.execute(select(JobRequisition).where(JobRequisition.id == job_id))).scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Job not found")

    await db.execute(delete(ScreeningScore).where(ScreeningScore.job_id == job_id))
    await db.commit()

    # Use only the latest resume per UNIQUE PERSON (ordered newest-first).
    # Join with Candidate so we can deduplicate by email/name, not just candidate_id.
    resume_result = await db.execute(
        select(Resume)
        .where(Resume.parse_status == "completed")
        .options(joinedload(Resume.candidate))
        .order_by(Resume.created_at.desc())
    )
    resumes = resume_result.scalars().unique().all()

    seen_candidate_ids: set[str] = set()
    seen_persons: set[str] = set()
    count = 0
    skipped_dupes = 0
    for resume in resumes:
        if resume.candidate_id in seen_candidate_ids:
            continue

        # Skip archived candidates
        if resume.candidate and resume.candidate.is_archived:
            seen_candidate_ids.add(resume.candidate_id)
            continue

        # Deduplicate by person identity (email or full name), not just candidate_id.
        # This catches the case where the same person was uploaded multiple times
        # creating separate Candidate records with different UUIDs.
        identity_key = _candidate_identity_key(resume.candidate)
        if identity_key and identity_key in seen_persons:
            logger.info(
                "Skipping duplicate person in rescore: candidate_id=%s (identity=%s already queued)",
                resume.candidate_id, identity_key,
            )
            seen_candidate_ids.add(resume.candidate_id)
            skipped_dupes += 1
            continue

        if identity_key:
            seen_persons.add(identity_key)
        seen_candidate_ids.add(resume.candidate_id)

        score = ScreeningScore(
            job_id=job_id,
            candidate_id=resume.candidate_id,
            resume_id=resume.id,
            overall_score=0,
            explanation="Scoring in progress...",
            status="processing",
        )
        db.add(score)
        await db.flush()
        background_tasks.add_task(_score_candidate_background, job_id, resume.candidate_id, resume.id, language)
        count += 1

    await db.commit()
    msg = f"Re-scoring started for {count} candidates"
    if skipped_dupes:
        msg += f" ({skipped_dupes} duplicate(s) skipped)"
    return {"status": "ok", "message": msg}


@router.get("/job/{job_id}/rankings", response_model=list[ScreeningScoreResponse])
async def get_rankings(
    job_id: str,
    top_n: int | None = Query(None, ge=1),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(ScreeningScore)
        .join(Candidate, ScreeningScore.candidate_id == Candidate.id)
        .where(ScreeningScore.job_id == job_id, Candidate.is_archived == False)  # noqa: E712
        .order_by(ScreeningScore.overall_score.desc())
    )
    if top_n:
        query = query.limit(top_n)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/score/by-candidate/{candidate_id}", response_model=ScreeningScoreResponse)
async def get_score_by_candidate(
    candidate_id: str,
    job_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Return the most recent completed screening score for a candidate, optionally filtered by job."""
    query = (
        select(ScreeningScore)
        .where(ScreeningScore.candidate_id == candidate_id, ScreeningScore.status == "completed")
    )
    if job_id:
        query = query.where(ScreeningScore.job_id == job_id)
    query = query.order_by(ScreeningScore.created_at.desc())
    result = await db.execute(query)
    score = result.scalar_one_or_none()
    if not score:
        raise HTTPException(status_code=404, detail="No completed score found for this candidate")
    return score


@router.get("/score/{score_id}", response_model=ScreeningScoreResponse)
async def get_score(score_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ScreeningScore).where(ScreeningScore.id == score_id)
    )
    score = result.scalar_one_or_none()
    if not score:
        raise HTTPException(status_code=404, detail="Score not found")
    return score


@router.post("/job/{job_id}/shortlist")
async def shortlist_candidates(
    job_id: str,
    data: ShortlistRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ScreeningScore)
        .where(
            ScreeningScore.job_id == job_id,
            ScreeningScore.status == "completed",
        )
        .order_by(ScreeningScore.overall_score.desc())
        .limit(data.top_n)
    )
    scores = result.scalars().all()

    shortlisted = []
    for score in scores:
        cand_result = await db.execute(
            select(Candidate).where(Candidate.id == score.candidate_id)
        )
        candidate = cand_result.scalar_one_or_none()
        if candidate and not candidate.is_archived:
            candidate.status = "shortlisted"
            shortlisted.append(candidate.id)

    await db.flush()
    return {"shortlisted": len(shortlisted), "candidate_ids": shortlisted}
