import json

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.candidate import Resume, Candidate
from app.llm.factory import get_llm_provider
from app.llm.prompts.resume_extraction import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE
from app.utils.text_extraction import extract_text
from app.utils.anonymizer import anonymize_parsed_data


async def parse_resume(resume: Resume, db: AsyncSession):
    """Parse a resume file: extract text, call LLM, store structured data."""
    # Extract raw text
    raw_text = extract_text(resume.stored_path)
    resume.raw_text = raw_text

    if not raw_text or len(raw_text.strip()) < 50:
        resume.parse_error = "Could not extract meaningful text from file"
        resume.parse_status = "failed"
        return

    # Call LLM for structured extraction
    provider = get_llm_provider()
    prompt = USER_PROMPT_TEMPLATE.format(resume_text=raw_text[:8000])  # Limit text length

    response = await provider.generate(
        prompt=prompt,
        system_prompt=SYSTEM_PROMPT,
        temperature=0.1,
        json_mode=True,
    )

    if response.parsed:
        resume.parsed_data = response.parsed

        # Anonymize for bias-free screening
        resume.anonymized_data = anonymize_parsed_data(response.parsed)

        # Update candidate info from parsed data
        contact = response.parsed.get("contact", {})
        if contact:
            candidate = await db.get(Candidate, resume.candidate_id)
            if candidate:
                if contact.get("name"):
                    parts = contact["name"].split(maxsplit=1)
                    candidate.first_name = parts[0] if parts else None
                    candidate.last_name = parts[1] if len(parts) > 1 else None
                if contact.get("email"):
                    candidate.email = contact["email"]
                if contact.get("phone"):
                    candidate.phone = contact["phone"]
                if contact.get("linkedin"):
                    candidate.linkedin_url = contact["linkedin"]

        resume.parse_status = "completed"
    else:
        resume.parse_error = "LLM did not return valid JSON"
        resume.parse_status = "failed"
