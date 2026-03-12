import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InterviewDecision(Base):
    __tablename__ = "interview_decisions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    pipeline_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("interview_pipeline.id", ondelete="CASCADE"), nullable=False
    )
    job_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("job_requisitions.id"), nullable=False
    )
    candidate_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("candidates.id"), nullable=False
    )
    final_decision: Mapped[str | None] = mapped_column(
        String(20)
    )  # hire | reject | hold
    decision_reason: Mapped[str | None] = mapped_column(Text)
    generated_report: Mapped[dict | None] = mapped_column(JSON)
    # {
    #   "overall_recommendation": "hire|reject|hold",
    #   "confidence": 0-100,
    #   "strengths_summary": "...",
    #   "risk_summary": "...",
    #   "technical_verdict": "...",
    #   "cultural_verdict": "...",
    #   "salary_recommendation": { "suggested": 85000, "range": [80000, 95000], "rationale": "..." },
    #   "lessons_learned": ["...", "..."],
    #   "interview_stages_summary": [{ "stage": "hr_interview", "fit_score": 78, "summary": "..." }]
    # }
    generation_model: Mapped[str | None] = mapped_column(String(100))
    primary_language: Mapped[str] = mapped_column(String(10), nullable=False, server_default="en")
    report_translations: Mapped[dict | None] = mapped_column(JSON)
    # JSON: { "zh": { "strengths_summary": "...", "risk_summary": "...", ... } }
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
