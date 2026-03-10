import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InterviewPipeline(Base):
    __tablename__ = "interview_pipeline"
    __table_args__ = (
        UniqueConstraint("job_id", "candidate_id", name="uq_pipeline_job_candidate"),
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
    current_stage: Mapped[str] = mapped_column(
        String(30), nullable=False, default="hr_interview"
    )  # hr_interview | dept_interview | third_interview | decision
    stage_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )  # pending | in_progress | completed | rejected
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    promoted_by: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
