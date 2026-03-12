import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.candidate import Resume, ScreeningScore
from app.models.job import JobRequisition
from app.llm.factory import get_llm_provider
from app.llm.prompts.candidate_scoring import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE
from app.utils.anonymizer import anonymize_parsed_data

logger = logging.getLogger(__name__)

_LANGUAGE_INSTRUCTIONS = {
    "zh": "IMPORTANT: Generate ALL text content (explanation, strengths, weaknesses) in Chinese (Simplified).",
    "en": "IMPORTANT: Generate ALL text content in English.",
}


def _format_weighted(items: list | None) -> str:
    """Format requirements/skills with normalized weight percentages for the LLM prompt.

    Accepts both legacy string arrays ["React"] and weighted dicts [{"text": "React", "weight": 5}].
    Returns a JSON array like ["React (40%)", "Node.js (30%)"] so the LLM understands relative importance.
    """
    if not items:
        return "[]"
    parsed = []
    for item in items:
        if isinstance(item, str):
            parsed.append({"text": item, "weight": 5})
        elif isinstance(item, dict):
            parsed.append({"text": item.get("text", ""), "weight": int(item.get("weight", 5))})
    parsed = [p for p in parsed if p["text"]]
    if not parsed:
        return "[]"
    total = sum(p["weight"] for p in parsed)
    result = [
        f"{p['text']} ({round(p['weight'] / total * 100) if total else 0}%)"
        for p in parsed
    ]
    return json.dumps(result, ensure_ascii=False)


async def score_candidate(
    job_id: str, candidate_id: str, resume_id: str, db: AsyncSession, language: str = "en"
):
    """Score a candidate against a job description using anonymized data."""
    logger.info("Starting screening for job_id=%s candidate_id=%s resume_id=%s lang=%s", job_id, candidate_id, resume_id, language)

    # Get job
    job_result = await db.execute(
        select(JobRequisition).where(JobRequisition.id == job_id)
    )
    job = job_result.scalar_one()
    logger.info("Job loaded: %s (%s)", job.title, job.department)

    # Get resume anonymized data
    resume_result = await db.execute(
        select(Resume).where(Resume.id == resume_id)
    )
    resume = resume_result.scalar_one()

    logger.info(
        "Resume %s: parse_status=%s, has_parsed_data=%s, has_anonymized_data=%s, has_raw_text=%s",
        resume_id, resume.parse_status,
        resume.parsed_data is not None,
        resume.anonymized_data is not None,
        resume.raw_text is not None,
    )

    if not resume.anonymized_data:
        if resume.parsed_data:
            logger.warning("Resume %s has parsed_data but no anonymized_data — generating now", resume_id)
            resume.anonymized_data = anonymize_parsed_data(resume.parsed_data)
            await db.flush()
        else:
            # Both parsed_data and anonymized_data are missing — re-parse from file
            logger.warning("Resume %s missing parsed data — re-parsing from file: %s", resume_id, resume.stored_path)
            from app.services.resume_parser import parse_resume
            await parse_resume(resume, db)
            await db.flush()
            if not resume.anonymized_data:
                raise ValueError(f"Resume {resume_id} re-parse failed (stored_path={resume.stored_path})")

    lang = language or "en"
    language_instruction = _LANGUAGE_INSTRUCTIONS.get(lang, _LANGUAGE_INSTRUCTIONS["en"])

    # Build prompt
    prompt = USER_PROMPT_TEMPLATE.format(
        job_title=job.title,
        department=job.department,
        seniority_level=job.seniority_level,
        job_description=job.description,
        requirements=_format_weighted(job.requirements),
        preferred_skills=_format_weighted(job.preferred_skills),
        candidate_profile=json.dumps(resume.anonymized_data, indent=2),
        language_instruction=language_instruction,
    )

    provider = get_llm_provider()
    logger.info("Calling LLM for screening (model: %s)...", provider.model if hasattr(provider, 'model') else 'unknown')
    response = await provider.generate(
        prompt=prompt,
        system_prompt=SYSTEM_PROMPT,
        temperature=0.1,
        max_tokens=8192,
        json_mode=True,
    )
    logger.info("LLM response received (duration: %.0fms, tokens: %s)", response.duration_ms or 0, response.completion_tokens)

    if not response.parsed:
        logger.error("LLM returned invalid JSON. Raw content: %s", response.content[:500])
        raise ValueError("LLM did not return valid scoring JSON")

    data = response.parsed

    # Update score record
    score_result = await db.execute(
        select(ScreeningScore).where(
            ScreeningScore.job_id == job_id,
            ScreeningScore.candidate_id == candidate_id,
        )
    )
    score = score_result.scalar_one()

    score.overall_score = float(data.get("overall_score", 0))
    score.skill_match_score = float(data.get("skill_match_score", 0))
    score.experience_score = float(data.get("experience_score", 0))
    score.education_score = float(data.get("education_score", 0))
    score.explanation = data.get("explanation", "")
    score.strengths = data.get("strengths", [])
    score.weaknesses = data.get("weaknesses", [])
    score.recommendation = data.get("recommendation", "maybe")
    score.additional_insights = data.get("additional_insights") or None
    score.scoring_model = response.model
    score.primary_language = lang
    score.status = "completed"

    await db.commit()
    logger.info("Screening completed for candidate_id=%s — score=%.1f recommendation=%s", candidate_id, score.overall_score, score.recommendation)
