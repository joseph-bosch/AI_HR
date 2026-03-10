import json
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Query
from pydantic import BaseModel
from sqlalchemy import select, delete, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.candidate import Candidate, Resume, ScreeningScore
from app.models.interview import InterviewEvaluation
from app.models.offer import GeneratedOffer
from app.schemas.candidate import (
    CandidateResponse, CandidateUpdate, ResumeResponse,
    DuplicateCheckRequest, DuplicateInfo, ResolveDuplicateRequest,
)

router = APIRouter()


class ConfirmEmailCandidateRequest(BaseModel):
    preview_id: str
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    notes: str | None = None


async def _save_uploaded_file(file: UploadFile) -> tuple[str, str, int]:
    """Save uploaded file and return (stored_path, file_type, file_size)."""
    ext = Path(file.filename).suffix.lower()
    if ext not in (".pdf", ".docx"):
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    file_id = str(uuid.uuid4())
    filename = f"{file_id}{ext}"
    upload_dir = Path(settings.RESUME_UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / filename

    content = await file.read()
    file_size = len(content)

    if file_size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large")

    with open(file_path, "wb") as f:
        f.write(content)

    return str(file_path), ext.lstrip("."), file_size


async def _parse_resume_background(resume_id: str):
    """Background task to parse a resume with the LLM."""
    from app.database import async_session
    from app.services.resume_parser import parse_resume

    async with async_session() as db:
        try:
            result = await db.execute(select(Resume).where(Resume.id == resume_id))
            resume = result.scalar_one_or_none()
            if not resume:
                return

            resume.parse_status = "processing"
            await db.commit()

            await parse_resume(resume, db)

            resume.parse_status = "completed"
            await db.commit()
        except Exception as e:
            resume.parse_status = "failed"
            resume.parse_error = str(e)
            await db.commit()


@router.get("/", response_model=list[CandidateResponse])
async def list_candidates(
    status: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    query = select(Candidate)
    if status:
        query = query.where(Candidate.status == status)
    query = query.order_by(Candidate.created_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    return result.scalars().all()


@router.delete("/{candidate_id}", status_code=204)
async def delete_candidate(candidate_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Candidate).where(Candidate.id == candidate_id))
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    # Explicitly delete related records that lack DB-level CASCADE
    await db.execute(delete(InterviewEvaluation).where(InterviewEvaluation.candidate_id == candidate_id))
    await db.execute(delete(GeneratedOffer).where(GeneratedOffer.candidate_id == candidate_id))
    await db.execute(delete(ScreeningScore).where(ScreeningScore.candidate_id == candidate_id))
    await db.delete(candidate)
    await db.commit()


@router.get("/{candidate_id}", response_model=CandidateResponse)
async def get_candidate(candidate_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Candidate).where(Candidate.id == candidate_id)
    )
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate


@router.put("/{candidate_id}", response_model=CandidateResponse)
async def update_candidate(
    candidate_id: str, data: CandidateUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Candidate).where(Candidate.id == candidate_id)
    )
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(candidate, field, value)
    await db.flush()
    await db.refresh(candidate)
    return candidate


