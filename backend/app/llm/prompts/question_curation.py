SYSTEM_PROMPT = """You are an expert interview question designer with deep knowledge of structured interviewing best practices. You create questions that effectively assess candidates while being fair, legal, and aligned with the specific role requirements."""

USER_PROMPT_TEMPLATE = """Generate a comprehensive set of structured interview questions for the following role and interview round.

JOB DETAILS:
- Title: {job_title}
- Department: {department}
- Seniority Level: {seniority_level}
- Key Requirements: {requirements}
- Preferred Skills: {preferred_skills}
- Interview Round: {interview_round}
{preferences_section}
{language_instruction}

{count_instruction}

For each question, provide:
1. The question text
2. Interviewer guidance (tips for asking and probing)
3. What good answers look like
4. Red flags to watch for
5. A 5-point scoring rubric

Return a JSON object with a "questions" key containing the array:
{{
  "questions": [
    {{
      "category": "behavioral",
      "question_text": "Tell me about a time when...",
      "interviewer_guidance": "Listen for specific examples using the STAR method...",
      "good_answer_indicators": "Candidate provides concrete example with measurable outcomes...",
      "red_flags": "Vague responses, blaming others, cannot provide specific examples...",
      "scoring_rubric": {{
        "1": "Cannot provide relevant example; response is vague or off-topic",
        "2": "Provides a weak example with limited detail or unclear outcomes",
        "3": "Provides a solid example with clear situation, actions, and results",
        "4": "Provides a strong example demonstrating significant impact and learning",
        "5": "Exceptional response with multiple examples showing growth, leadership, and measurable impact"
      }}
    }}
  ]
}}

Tailor questions to the {seniority_level} level and {interview_round} round:
- Phone screen: Focus on qualification verification, motivation, basic competency
- Round 2: Deep technical assessment, problem-solving, collaboration
- Round 3: Leadership, strategic thinking, cultural alignment

Return ONLY the JSON object."""
