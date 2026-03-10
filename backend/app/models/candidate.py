import uuid
from datetime import datetime

from sqlalchemy import String, Text, UnicodeText, Integer, Numeric, DateTime, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    first_name: Mapped[str | None] = mapped_column(String(255))
    last_name: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    linkedin_url: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="new"
    )  # new, screening, shortlisted, interviewing, offered, hired, rejected
    source: Mapped[str | None] = mapped_column(String(100))  # upload, manual
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    resumes: Mapped[list["Resume"]] = relationship(back_populates="candidate", cascade="all, delete-orphan")
    screening_scores: Mapped[list["ScreeningScore"]] = relationship(back_populates="candidate", passive_deletes=True)


class Resume(Base):
    __tablename__ = "resumes"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    candidate_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False
    )
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(10), nullable=False)  # pdf, docx
    file_size_bytes: Mapped[int | None] = mapped_column(Integer)
    raw_text: Mapped[str | None] = mapped_column(Text)
    parsed_data: Mapped[dict | None] = mapped_column(JSON)
    anonymized_data: Mapped[dict | None] = mapped_column(JSON)
    parse_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )  # pending, processing, completed, failed
    parse_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    candidate: Mapped["Candidate"] = relationship(back_populates="resumes")


class ScreeningScore(Base):
    __tablename__ = "screening_scores"
    __table_args__ = (
        UniqueConstraint("job_id", "candidate_id", name="uq_screening_job_candidate"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    job_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("job_requisitions.id", ondelete="CASCADE"), nullable=False
    )
    candidate_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False
    )
    resume_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("resumes.id", ondelete="NO ACTION"), nullable=False
    )
    overall_score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    skill_match_score: Mapped[float | None] = mapped_column(Numeric(5, 2))
    experience_score: Mapped[float | None] = mapped_column(Numeric(5, 2))
    education_score: Mapped[float | None] = mapped_column(Numeric(5, 2))
    explanation: Mapped[str] = mapped_column(UnicodeText, nullable=False)
    strengths: Mapped[dict | None] = mapped_column(JSON)  # JSON array
    weaknesses: Mapped[dict | None] = mapped_column(JSON)  # JSON array
    recommendation: Mapped[str | None] = mapped_column(
        String(20)
    )  # strong_yes, yes, maybe, no
    scoring_model: Mapped[str | None] = mapped_column(String(100))
    additional_insights: Mapped[dict | None] = mapped_column(JSON)
    # { "career_trajectory": "...", "standout_qualities": [...], "risk_flags": [...], "cultural_indicators": "..." }
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )  # pending, processing, completed, failed
    primary_language: Mapped[str] = mapped_column(String(10), nullable=False, server_default="en")
    score_translations: Mapped[dict | None] = mapped_column(JSON)
    # JSON: { "zh": {"explanation": "...", "strengths": [...], "weaknesses": [...]} }
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    candidate: Mapped["Candidate"] = relationship(back_populates="screening_scores")
