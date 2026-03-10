import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.interview import InterviewEvaluation
from app.models.job import JobRequisition
from app.models.candidate import Candidate
from app.schemas.interview import EvaluationCreate, AnswerSubmit, EvaluationResponse, UpdateReportRequest

router = APIRouter()

_ALLOWED_AUDIO_TYPES = {
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
    "audio/mp4", "audio/ogg", "audio/webm", "audio/m4a",
    "audio/x-m4a", "video/webm",  # some browsers send webm as video/
}


@router.post("/evaluations", response_model=EvaluationResponse, status_code=201)
async def start_evaluation(
    data: EvaluationCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    from app.services.interview_service import generate_evaluation_questions
    from app.services.translation_service import translate_evaluation_questions

    # Verify job and candidate exist
    job_result = await db.execute(
        select(JobRequisition).where(JobRequisition.id == data.job_id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    cand_result = await db.execute(
        select(Candidate).where(Candidate.id == data.candidate_id)
    )
    candidate = cand_result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    lang = data.language or "en"

    # Generate evaluation questions via LLM
    questions = await generate_evaluation_questions(job, candidate, data.interview_round, lang)

    evaluation = InterviewEvaluation(
        job_id=data.job_id,
        candidate_id=data.candidate_id,
        interview_round=data.interview_round,
        interviewer_name=data.interviewer_name,
        questions=questions,
        answers={},
        status="in_progress",
        primary_language=lang,
    )
    db.add(evaluation)
    await db.flush()
    await db.refresh(evaluation)

    # Background: translate questions to the other language
    background_tasks.add_task(translate_evaluation_questions, evaluation.id)

    return evaluation


@router.get("/evaluations/{eval_id}", response_model=EvaluationResponse)
async def get_evaluation(eval_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(InterviewEvaluation).where(InterviewEvaluation.id == eval_id)
    )
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    return evaluation


@router.put("/evaluations/{eval_id}/answer")
async def submit_answer(
    eval_id: str,
    data: AnswerSubmit,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InterviewEvaluation).where(InterviewEvaluation.id == eval_id)
    )
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    if evaluation.status == "completed":
        raise HTTPException(status_code=400, detail="Evaluation already completed")

    answers = dict(evaluation.answers or {})
    answers[data.question_id] = data.answer
    evaluation.answers = answers
    await db.flush()

    total_questions = len(evaluation.questions) if evaluation.questions else 0
    answered = len(answers)

    return {
        "status": "ok",
        "answered": answered,
        "total": total_questions,
        "all_answered": answered >= total_questions,
    }


@router.post("/evaluations/{eval_id}/generate-report", response_model=EvaluationResponse)
async def generate_report(
    eval_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    from app.services.interview_service import generate_evaluation_report
    from app.services.translation_service import translate_evaluation_report

    result = await db.execute(
        select(InterviewEvaluation).where(InterviewEvaluation.id == eval_id)
    )
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    # Verify all questions answered
    total_questions = len(evaluation.questions) if evaluation.questions else 0
    answered = len(evaluation.answers) if evaluation.answers else 0
    if answered < total_questions:
        raise HTTPException(
            status_code=400,
            detail=f"Not all questions answered ({answered}/{total_questions})",
        )

    # Get job and candidate for context
    job_result = await db.execute(
        select(JobRequisition).where(JobRequisition.id == evaluation.job_id)
    )
    job = job_result.scalar_one()

    cand_result = await db.execute(
        select(Candidate).where(Candidate.id == evaluation.candidate_id)
    )
    candidate = cand_result.scalar_one()

    report = await generate_evaluation_report(evaluation, job, candidate)

    evaluation.generated_report = report
    evaluation.status = "completed"
    await db.flush()
    await db.refresh(evaluation)

    # Background: translate report to the other language
    background_tasks.add_task(translate_evaluation_report, evaluation.id)

    return evaluation


@router.get("/evaluations/{eval_id}/report")
async def get_report(eval_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(InterviewEvaluation).where(InterviewEvaluation.id == eval_id)
    )
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    if not evaluation.generated_report:
        raise HTTPException(status_code=404, detail="Report not yet generated")
    return evaluation.generated_report


# ── Audio upload ────────────────────────────────────────────────────────────

@router.post("/evaluations/{eval_id}/upload-audio")
async def upload_audio(
    eval_id: str,
    background_tasks: BackgroundTasks,
    audio: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    from app.services import transcription_service

    result = await db.execute(
        select(InterviewEvaluation).where(InterviewEvaluation.id == eval_id)
    )
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    content_type = audio.content_type or ""
    if content_type not in _ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format: {content_type}. Allowed: mp3, wav, mp4, ogg, webm, m4a",
        )

    # Save file to storage/audio/
    audio_dir = Path(settings.STORAGE_DIR) / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    safe_name = (audio.filename or "recording").replace("/", "_").replace("\\", "_")
    audio_path = audio_dir / f"{eval_id}_{safe_name}"

    content = await audio.read()
    with open(audio_path, "wb") as f:
        f.write(content)

    evaluation.audio_path = str(audio_path)
    evaluation.transcript_status = "processing"
    await db.flush()

    background_tasks.add_task(
        transcription_service.transcribe_audio_background,
        eval_id,
        str(audio_path),
    )

    return {"status": "processing", "eval_id": eval_id, "filename": audio_path.name}


@router.get("/evaluations/{eval_id}/transcript-status")
async def get_transcript_status(eval_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(InterviewEvaluation).where(InterviewEvaluation.id == eval_id)
    )
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    return {
        "transcript_status": evaluation.transcript_status,
        "transcript": evaluation.transcript if evaluation.transcript_status == "completed" else None,
    }


@router.post("/evaluations/{eval_id}/generate-report-from-transcript", response_model=EvaluationResponse)
async def generate_report_from_transcript(
    eval_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    from app.services.interview_service import generate_evaluation_report_from_transcript
    from app.services.translation_service import translate_evaluation_report

    result = await db.execute(
        select(InterviewEvaluation).where(InterviewEvaluation.id == eval_id)
    )
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    if evaluation.transcript_status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Transcript not ready (status: {evaluation.transcript_status})",
        )

    job_result = await db.execute(
        select(JobRequisition).where(JobRequisition.id == evaluation.job_id)
    )
    job = job_result.scalar_one()

    cand_result = await db.execute(
        select(Candidate).where(Candidate.id == evaluation.candidate_id)
    )
    candidate = cand_result.scalar_one()

    report = await generate_evaluation_report_from_transcript(evaluation, job, candidate)

    evaluation.generated_report = report
    evaluation.status = "completed"
    await db.flush()
    await db.refresh(evaluation)

    background_tasks.add_task(translate_evaluation_report, evaluation.id)

    return evaluation


@router.post("/evaluations/{eval_id}/re-score", response_model=EvaluationResponse)
async def re_score_report(eval_id: str, db: AsyncSession = Depends(get_db)):
    """Re-derive fit_score and overall_recommendation from the current (possibly edited) report content."""
    result = await db.execute(
        select(InterviewEvaluation).where(InterviewEvaluation.id == eval_id)
    )
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    if not evaluation.generated_report:
        raise HTTPException(status_code=400, detail="No report to re-score")

    report = evaluation.generated_report
    strengths = report.get("strengths", [])
    concerns = report.get("weaknesses", report.get("concerns", []))

    content = (
        f"Summary: {report.get('summary', '')}\n"
        f"Strengths:\n" + "\n".join(f"- {s}" for s in strengths) + "\n"
        f"Concerns:\n" + "\n".join(f"- {c}" for c in concerns) + "\n"
        f"Technical Assessment: {report.get('technical_assessment', '')}\n"
        f"Cultural Fit Assessment: {report.get('cultural_fit_assessment', '')}\n"
        f"Communication Assessment: {report.get('communication_assessment', '')}"
    )

    from app.llm.factory import get_llm_provider
    provider = get_llm_provider()
    system = (
        "You are an HR evaluation scorer. Based on the provided interview evaluation content, "
        "determine an appropriate fit_score (integer 0-100) and overall_recommendation. "
        "overall_recommendation must be exactly one of: strong_hire, hire, no_hire, strong_no_hire. "
        "Return ONLY valid JSON with exactly two keys: fit_score and overall_recommendation. "
        "No explanation, no markdown, no extra text."
    )
    resp = await provider.generate(
        prompt=f"Interview evaluation content:\n{content}\n\nReturn JSON only.",
        system_prompt=system,
        temperature=0.1,
    )
    raw = resp.content.strip().strip("`")
    if raw.lower().startswith("json"):
        raw = raw[4:].strip()

    try:
        parsed = json.loads(raw)
        new_score = max(0, min(100, int(parsed.get("fit_score", report.get("fit_score", 0)))))
        new_rec = parsed.get("overall_recommendation", report.get("overall_recommendation", "no_hire"))
        if new_rec not in ("strong_hire", "hire", "no_hire", "strong_no_hire"):
            new_rec = report.get("overall_recommendation", "no_hire")
    except (json.JSONDecodeError, ValueError, TypeError):
        raise HTTPException(status_code=500, detail="AI re-scoring returned invalid JSON")

    evaluation.generated_report = {**report, "fit_score": new_score, "overall_recommendation": new_rec}
    evaluation.report_edited = 1
    await db.flush()
    await db.refresh(evaluation)
    return evaluation


@router.put("/evaluations/{eval_id}/report", response_model=EvaluationResponse)
async def update_report(
    eval_id: str,
    data: UpdateReportRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InterviewEvaluation).where(InterviewEvaluation.id == eval_id)
    )
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    if data.generated_report is not None:
        evaluation.generated_report = data.generated_report
        evaluation.report_edited = 1
    if data.hr_notes is not None:
        evaluation.hr_notes = data.hr_notes

    await db.flush()
    await db.refresh(evaluation)
    return evaluation


# ── List endpoints ───────────────────────────────────────────────────────────

@router.get("/job/{job_id}/evaluations", response_model=list[EvaluationResponse])
async def list_job_evaluations(job_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(InterviewEvaluation)
        .where(InterviewEvaluation.job_id == job_id)
        .order_by(InterviewEvaluation.created_at.desc())
    )
    return result.scalars().all()


@router.get("/candidate/{candidate_id}/evaluations", response_model=list[EvaluationResponse])
async def list_candidate_evaluations(candidate_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(InterviewEvaluation)
        .where(InterviewEvaluation.candidate_id == candidate_id)
        .order_by(InterviewEvaluation.created_at.desc())
    )
    return result.scalars().all()