@router.post("/upload-resume", response_model=CandidateResponse, status_code=201)
async def upload_resume(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    stored_path, file_type, file_size = await _save_uploaded_file(file)

    candidate = Candidate(source="upload")
    db.add(candidate)
    await db.flush()

    resume = Resume(
        candidate_id=candidate.id,
        original_filename=file.filename,
        stored_path=stored_path,
        file_type=file_type,
        file_size_bytes=file_size,
        parse_status="pending",
    )
    db.add(resume)
    await db.flush()
    await db.refresh(candidate)

    background_tasks.add_task(_parse_resume_background, resume.id)

    return candidate


@router.post("/upload-bulk", status_code=201)
async def upload_bulk(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    candidates = []
    for file in files:
        stored_path, file_type, file_size = await _save_uploaded_file(file)

        candidate = Candidate(source="upload")
        db.add(candidate)
        await db.flush()

        resume = Resume(
            candidate_id=candidate.id,
            original_filename=file.filename,
            stored_path=stored_path,
            file_type=file_type,
            file_size_bytes=file_size,
            parse_status="pending",
        )
        db.add(resume)
        await db.flush()

        background_tasks.add_task(_parse_resume_background, resume.id)
        candidates.append({"id": candidate.id, "filename": file.filename})

    return {"uploaded": len(candidates), "candidates": candidates}


@router.get("/{candidate_id}/resume", response_model=ResumeResponse)
async def get_resume(candidate_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Resume).where(Resume.candidate_id == candidate_id)
        .order_by(Resume.created_at.desc())
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    return resume


@router.post("/check-duplicates")
async def check_duplicates(
    data: DuplicateCheckRequest,
    db: AsyncSession = Depends(get_db),
):
    """Check if newly uploaded candidates duplicate existing candidates that already have a score for this job."""
    result = await db.execute(
        select(Candidate).where(Candidate.id.in_(data.candidate_ids))
    )
    uploaded = result.scalars().all()

    duplicates: list[DuplicateInfo] = []
    for candidate in uploaded:
        name_filter = []
        if candidate.first_name and candidate.last_name:
            name_filter.append(
                and_(
                    Candidate.first_name == candidate.first_name,
                    Candidate.last_name == candidate.last_name,
                )
            )
        if candidate.email:
            name_filter.append(Candidate.email == candidate.email)

        if not name_filter:
            continue  # Not yet parsed — skip

        existing_result = await db.execute(
            select(Candidate).where(
                or_(*name_filter),
                Candidate.id.notin_(data.candidate_ids),
                Candidate.id.in_(
                    select(ScreeningScore.candidate_id).where(
                        ScreeningScore.job_id == data.job_id
                    )
                ),
            )
        )
        existing = existing_result.scalars().first()
        if existing:
            new_name = (
                f"{candidate.first_name or ''} {candidate.last_name or ''}".strip()
                or candidate.email
                or "Unknown"
            )
            existing_name = (
                f"{existing.first_name or ''} {existing.last_name or ''}".strip()
                or existing.email
                or "Unknown"
            )
            duplicates.append(
                DuplicateInfo(
                    new_candidate_id=candidate.id,
                    new_candidate_name=new_name,
                    existing_candidate_id=existing.id,
                    existing_candidate_name=existing_name,
                )
            )

    return {"duplicates": [d.model_dump() for d in duplicates]}


@router.post("/resolve-duplicate")
async def resolve_duplicate(
    data: ResolveDuplicateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Resolve a detected duplicate.
    - skip: delete the newly uploaded candidate, keep the existing score as-is.
    - replace: move the new resume onto the existing candidate, delete the old score
               so the existing candidate gets re-scored with the new resume.
    """
    if data.action == "replace":
        # Re-attach the new resume to the existing candidate
        resume_result = await db.execute(
            select(Resume)
            .where(Resume.candidate_id == data.new_candidate_id)
            .order_by(Resume.created_at.desc())
        )
        new_resume = resume_result.scalars().first()
        if new_resume:
            new_resume.candidate_id = data.existing_candidate_id
            await db.flush()
        # Delete the old score so the existing candidate gets re-scored
        await db.execute(
            delete(ScreeningScore).where(
                ScreeningScore.candidate_id == data.existing_candidate_id,
                ScreeningScore.job_id == data.job_id,
            )
        )

    # In both cases delete the newly uploaded duplicate candidate record
    new_cand_result = await db.execute(
        select(Candidate).where(Candidate.id == data.new_candidate_id)
    )
    new_cand = new_cand_result.scalar_one_or_none()
    if new_cand:
        await db.execute(
            delete(InterviewEvaluation).where(
                InterviewEvaluation.candidate_id == data.new_candidate_id
            )
        )
        await db.execute(
            delete(GeneratedOffer).where(
                GeneratedOffer.candidate_id == data.new_candidate_id
            )
        )
        await db.execute(
            delete(ScreeningScore).where(
                ScreeningScore.candidate_id == data.new_candidate_id
            )
        )
        await db.delete(new_cand)

    await db.commit()
    return {"status": "ok"}


@router.get("/{candidate_id}/resume/download")
async def download_resume(candidate_id: str, db: AsyncSession = Depends(get_db)):
    from fastapi.responses import FileResponse

    result = await db.execute(
        select(Resume).where(Resume.candidate_id == candidate_id)
        .order_by(Resume.created_at.desc())
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    if not os.path.exists(resume.stored_path):
        raise HTTPException(status_code=404, detail="Resume file not found on disk")

    return FileResponse(
        path=resume.stored_path,
        filename=resume.original_filename,
        media_type="application/octet-stream",
    )


@router.post("/{candidate_id}/resume/reparse")
async def reparse_resume(
    candidate_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Resume).where(Resume.candidate_id == candidate_id)
        .order_by(Resume.created_at.desc())
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    resume.parse_status = "pending"
    resume.parse_error = None
    await db.flush()

    background_tasks.add_task(_parse_resume_background, resume.id)
    return {"status": "ok", "message": "Reparsing started"}


# ---------------------------------------------------------------------------
# Email upload endpoints
# ---------------------------------------------------------------------------

_EMAIL_TEMP_DIR = Path(settings.RESUME_UPLOAD_DIR).parent / "email_temp"
_ALLOWED_EMAIL_TYPES = {".eml", ".msg"}


@router.post("/upload-email")
async def upload_email(file: UploadFile = File(...)):
    """
    Parse an Outlook email (.msg) or standard email (.eml) file.
    Extracts candidate info via LLM and returns a preview — no DB records created yet.
    The caller should follow up with POST /confirm-email once the user has reviewed.
    """
    from app.utils.email_parser import parse_email_file
    from app.utils.text_extraction import extract_text
    from app.llm.factory import get_llm_provider
    from app.llm.prompts.email_candidate import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE

    ext = Path(file.filename or "").suffix.lower()
    if ext not in _ALLOWED_EMAIL_TYPES:
        raise HTTPException(status_code=400, detail="Supported formats: .eml, .msg")

    content = await file.read()

    # Save email to temp dir so the parser can open by path
    _EMAIL_TEMP_DIR.mkdir(parents=True, exist_ok=True)
    preview_id = str(uuid.uuid4())
    email_tmp_path = _EMAIL_TEMP_DIR / f"{preview_id}{ext}"
    email_tmp_path.write_bytes(content)

    try:
        parsed_email = parse_email_file(str(email_tmp_path))
    except Exception as exc:
        email_tmp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=f"Could not parse email: {exc}") from exc
    finally:
        email_tmp_path.unlink(missing_ok=True)

    # Handle attachments: save resume attachment temporarily if present
    attachment_filename: str | None = None
    attachment_text: str | None = None
    for att_name, att_data in parsed_email.get("attachments", []):
        att_ext = Path(att_name).suffix.lower()
        if att_ext in (".pdf", ".docx"):
            att_path = _EMAIL_TEMP_DIR / f"{preview_id}_attachment{att_ext}"
            att_path.write_bytes(att_data)
            attachment_filename = att_name
            try:
                attachment_text = extract_text(str(att_path))[:6000]
            except Exception:
                attachment_text = None
            break  # use first resume attachment only

    # Build LLM prompt
    attachment_section = ""
    if attachment_text:
        attachment_section = f"\nRESUME ATTACHMENT ({attachment_filename}):\n{attachment_text}"

    provider = get_llm_provider()
    response = await provider.generate(
        prompt=USER_PROMPT_TEMPLATE.format(
            sender=parsed_email["sender"],
            subject=parsed_email["subject"],
            email_body=(parsed_email["body"] or "")[:5000],
            attachment_section=attachment_section,
        ),
        system_prompt=SYSTEM_PROMPT,
        temperature=0.1,
        json_mode=True,
    )

    extracted_info = response.parsed or {}

    # Persist preview metadata so confirm-email can use it
    meta = {
        "extracted_info": extracted_info,
        "email_body": parsed_email["body"],
        "sender": parsed_email["sender"],
        "subject": parsed_email["subject"],
        "attachment_filename": attachment_filename,
        "attachment_ext": Path(attachment_filename).suffix.lower() if attachment_filename else None,
    }
    (_EMAIL_TEMP_DIR / f"{preview_id}.json").write_text(json.dumps(meta, ensure_ascii=False))

    return {
        "preview_id": preview_id,
        "sender": parsed_email["sender"],
        "subject": parsed_email["subject"],
        "email_body_preview": (parsed_email["body"] or "")[:1500],
        "extracted_info": extracted_info,
        "has_attachment": attachment_filename is not None,
        "attachment_filename": attachment_filename,
    }


@router.post("/confirm-email", response_model=CandidateResponse, status_code=201)
async def confirm_email_candidate(
    data: ConfirmEmailCandidateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a Candidate + Resume from a reviewed email preview.
    The resume is pre-marked as parsed (no background LLM call needed).
    """
    meta_path = _EMAIL_TEMP_DIR / f"{data.preview_id}.json"
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail="Preview not found or expired")

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    extracted = meta.get("extracted_info", {})

    # Determine candidate name
    raw_name: str = data.name or extracted.get("name") or ""
    parts = raw_name.split(maxsplit=1)
    first = parts[0] if parts else None
    last = parts[1] if len(parts) > 1 else None

    # Create candidate
    candidate = Candidate(
        first_name=first,
        last_name=last,
        email=data.email or extracted.get("email"),
        phone=data.phone or extracted.get("phone"),
        status="new",
        notes=data.notes or extracted.get("notes"),
    )
    db.add(candidate)
    await db.flush()

    # Determine the stored file for the resume
    att_ext = meta.get("attachment_ext")
    att_path_on_disk = _EMAIL_TEMP_DIR / f"{data.preview_id}_attachment{att_ext}" if att_ext else None

    upload_dir = Path(settings.RESUME_UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    if att_path_on_disk and att_path_on_disk.exists():
        # Move the attachment to the resume upload directory
        dest_filename = f"{str(uuid.uuid4())}{att_ext}"
        dest_path = upload_dir / dest_filename
        att_path_on_disk.rename(dest_path)
        original_filename = meta.get("attachment_filename", dest_filename)
        file_type = att_ext.lstrip(".")
        file_size = dest_path.stat().st_size
        stored_path = str(dest_path)
    else:
        # No attachment — write email body as a .txt file
        txt_filename = f"{str(uuid.uuid4())}.txt"
        txt_path = upload_dir / txt_filename
        email_body = meta.get("email_body", "")
        txt_path.write_text(email_body, encoding="utf-8")
        original_filename = f"email_{meta.get('subject', 'unknown')[:40]}.txt"
        file_type = "txt"
        file_size = txt_path.stat().st_size
        stored_path = str(txt_path)

    # Build parsed_data from extracted info (merge with any existing structure)
    parsed_data = {
        "contact": {
            "name": raw_name or None,
            "email": candidate.email,
            "phone": candidate.phone,
            "location": None,
            "linkedin": None,
        },
        "summary": extracted.get("summary"),
        "skills": extracted.get("skills", []),
        "experience": extracted.get("experience", []),
        "education": extracted.get("education", []),
        "certifications": [],
        "languages": [],
        "total_experience_years": None,
    }

    resume = Resume(
        candidate_id=candidate.id,
        original_filename=original_filename,
        stored_path=stored_path,
        file_type=file_type,
        file_size_bytes=file_size,
        parsed_data=parsed_data,
        parse_status="completed",
    )
    db.add(resume)
    await db.flush()
    await db.refresh(candidate)

    # Clean up temp files
    meta_path.unlink(missing_ok=True)

    return candidate
