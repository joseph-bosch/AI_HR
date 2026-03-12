from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.question_set import QuestionSet, QuestionSetItem
from app.models.job import JobRequisition
from app.schemas.question_set import (
    QuestionSetGenerate, QuestionItemCreate, QuestionItemUpdate,
    QuestionSetResponse, QuestionItemResponse, ReorderRequest,
)

router = APIRouter()


@router.post("/generate", response_model=QuestionSetResponse, status_code=201)
async def generate_question_set(
    data: QuestionSetGenerate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    import logging
    from app.services.question_service import generate_questions
    from app.services.translation_service import translate_question_set_items

    logger = logging.getLogger(__name__)

    job_result = await db.execute(
        select(JobRequisition).where(JobRequisition.id == data.job_id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    try:
        question_set, items = await generate_questions(
            job, data.interview_round, data.preferences, data.language,
            data.total_count, data.category_counts,
        )
    except ValueError as e:
        logger.error("Question generation returned no data: %s", e)
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.error("Question generation failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=502,
            detail=f"AI generation failed: {type(e).__name__}: {e}",
        )

    db.add(question_set)
    await db.flush()

    for i, item in enumerate(items):
        item.question_set_id = question_set.id
        item.sort_order = i
        db.add(item)

    await db.flush()

    # Reload with items eagerly to avoid async lazy-load error
    result = await db.execute(
        select(QuestionSet)
        .where(QuestionSet.id == question_set.id)
        .options(selectinload(QuestionSet.items))
    )
    qs = result.scalar_one()

    # Background: translate items to the other language
    background_tasks.add_task(translate_question_set_items, qs.id)

    return qs


@router.get("/{set_id}", response_model=QuestionSetResponse)
async def get_question_set(set_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(QuestionSet)
        .where(QuestionSet.id == set_id)
        .options(selectinload(QuestionSet.items))
    )
    qs = result.scalar_one_or_none()
    if not qs:
        raise HTTPException(status_code=404, detail="Question set not found")
    return qs


@router.post("/{set_id}/questions", response_model=QuestionItemResponse, status_code=201)
async def add_question(
    set_id: str,
    data: QuestionItemCreate,
    db: AsyncSession = Depends(get_db),
):
    # Get max sort_order
    result = await db.execute(
        select(QuestionSetItem)
        .where(QuestionSetItem.question_set_id == set_id)
        .order_by(QuestionSetItem.sort_order.desc())
    )
    last = result.scalars().first()
    next_order = (last.sort_order + 1) if last else 0

    item = QuestionSetItem(
        question_set_id=set_id,
        sort_order=next_order,
        **data.model_dump(),
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


@router.put("/{set_id}/questions/{q_id}", response_model=QuestionItemResponse)
async def update_question(
    set_id: str,
    q_id: str,
    data: QuestionItemUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(QuestionSetItem).where(
            QuestionSetItem.id == q_id,
            QuestionSetItem.question_set_id == set_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Question not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return item


@router.delete("/{set_id}/questions/{q_id}")
async def delete_question(set_id: str, q_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(QuestionSetItem).where(
            QuestionSetItem.id == q_id,
            QuestionSetItem.question_set_id == set_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Question not found")
    await db.delete(item)
    await db.flush()
    return {"status": "ok"}


@router.delete("/{set_id}")
async def delete_question_set(set_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(QuestionSet).where(QuestionSet.id == set_id)
    )
    qs = result.scalar_one_or_none()
    if not qs:
        raise HTTPException(status_code=404, detail="Question set not found")
    # Delete all child questions first
    items_result = await db.execute(
        select(QuestionSetItem).where(QuestionSetItem.question_set_id == set_id)
    )
    for item in items_result.scalars().all():
        await db.delete(item)
    await db.delete(qs)
    await db.flush()
    return {"status": "ok"}


@router.put("/{set_id}/reorder")
async def reorder_questions(
    set_id: str,
    data: ReorderRequest,
    db: AsyncSession = Depends(get_db),
):
    for i, item_id in enumerate(data.item_ids):
        result = await db.execute(
            select(QuestionSetItem).where(
                QuestionSetItem.id == item_id,
                QuestionSetItem.question_set_id == set_id,
            )
        )
        item = result.scalar_one_or_none()
        if item:
            item.sort_order = i
    await db.flush()
    return {"status": "ok"}


@router.post("/{set_id}/finalize")
async def finalize_set(set_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(QuestionSet).where(QuestionSet.id == set_id)
    )
    qs = result.scalar_one_or_none()
    if not qs:
        raise HTTPException(status_code=404, detail="Question set not found")
    qs.status = "finalized"
    await db.flush()
    return {"status": "ok"}


@router.get("/{set_id}/export/pdf")
async def export_pdf(set_id: str, lang: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    import os
    from app.services.pdf_service import generate_question_set_pdf

    result = await db.execute(
        select(QuestionSet).where(QuestionSet.id == set_id)
    )
    qs = result.scalar_one_or_none()
    if not qs:
        raise HTTPException(status_code=404, detail="Question set not found")

    items_result = await db.execute(
        select(QuestionSetItem)
        .where(QuestionSetItem.question_set_id == set_id)
        .order_by(QuestionSetItem.sort_order)
    )
    items = items_result.scalars().all()

    pdf_path = await generate_question_set_pdf(qs, items, lang=lang)
    qs.pdf_path = pdf_path
    await db.flush()

    return FileResponse(
        path=pdf_path,
        filename=f"questions_{set_id}.pdf",
        media_type="application/pdf",
    )


@router.get("/job/{job_id}", response_model=list[QuestionSetResponse])
async def list_job_question_sets(job_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(QuestionSet)
        .where(QuestionSet.job_id == job_id)
        .options(selectinload(QuestionSet.items))
        .order_by(QuestionSet.created_at.desc())
    )
    return result.scalars().all()
