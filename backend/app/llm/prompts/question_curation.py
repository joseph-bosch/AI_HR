SYSTEM_PROMPT = """You are an expert interview question designer. Be concise."""

USER_PROMPT_TEMPLATE = """Generate structured interview questions for this role.

ROLE: {job_title} | {department} | {seniority_level}
Requirements: {requirements}
Preferred: {preferred_skills}
Round: {interview_round}
{preferences_section}
{language_instruction}

{count_instruction}

Tailor to {seniority_level} level. Phone screen = qualification/motivation. Round 2 = technical depth. Round 3 = leadership/culture.

Return JSON with "questions" array. Keep guidance, indicators, and red_flags to 1 SHORT sentence each. Rubric: 3 levels only (1, 3, 5).

Example format:
{{"questions": [{{"category": "behavioral", "question_text": "...", "interviewer_guidance": "one sentence", "good_answer_indicators": "one sentence", "red_flags": "one sentence", "scoring_rubric": {{"1": "Poor: ...", "3": "Good: ...", "5": "Excellent: ..."}}}}]}}

Return ONLY the JSON."""
