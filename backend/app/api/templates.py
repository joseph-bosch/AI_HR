from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.offer import OfferTemplate
from app.schemas.offer import TemplateCreate, TemplateUpdate, TemplateResponse

router = APIRouter()


@router.get("/", response_model=list[TemplateResponse])
async def list_templates(
    department: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(OfferTemplate).where(OfferTemplate.is_active == 1)
    if department:
        query = query.where(OfferTemplate.department == department)
    query = query.order_by(OfferTemplate.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/", response_model=TemplateResponse, status_code=201)
async def create_template(data: TemplateCreate, db: AsyncSession = Depends(get_db)):
    template = OfferTemplate(**data.model_dump())
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(template_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(OfferTemplate).where(OfferTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: str, data: TemplateUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(OfferTemplate).where(OfferTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(template, field, value)
    await db.flush()
    await db.refresh(template)
    return template


@router.delete("/{template_id}")
async def delete_template(template_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(OfferTemplate).where(OfferTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    template.is_active = 0
    await db.flush()
    return {"status": "ok", "message": "Template deactivated"}
