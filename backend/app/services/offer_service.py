import re

from app.models.offer import OfferTemplate
from app.models.job import JobRequisition
from app.models.candidate import Candidate
from app.llm.factory import get_llm_provider
from app.llm.prompts.offer_letter import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE, LANGUAGE_INSTRUCTIONS


async def generate_offer_letter(
    template: OfferTemplate,
    job: JobRequisition,
    candidate: Candidate,
    offer_data: dict,
    language: str | None = None,
) -> tuple[str, str]:
    """Generate an offer letter from template + AI polishing. Returns (content, model_used)."""
    candidate_name = f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or "Candidate"

    # Step 1: Simple placeholder substitution
    content = template.content

    replacements = {
        "candidate_name": candidate_name,
        "position_title": job.title,
        "department": job.department,
        "job_title": job.title,
        **{k: str(v) for k, v in offer_data.items()},
    }

    for key, value in replacements.items():
        content = content.replace(f"{{{{{key}}}}}", value)

    # Step 2: LLM polish
    prompt = USER_PROMPT_TEMPLATE.format(
        draft_content=content,
        job_title=job.title,
        department=job.department,
        candidate_name=candidate_name,
        company_context=f"Position in {job.department} department, {job.seniority_level} level",
        language_instruction=LANGUAGE_INSTRUCTIONS.get(language or "en", ""),
    )

    provider = get_llm_provider()
    response = await provider.generate(
        prompt=prompt,
        system_prompt=SYSTEM_PROMPT,
        temperature=0.3,
    )

    return response.content, response.model
