from datetime import datetime

from pydantic import BaseModel


class JobCreate(BaseModel):
    title: str
    department: str
    seniority_level: str
    employment_type: str = "full-time"
    location: str | None = None
    description: str
    requirements: list | None = None
    preferred_skills: list | None = None
    min_salary: float | None = None
    max_salary: float | None = None
    currency: str = "USD"
    benefits: list[str] | None = None
    status: str = "open"
    target_score: int | None = None


class JobUpdate(BaseModel):
    title: str | None = None
    department: str | None = None
    seniority_level: str | None = None
    employment_type: str | None = None
    location: str | None = None
    description: str | None = None
    requirements: list | None = None
    preferred_skills: list | None = None
    min_salary: float | None = None
    max_salary: float | None = None
    currency: str | None = None
    benefits: list[str] | None = None
    status: str | None = None
    target_score: int | None = None


class JobResponse(BaseModel):
    id: str
    title: str
    department: str
    seniority_level: str
    employment_type: str
    location: str | None
    description: str
    requirements: list | None
    preferred_skills: list | None
    min_salary: float | None
    max_salary: float | None
    currency: str
    benefits: list[str] | None
    status: str
    target_score: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class JobStats(BaseModel):
    job_id: str
    total_candidates: int
    screened_candidates: int
    shortlisted_candidates: int
    avg_score: float | None
    status: str
