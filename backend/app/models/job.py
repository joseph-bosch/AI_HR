import uuid
from datetime import datetime

from sqlalchemy import String, Text, Numeric, DateTime, JSON, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class JobRequisition(Base):
    __tablename__ = "job_requisitions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str] = mapped_column(String(255), nullable=False)
    seniority_level: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # junior, mid, senior, lead, director
    employment_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="full-time"
    )
    location: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    requirements: Mapped[dict | None] = mapped_column(JSON)  # JSON array of strings
    preferred_skills: Mapped[dict | None] = mapped_column(JSON)  # JSON array of strings
    min_salary: Mapped[float | None] = mapped_column(Numeric(12, 2))
    max_salary: Mapped[float | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    benefits: Mapped[dict | None] = mapped_column(JSON)  # JSON array of strings
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="open"
    )  # draft, open, closed, filled
    target_score: Mapped[int | None] = mapped_column(Integer)  # pass threshold 0-100
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
