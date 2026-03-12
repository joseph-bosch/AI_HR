import uuid
from datetime import datetime

from sqlalchemy import String, Text, Integer, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OfferTemplate(Base):
    __tablename__ = "offer_templates"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str | None] = mapped_column(String(255))
    role_type: Mapped[str | None] = mapped_column(String(100))
    content: Mapped[str] = mapped_column(Text, nullable=False)  # Template with {{placeholders}}
    placeholders: Mapped[dict | None] = mapped_column(JSON)  # JSON array of placeholder names
    is_active: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class GeneratedOffer(Base):
    __tablename__ = "generated_offers"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    job_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("job_requisitions.id"), nullable=False
    )
    candidate_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("candidates.id"), nullable=False
    )
    template_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("offer_templates.id")
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    offer_data: Mapped[dict | None] = mapped_column(JSON)
    # JSON: { "salary", "start_date", "benefits", "signing_bonus", etc. }
    pdf_path: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="draft"
    )  # draft, approved, sent, accepted, declined
    generation_model: Mapped[str | None] = mapped_column(String(100))
    primary_language: Mapped[str] = mapped_column(String(10), nullable=False, server_default="en")
    content_translations: Mapped[dict | None] = mapped_column(JSON)
    # JSON: { "zh": "Chinese offer letter text...", "en": "English offer letter text..." }
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
