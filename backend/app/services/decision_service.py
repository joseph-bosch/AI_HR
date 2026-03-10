"""
Decision report service — aggregates all interview evaluations for a candidate+job
and generates a comprehensive final hiring recommendation with salary guidance.
"""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.factory import get_llm_provider
from app.llm.prompts.decision_report import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE
from app.models.pipeline import InterviewPipeline
from app.models.decision import InterviewDecision
from app.models.job import JobRequisition
from app.models.candidate import Candidate, ScreeningScore
from app.models.interview import InterviewEvaluation

logger = logging.getLogger(__name__)

_LANGUAGE_INSTRUCTIONS = {
    "zh": "IMPORTANT: Generate ALL text content in Chinese (Simplified).",
    "en": "IMPORTANT: Generate ALL text content in English.",
}

_STAGE_LABELS = {
    "hr_interview": "HR Interview",
    "dept_interview": "Department Interview",
    "third_interview": "Third Interview",
    "decision": "Final",
}


async def generate_decision_report(pipeline_id: str, db: AsyncSession, language: str = "en") -> InterviewDecision:
    """
    Load all evaluation data for a pipeline entry, call the LLM, and persist
    (or update) the InterviewDecision record.
    """
    # Load pipeline entry
    pipeline_result = await db.execute(
        select(InterviewPipeline).where(InterviewPipeline.id == pipeline_id)
    )
    pipeline = pipeline_result.scalar_one_or_none()
    if not pipeline:
        raise ValueError(f"Pipeline entry {pipeline_id} not found")

    job_result = await db.execute(
        select(JobRequisition).where(JobRequisition.id == pipeline.job_id)
    )
    job = job_result.scalar_one()

    cand_result = await db.execute(
        select(Candidate).where(Candidate.id == pipeline.candidate_id)
    )
    candidate = cand_result.scalar_one()

    # Load screening score
    score_result = await db.execute(
        select(ScreeningScore).where(
            ScreeningScore.job_id == pipeline.job_id,
            ScreeningScore.candidate_id == pipeline.candidate_id,
            ScreeningScore.status == "completed",
        )
    )
    score = score_result.scalar_one_or_none()

    # Load all completed evaluations (ordered by creation time)
    evals_result = await db.execute(
        select(InterviewEvaluation)
        .where(
            InterviewEvaluation.job_id == pipeline.job_id,
            InterviewEvaluation.candidate_id == pipeline.candidate_id,
            InterviewEvaluation.status == "completed",
        )
        .order_by(InterviewEvaluation.created_at.asc())
    )
    evaluations = evals_result.scalars().all()

    candidate_name = f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or "Candidate"

    # Build salary range string
    salary_range = "Not specified"
    if job.min_salary and job.max_salary:
        currency = job.currency or ""
        salary_range = f"{job.min_salary:,.0f} – {job.max_salary:,.0f} {currency}".strip()
    elif job.min_salary:
        salary_range = f"From {job.min_salary:,.0f} {job.currency or ''}".strip()
    elif job.max_salary:
        salary_range = f"Up to {job.max_salary:,.0f} {job.currency or ''}".strip()

    # Build evaluations text
    evals_parts = []
    for ev in evaluations:
        report = ev.generated_report or {}
        stage_label = _STAGE_LABELS.get(ev.interview_round, ev.interview_round.replace("_", " ").title())
        fit_score = report.get("fit_score", "N/A")
        rec = report.get("overall_recommendation", "N/A").replace("_", " ")
        summary = report.get("summary", "")
        strengths = "; ".join(report.get("strengths", [])[:3])
        weaknesses = "; ".join(report.get("weaknesses", [])[:2])
        evals_parts.append(
            f"Round: {stage_label} — Fit Score: {fit_score}/100 — Recommendation: {rec}\n"
            f"  Summary: {summary}\n"
            f"  Strengths: {strengths}\n"
            f"  Concerns: {weaknesses}"
        )

    evaluations_text = "\n\n".join(evals_parts) if evals_parts else "No completed evaluations yet."

    # Build prompt
    language_instruction = _LANGUAGE_INSTRUCTIONS.get(language, _LANGUAGE_INSTRUCTIONS["en"])
    prompt = USER_PROMPT_TEMPLATE.format(
        candidate_name=candidate_name,
        job_title=job.title,
        department=job.department,
        seniority_level=job.seniority_level,
        salary_range=salary_range,
        screening_score=f"{float(score.overall_score):.0f}/100" if score else "N/A",
        screening_recommendation=score.recommendation if score else "N/A",
        evaluations_text=evaluations_text,
        language_instruction=language_instruction,
    )

    provider = get_llm_provider()
    response = await provider.generate(
        prompt=prompt,
        system_prompt=SYSTEM_PROMPT,
        temperature=0.2,
        json_mode=True,
    )

    report_data = response.parsed or {
        "overall_recommendation": "hold",
        "confidence": 50,
        "strengths_summary": "Report generation failed — please retry.",
        "risk_summary": "",
        "technical_verdict": "",
        "cultural_verdict": "",
        "salary_recommendation": {"suggested": None, "range": None, "rationale": ""},
        "lessons_learned": [],
        "interview_stages_summary": [],
    }

    # Upsert InterviewDecision record
    existing_result = await db.execute(
        select(InterviewDecision).where(InterviewDecision.pipeline_id == pipeline_id)
    )
    decision = existing_result.scalar_one_or_none()

    if decision:
        decision.generated_report = report_data
        if response.model:
            decision.generation_model = response.model
    else:
        decision = InterviewDecision(
            pipeline_id=pipeline_id,
            job_id=pipeline.job_id,
            candidate_id=pipeline.candidate_id,
            generated_report=report_data,
            generation_model=response.model,
        )
        db.add(decision)

    await db.flush()
    await db.refresh(decision)
    return decision


def build_salary_chatbot_context(
    decision: InterviewDecision,
    job: JobRequisition,
    candidate_name: str,
) -> str:
    """Build the system prompt for the salary/negotiation chatbot."""
    report = decision.generated_report or {}
    salary_rec = report.get("salary_recommendation", {}) or {}
    suggested = salary_rec.get("suggested")
    sal_range = salary_rec.get("range")
    rationale = salary_rec.get("rationale", "")

    salary_range_str = "Not specified"
    if job.min_salary and job.max_salary:
        salary_range_str = f"{job.min_salary:,.0f} – {job.max_salary:,.0f} {job.currency or ''}".strip()

    suggested_str = f"{suggested:,.0f} {job.currency or ''}".strip() if suggested else "Not determined"
    range_str = (
        f"{sal_range[0]:,.0f} – {sal_range[1]:,.0f} {job.currency or ''}".strip()
        if sal_range and len(sal_range) == 2
        else "Not available"
    )

    context = f"""You are an expert HR compensation advisor helping finalize the offer for {candidate_name}.

JOB CONTEXT:
- Position: {job.title} | {job.department} | {job.seniority_level}
- Budgeted Salary Range: {salary_range_str}

AI HIRING RECOMMENDATION: {report.get('overall_recommendation', 'N/A').upper()}
(Confidence: {report.get('confidence', 'N/A')}%)

AI SALARY RECOMMENDATION:
- Suggested: {suggested_str}
- Recommended Range: {range_str}
- Rationale: {rationale}

CANDIDATE STRENGTHS: {report.get('strengths_summary', '')}
CANDIDATE RISKS: {report.get('risk_summary', '')}

Your role: Help HR answer questions about salary negotiation, offer structuring, total compensation, \
and how to handle candidate counter-offers for this specific role and candidate. \
Base your advice on the data above. Be practical, specific, and concise."""

    return context
