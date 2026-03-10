import json

from app.models.interview import InterviewEvaluation
from app.models.job import JobRequisition
from app.models.candidate import Candidate
from app.llm.factory import get_llm_provider
from app.llm.prompts.interview_questions import (
    SYSTEM_PROMPT as Q_SYSTEM_PROMPT,
    USER_PROMPT_TEMPLATE as Q_USER_PROMPT,
)
from app.llm.prompts.evaluation_report import (
    SYSTEM_PROMPT as R_SYSTEM_PROMPT,
    USER_PROMPT_TEMPLATE as R_USER_PROMPT,
)
from app.llm.prompts.eval_from_transcript import (
    SYSTEM_PROMPT as T_SYSTEM_PROMPT,
    USER_PROMPT_TEMPLATE as T_USER_PROMPT,
)

_LANGUAGE_INSTRUCTIONS = {
    "zh": "IMPORTANT: Generate ALL text content in Chinese (Simplified).",
    "en": "IMPORTANT: Generate ALL text content in English.",
}


async def generate_evaluation_questions(
    job: JobRequisition,
    candidate: Candidate,
    interview_round: str,
    language: str | None = None,
) -> list[dict]:
    """Generate contextual evaluation questions for HR to answer after an interview."""
    candidate_name = f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or "Candidate"
    lang = language or "en"
    language_instruction = _LANGUAGE_INSTRUCTIONS.get(lang, _LANGUAGE_INSTRUCTIONS["en"])

    prompt = Q_USER_PROMPT.format(
        job_title=job.title,
        department=job.department,
        seniority_level=job.seniority_level,
        interview_round=interview_round,
        requirements=json.dumps(job.requirements or []),
        candidate_name=candidate_name,
        language_instruction=language_instruction,
    )

    provider = get_llm_provider()
    response = await provider.generate(
        prompt=prompt,
        system_prompt=Q_SYSTEM_PROMPT,
        temperature=0.3,
        json_mode=True,
    )

    if response.parsed:
        if isinstance(response.parsed, list):
            return response.parsed
        if isinstance(response.parsed, dict):
            if "questions" in response.parsed:
                return response.parsed["questions"]
            # Fallback: find the first list value in the dict
            for val in response.parsed.values():
                if isinstance(val, list):
                    return val

    return [
        {"id": "q1", "text": "How would you rate the candidate's overall interview performance?", "category": "overall", "order": 1},
        {"id": "q2", "text": "What technical skills did the candidate demonstrate?", "category": "technical", "order": 2},
        {"id": "q3", "text": "How was the candidate's communication style?", "category": "communication", "order": 3},
        {"id": "q4", "text": "Do you see any cultural fit concerns?", "category": "cultural_fit", "order": 4},
        {"id": "q5", "text": "What is your overall recommendation?", "category": "overall", "order": 5},
    ]


async def generate_evaluation_report(
    evaluation: InterviewEvaluation,
    job: JobRequisition,
    candidate: Candidate,
    language: str | None = None,
) -> dict:
    """Generate a structured evaluation report from Q&A answers."""
    candidate_name = f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or "Candidate"
    lang = language or evaluation.primary_language or "en"
    language_instruction = _LANGUAGE_INSTRUCTIONS.get(lang, _LANGUAGE_INSTRUCTIONS["en"])

    # Build Q&A pairs string
    qa_parts = []
    questions = evaluation.questions or []
    answers = evaluation.answers or {}

    for q in questions:
        q_id = q.get("id", "")
        q_text = q.get("text", "")
        answer = answers.get(q_id, "No answer provided")
        qa_parts.append(f"Q: {q_text}\nA: {answer}")

    qa_text = "\n\n".join(qa_parts)

    prompt = R_USER_PROMPT.format(
        job_title=job.title,
        department=job.department,
        seniority_level=job.seniority_level,
        interview_round=evaluation.interview_round,
        candidate_name=candidate_name,
        interviewer_name=evaluation.interviewer_name or "HR",
        qa_pairs=qa_text,
        language_instruction=language_instruction,
    )

    provider = get_llm_provider()
    response = await provider.generate(
        prompt=prompt,
        system_prompt=R_SYSTEM_PROMPT,
        temperature=0.2,
        json_mode=True,
    )

    if response.parsed:
        evaluation.evaluation_model = response.model
        return response.parsed

    return {
        "summary": "Report generation failed - please try again.",
        "strengths": [],
        "weaknesses": [],
        "cultural_fit_assessment": "",
        "technical_assessment": "",
        "communication_assessment": "",
        "overall_recommendation": "no_hire",
        "fit_score": 0,
        "detailed_notes": "The AI was unable to generate a proper report from the provided answers.",
    }


async def generate_evaluation_report_from_transcript(
    evaluation: InterviewEvaluation,
    job: JobRequisition,
    candidate: Candidate,
    language: str | None = None,
) -> dict:
    """Generate a structured evaluation report from a diarized audio transcript."""
    candidate_name = f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() or "Candidate"
    lang = language or evaluation.primary_language or "en"
    language_instruction = _LANGUAGE_INSTRUCTIONS.get(lang, _LANGUAGE_INSTRUCTIONS["en"])

    prompt = T_USER_PROMPT.format(
        job_title=job.title,
        department=job.department,
        seniority_level=job.seniority_level,
        interview_round=evaluation.interview_round,
        candidate_name=candidate_name,
        transcript=evaluation.transcript or "",
        language_instruction=language_instruction,
    )

    provider = get_llm_provider()
    response = await provider.generate(
        prompt=prompt,
        system_prompt=T_SYSTEM_PROMPT,
        temperature=0.2,
        json_mode=True,
    )

    if response.parsed:
        evaluation.evaluation_model = response.model
        return response.parsed

    return {
        "summary": "Report generation failed - please try again.",
        "strengths": [],
        "weaknesses": [],
        "cultural_fit_assessment": "",
        "technical_assessment": "",
        "communication_assessment": "",
        "overall_recommendation": "no_hire",
        "fit_score": 0,
        "detailed_notes": "The AI was unable to generate a report from the transcript.",
    }
