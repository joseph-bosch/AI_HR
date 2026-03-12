import json

from app.models.job import JobRequisition
from app.models.question_set import QuestionSet, QuestionSetItem
from app.llm.factory import get_llm_provider
from app.llm.prompts.question_curation import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE
from app.services.screening_service import _format_weighted

_LANGUAGE_INSTRUCTIONS = {
    "zh": "IMPORTANT: Generate ALL text content in Chinese (Simplified). This includes questions, guidance, indicators, descriptions, and rubric entries.",
    "en": "IMPORTANT: Generate ALL text content in English.",
}


_DEFAULT_COUNT_INSTRUCTION = (
    "Generate 5-8 questions distributed across these categories:\n"
    "- behavioral (STAR format - short explanation of what STAR is): 2 questions about past experiences\n"
    "- situational: 1-2 hypothetical scenario questions\n"
    "- technical: 1-2 role-specific technical/domain questions\n"
    "- culture_fit: 1 question about work style and values"
)

_CATEGORY_LABELS = {
    "behavioral": "behavioral",
    "situational": "situational",
    "technical": "technical",
    "culture_fit": "culture_fit",
}


def _build_count_instruction(total_count: int | None, category_counts: dict[str, int] | None) -> str:
    if category_counts:
        total = total_count or sum(category_counts.values())
        lines = [f"  - {_CATEGORY_LABELS.get(cat, cat)}: {count} question{'s' if count != 1 else ''}"
                 for cat, count in category_counts.items() if count > 0]
        return f"Generate exactly {total} questions with the following category breakdown:\n" + "\n".join(lines)
    if total_count:
        return (
            f"Generate exactly {total_count} questions distributed across these categories:\n"
            "- behavioral (STAR format - short explanation of what STAR is)\n"
            "- situational (hypothetical scenarios)\n"
            "- technical (role-specific)\n"
            "- culture_fit (work style and values)"
        )
    return _DEFAULT_COUNT_INSTRUCTION


async def generate_questions(
    job: JobRequisition,
    interview_round: str,
    preferences: str | None = None,
    language: str | None = None,
    total_count: int | None = None,
    category_counts: dict[str, int] | None = None,
) -> tuple[QuestionSet, list[QuestionSetItem]]:
    """Generate a question set for a job and interview round."""
    preferences_section = ""
    if preferences:
        preferences_section = f"\nADDITIONAL PREFERENCES:\n{preferences}"

    lang = language or "en"
    language_instruction = _LANGUAGE_INSTRUCTIONS.get(lang, _LANGUAGE_INSTRUCTIONS["en"])

    prompt = USER_PROMPT_TEMPLATE.format(
        job_title=job.title,
        department=job.department,
        seniority_level=job.seniority_level,
        requirements=_format_weighted(job.requirements),
        preferred_skills=_format_weighted(job.preferred_skills),
        interview_round=interview_round,
        preferences_section=preferences_section,
        language_instruction=language_instruction,
        count_instruction=_build_count_instruction(total_count, category_counts),
    )

    provider = get_llm_provider()
    response = await provider.generate(
        prompt=prompt,
        system_prompt=SYSTEM_PROMPT,
        temperature=0.3,
        max_tokens=8192,
        json_mode=True,
    )

    question_set = QuestionSet(
        job_id=job.id,
        name=f"{job.title} - {interview_round.replace('_', ' ').title()}",
        interview_round=interview_round,
        status="draft",
        generation_model=response.model,
        primary_language=lang,
    )

    items = []
    questions_data = []
    if isinstance(response.parsed, list):
        questions_data = response.parsed
    elif isinstance(response.parsed, dict):
        if "questions" in response.parsed:
            questions_data = response.parsed["questions"]
        else:
            # Fallback: find the first list value in the dict
            for val in response.parsed.values():
                if isinstance(val, list):
                    questions_data = val
                    break

    _category_normalizer = {
        "culture fit": "culture_fit",
        "culture-fit": "culture_fit",
        "culturefit": "culture_fit",
    }

    if not questions_data:
        raise ValueError(
            f"LLM returned no questions. Raw response: {response.content[:500]}"
        )

    def _to_str(val) -> str | None:
        """Convert lists/dicts to readable strings for Text columns."""
        if val is None:
            return None
        if isinstance(val, list):
            return "\n".join(str(v) for v in val)
        if isinstance(val, dict):
            return json.dumps(val, ensure_ascii=False)
        return str(val)

    for q in questions_data:
        rubric = q.get("scoring_rubric")
        if isinstance(rubric, str):
            try:
                rubric = json.loads(rubric)
            except json.JSONDecodeError:
                rubric = None

        raw_category = q.get("category", "behavioral")
        category = _category_normalizer.get(raw_category.lower().strip(), raw_category)

        item = QuestionSetItem(
            category=category,
            question_text=q.get("question_text", ""),
            interviewer_guidance=_to_str(q.get("interviewer_guidance")),
            good_answer_indicators=_to_str(q.get("good_answer_indicators")),
            red_flags=_to_str(q.get("red_flags")),
            scoring_rubric=rubric,
        )
        items.append(item)

    return question_set, items
