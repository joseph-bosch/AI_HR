from datetime import datetime

from pydantic import BaseModel


class EvaluationCreate(BaseModel):
    job_id: str
    candidate_id: str
    interview_round: str  # phone_screen, round_2, round_3, final
    interviewer_name: str | None = None
    language: str | None = None  # e.g. "zh" or "en"


class AnswerSubmit(BaseModel):
    question_id: str
    answer: str


class EvaluationQuestion(BaseModel):
    id: str
    text: str
    category: str
    order: int


class EvaluationReport(BaseModel):
    summary: str
    strengths: list[str]
    weaknesses: list[str]
    cultural_fit_assessment: str
    technical_assessment: str
    communication_assessment: str
    overall_recommendation: str  # strong_hire, hire, no_hire, strong_no_hire
    fit_score: float
    detailed_notes: str


class EvaluationResponse(BaseModel):
    id: str
    job_id: str
    candidate_id: str
    interview_round: str
    interviewer_name: str | None
    status: str
    questions: list[EvaluationQuestion] | None
    answers: dict | None
    generated_report: EvaluationReport | None
    evaluation_model: str | None
    primary_language: str | None
    report_translations: dict | None
    questions_translations: dict | None
    audio_path: str | None = None
    transcript: str | None = None
    transcript_status: str = "none"
    hr_notes: str | None = None
    report_edited: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UpdateReportRequest(BaseModel):
    generated_report: dict | None = None
    hr_notes: str | None = None
