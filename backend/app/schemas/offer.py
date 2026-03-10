from datetime import datetime

from pydantic import BaseModel


class TemplateCreate(BaseModel):
    name: str
    department: str | None = None
    role_type: str | None = None
    content: str
    placeholders: list[str] | None = None


class TemplateUpdate(BaseModel):
    name: str | None = None
    department: str | None = None
    role_type: str | None = None
    content: str | None = None
    placeholders: list[str] | None = None
    is_active: int | None = None


class TemplateResponse(BaseModel):
    id: str
    name: str
    department: str | None
    role_type: str | None
    content: str
    placeholders: list[str] | None
    is_active: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OfferGenerateRequest(BaseModel):
    job_id: str
    candidate_id: str
    template_id: str
    offer_data: dict  # salary, start_date, benefits, etc.


class OfferUpdate(BaseModel):
    content: str | None = None
    offer_data: dict | None = None


class OfferResponse(BaseModel):
    id: str
    job_id: str
    candidate_id: str
    template_id: str | None
    content: str
    offer_data: dict | None
    pdf_path: str | None
    status: str
    generation_model: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
