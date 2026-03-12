from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.offer import GeneratedOffer, OfferTemplate
from app.models.job import JobRequisition
from app.models.candidate import Candidate
from app.schemas.offer import OfferGenerateRequest, OfferUpdate, OfferResponse

router = APIRouter()


@router.post("/generate", response_model=OfferResponse, status_code=201)
async def generate_offer(
    data: OfferGenerateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    from app.services.offer_service import generate_offer_letter
    from app.services.translation_service import translate_offer_content

    # Verify all entities exist
    job_result = await db.execute(
        select(JobRequisition).where(JobRequisition.id == data.job_id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    cand_result = await db.execute(
        select(Candidate).where(Candidate.id == data.candidate_id)
    )
    candidate = cand_result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    template_result = await db.execute(
        select(OfferTemplate).where(OfferTemplate.id == data.template_id)
    )
    template = template_result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    content, model_used = await generate_offer_letter(
        template, job, candidate, data.offer_data, language=data.language
    )

    lang = data.language or "en"
    offer = GeneratedOffer(
        job_id=data.job_id,
        candidate_id=data.candidate_id,
        template_id=data.template_id,
        content=content,
        offer_data=data.offer_data,
        status="draft",
        generation_model=model_used,
        primary_language=lang,
    )
    db.add(offer)
    await db.flush()
    await db.refresh(offer)

    background_tasks.add_task(translate_offer_content, offer.id)
    return offer


@router.get("/{offer_id}", response_model=OfferResponse)
async def get_offer(offer_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(GeneratedOffer).where(GeneratedOffer.id == offer_id)
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    return offer


@router.put("/{offer_id}", response_model=OfferResponse)
async def update_offer(
    offer_id: str, data: OfferUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(GeneratedOffer).where(GeneratedOffer.id == offer_id)
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(offer, field, value)
    await db.flush()
    await db.refresh(offer)
    return offer


@router.post("/{offer_id}/approve", response_model=OfferResponse)
async def approve_offer(offer_id: str, db: AsyncSession = Depends(get_db)):
    from app.services.pdf_service import generate_offer_pdf

    result = await db.execute(
        select(GeneratedOffer).where(GeneratedOffer.id == offer_id)
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    # Generate PDF
    pdf_path = await generate_offer_pdf(offer)
    offer.pdf_path = pdf_path
    offer.status = "approved"
    await db.flush()
    await db.refresh(offer)
    return offer


@router.get("/{offer_id}/pdf")
async def download_offer_pdf(offer_id: str, db: AsyncSession = Depends(get_db)):
    import os

    result = await db.execute(
        select(GeneratedOffer).where(GeneratedOffer.id == offer_id)
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    if not offer.pdf_path or not os.path.exists(offer.pdf_path):
        raise HTTPException(status_code=404, detail="PDF not generated yet")

    return FileResponse(
        path=offer.pdf_path,
        filename=f"offer_{offer_id}.pdf",
        media_type="application/pdf",
    )


@router.get("/job/{job_id}", response_model=list[OfferResponse])
async def list_job_offers(job_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(GeneratedOffer)
        .where(GeneratedOffer.job_id == job_id)
        .order_by(GeneratedOffer.created_at.desc())
    )
    return result.scalars().all()
