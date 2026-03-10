import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, JSON, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InterviewEvaluation(Base):
    __tablename__ = "interview_evaluations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    job_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("job_requisitions.id"), nullable=False
    )
    candidate_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("candidates.id"), nullable=False
    )
    interview_round: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # phone_screen, round_2, round_3, final
    interviewer_name: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="in_progress"
    )  # in_progress, completed
    questions: Mapped[dict | None] = mapped_column(JSON)
    # JSON array: [{ "id", "text", "category", "order" }]
    answers: Mapped[dict | None] = mapped_column(JSON)
    # JSON object: { question_id: answer_text }
    generated_report: Mapped[dict | None] = mapped_column(JSON)
    # JSON: { "summary", "strengths", "weaknesses", "cultural_fit_assessment",
    #          "technical_assessment", "communication_assessment",
    #          "overall_recommendation", "fit_score", "detailed_notes" }
    evaluation_model: Mapped[str | None] = mapped_column(String(100))
    audio_path: Mapped[str | None] = mapped_column(String(500))
    transcript: Mapped[str | None] = mapped_column(Text)
    transcript_status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="none"
    )  # none | processing | completed | failed
    hr_notes: Mapped[str | None] = mapped_column(Text)
    report_edited: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )  # 0=AI-generated only, 1=manually edited
    primary_language: Mapped[str] = mapped_column(String(10), nullable=False, server_default="en")
    report_translations: Mapped[dict | None] = mapped_column(JSON)
    # JSON: { "en": {report}, "zh": {report} }
    questions_translations: Mapped[dict | None] = mapped_column(JSON)
    # JSON: { "en": [...questions], "zh": [...questions] }
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
