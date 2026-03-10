from datetime import datetime

from pydantic import BaseModel


class CandidateCreate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    source: str = "upload"
    notes: str | None = None


class CandidateUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    status: str | None = None
    notes: str | None = None


class CandidateResponse(BaseModel):
    id: str
    first_name: str | None
    last_name: str | None
    email: str | None
    phone: str | None
    linkedin_url: str | None
    status: str
    source: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ResumeResponse(BaseModel):
    id: str
    candidate_id: str
    original_filename: str
    file_type: str
    file_size_bytes: int | None
    parsed_data: dict | None
    anonymized_data: dict | None
    parse_status: str
    parse_error: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ScreeningScoreResponse(BaseModel):
    id: str
    job_id: str
    candidate_id: str
    resume_id: str
    overall_score: float
    skill_match_score: float | None
    experience_score: float | None
    education_score: float | None
    explanation: str
    strengths: list[str] | None
    weaknesses: list[str] | None
    recommendation: str | None
    scoring_model: str | None
    status: str
    primary_language: str | None
    score_translations: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CandidateWithScore(BaseModel):
    candidate: CandidateResponse
    resume: ResumeResponse | None
    score: ScreeningScoreResponse | None


class ScreeningRequest(BaseModel):
    job_id: str
    candidate_id: str
    language: str | None = None


class BatchScreeningRequest(BaseModel):
    job_id: str
    language: str | None = None


class ShortlistRequest(BaseModel):
    job_id: str
    top_n: int = 10


class DuplicateCheckRequest(BaseModel):
    job_id: str
    candidate_ids: list[str]


class DuplicateInfo(BaseModel):
    new_candidate_id: str
    new_candidate_name: str
    existing_candidate_id: str
    existing_candidate_name: str


class ResolveDuplicateRequest(BaseModel):
    new_candidate_id: str
    existing_candidate_id: str
    job_id: str
    action: str  # "skip" | "replace"
