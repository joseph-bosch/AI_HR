import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.candidate import Resume, ScreeningScore
from app.models.job import JobRequisition
from app.llm.factory import get_llm_provider
from app.llm.prompts.candidate_scoring import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE

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
    # Get job
    job_result = await db.execute(
        select(JobRequisition).where(JobRequisition.id == job_id)
    )
    job = job_result.scalar_one()

    # Get resume anonymized data
    resume_result = await db.execute(
        select(Resume).where(Resume.id == resume_id)
    )
    resume = resume_result.scalar_one()

    if not resume.anonymized_data:
        raise ValueError("Resume has no anonymized data")

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
    response = await provider.generate(
        prompt=prompt,
        system_prompt=SYSTEM_PROMPT,
        temperature=0.1,
        json_mode=True,
    )

    if not response.parsed:
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
