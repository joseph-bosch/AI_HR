from datetime import datetime

from pydantic import BaseModel


class QuestionSetGenerate(BaseModel):
    job_id: str
    interview_round: str  # phone_screen, round_2, round_3
    preferences: str | None = None  # Optional instructions for question generation
    language: str | None = None  # e.g. "zh" or "en"
    total_count: int | None = None  # Total number of questions to generate
    category_counts: dict[str, int] | None = None  # e.g. {"behavioral": 3, "technical": 2}


class QuestionItemCreate(BaseModel):
    category: str  # behavioral, situational, technical, culture_fit
    question_text: str
    interviewer_guidance: str | None = None
    good_answer_indicators: str | None = None
    red_flags: str | None = None
    scoring_rubric: dict | None = None
    is_required: int = 1


class QuestionItemUpdate(BaseModel):
    category: str | None = None
    question_text: str | None = None
    interviewer_guidance: str | None = None
    good_answer_indicators: str | None = None
    red_flags: str | None = None
    scoring_rubric: dict | None = None
    translations: dict | None = None
    is_required: int | None = None


class QuestionItemResponse(BaseModel):
    id: str
    question_set_id: str
    category: str
    question_text: str
    interviewer_guidance: str | None
    good_answer_indicators: str | None
    red_flags: str | None
    scoring_rubric: dict | None
    translations: dict | None
    sort_order: int
    is_required: int
    created_at: datetime

    model_config = {"from_attributes": True}


class QuestionSetResponse(BaseModel):
    id: str
    job_id: str
    name: str
    interview_round: str
    status: str
    generation_model: str | None
    pdf_path: str | None
    primary_language: str
    created_at: datetime
    updated_at: datetime
    items: list[QuestionItemResponse] | None = None

    model_config = {"from_attributes": True}


class ReorderRequest(BaseModel):
    item_ids: list[str]  # Ordered list of question item IDs
