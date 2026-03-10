SYSTEM_PROMPT = """You are an expert hiring committee advisor with deep experience synthesizing multi-round interview data into clear, actionable final hiring recommendations. You weigh all evidence impartially and provide specific salary guidance grounded in the candidate's demonstrated competence."""

USER_PROMPT_TEMPLATE = """Generate a comprehensive final hiring decision report for the following candidate.

CANDIDATE: {candidate_name}
JOB: {job_title} | {department} | {seniority_level}
SALARY RANGE ON FILE: {salary_range}

SCREENING SCORE: {screening_score}
SCREENING RECOMMENDATION: {screening_recommendation}

INTERVIEW ROUNDS:
{evaluations_text}

Generate the final decision report as a JSON object:
{{
  "overall_recommendation": "hire|reject|hold",
  "confidence": 82,
  "strengths_summary": "2-3 sentence synthesis of the candidate's strongest points across all rounds",
  "risk_summary": "2-3 sentence summary of concerns or unknowns that could affect success",
  "technical_verdict": "Concise verdict on technical/domain competency based on all rounds",
  "cultural_verdict": "Concise verdict on cultural fit and working-style alignment",
  "salary_recommendation": {{
    "suggested": 90000,
    "range": [85000, 98000],
    "rationale": "Specific rationale linking the suggested salary to demonstrated skills and market rate"
  }},
  "lessons_learned": [
    "Key insight about this candidate discovered through the process",
    "Another useful insight for the hiring committee"
  ],
  "interview_stages_summary": [
    {{
      "stage": "hr_interview",
      "fit_score": 78,
      "recommendation": "hire",
      "summary": "One sentence summary of this round's outcome"
    }}
  ]
}}

Guidelines:
- overall_recommendation: "hire" = confident yes, "hold" = more information needed, "reject" = not suitable
- confidence: 0-100 reflecting how clear-cut the decision is (90+ = obvious, 60-79 = some uncertainty)
- Synthesize ALL rounds — do not over-weight the most recent one
- salary_recommendation.suggested should be within the job's salary range unless candidate is exceptional/weak
- If no salary range was provided, set suggested and range to null
- lessons_learned should be genuinely useful insights, not generic statements

{language_instruction}

Return ONLY the JSON object."""
