import uuid
from datetime import datetime

from sqlalchemy import String, Text, Integer, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class QuestionSet(Base):
    __tablename__ = "question_sets"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    job_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("job_requisitions.id"), nullable=False
    )
    candidate_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("candidates.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    interview_round: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # phone_screen, round_2, round_3
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="draft"
    )  # draft, finalized
    generation_model: Mapped[str | None] = mapped_column(String(100))
    pdf_path: Mapped[str | None] = mapped_column(String(500))
    primary_language: Mapped[str] = mapped_column(String(10), nullable=False, server_default="en")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    items: Mapped[list["QuestionSetItem"]] = relationship(
        back_populates="question_set", cascade="all, delete-orphan",
        order_by="QuestionSetItem.sort_order"
    )


class QuestionSetItem(Base):
    __tablename__ = "question_set_items"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    question_set_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("question_sets.id", ondelete="CASCADE"), nullable=False
    )
    category: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # behavioral, situational, technical, culture_fit
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    interviewer_guidance: Mapped[str | None] = mapped_column(Text)
    good_answer_indicators: Mapped[str | None] = mapped_column(Text)
    red_flags: Mapped[str | None] = mapped_column(Text)
    scoring_rubric: Mapped[dict | None] = mapped_column(JSON)
    # JSON: { "1": "Poor...", "2": "Below...", "3": "Meets...", "4": "Exceeds...", "5": "Exceptional..." }
    translations: Mapped[dict | None] = mapped_column(JSON)  # {"en": {...}, "zh": {...}}
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_required: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    question_set: Mapped["QuestionSet"] = relationship(back_populates="items")
