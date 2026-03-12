import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.database import async_session
from app.services import chat_service

router = APIRouter()


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    language: str = "en"


class QuestionsChatRequest(BaseModel):
    message: str
    question_set_id: str
    history: list[ChatMessage] = []
    language: str = "en"


@router.post("/stream")
async def chat_stream(data: ChatRequest):
    """SSE endpoint: streams the agent's response token by token."""

    async def event_generator():
        async with async_session() as db:
            try:
                history = [{"role": m.role, "content": m.content} for m in data.history]
                async for event in chat_service.run_agent_stream(
                    data.message, history, data.language, db
                ):
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/questions-stream")
async def questions_chat_stream(data: QuestionsChatRequest):
    """SSE endpoint: context-aware question set assistant."""

    async def event_generator():
        async with async_session() as db:
            try:
                from sqlalchemy import select
                from sqlalchemy.orm import selectinload
                from app.models.question_set import QuestionSet
                from app.models.job import JobRequisition
                from app.services.screening_service import _format_weighted
                from app.llm.prompts.questions_chat import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE
                from app.llm.factory import get_llm_provider

                result = await db.execute(
                    select(QuestionSet)
                    .where(QuestionSet.id == data.question_set_id)
                    .options(selectinload(QuestionSet.items))
                )
                qs = result.scalar_one_or_none()
                if not qs:
                    yield f"data: {json.dumps({'error': 'Question set not found'})}\n\n"
                    return

                job_result = await db.execute(
                    select(JobRequisition).where(JobRequisition.id == qs.job_id)
                )
                job = job_result.scalar_one_or_none()

                sorted_items = sorted(qs.items or [], key=lambda x: x.sort_order)
                questions_list = "\n".join(
                    f"Q{i + 1} [{item.id}] ({item.category}) {item.question_text}"
                    for i, item in enumerate(sorted_items)
                )

                user_prompt = USER_PROMPT_TEMPLATE.format(
                    job_title=job.title if job else "Unknown",
                    department=job.department if job else "Unknown",
                    seniority_level=job.seniority_level if job else "Unknown",
                    interview_round=qs.interview_round,
                    requirements=_format_weighted(job.requirements) if job else "N/A",
                    question_count=len(sorted_items),
                    questions_list=questions_list or "(no questions yet)",
                    message=data.message,
                )

                fallback_lang = "Chinese (Simplified)" if data.language == "zh" else "English"
                lang_note = (
                    "Language rules: Detect the language the user writes in and reply in THAT language. "
                    "If the user explicitly requests a specific language, use that language. "
                    f"Only fall back to {fallback_lang} if you cannot determine the user's language."
                )
                system = f"{SYSTEM_PROMPT}\n\n{lang_note}"

                messages = [{"role": "system", "content": system}]
                for msg in data.history:
                    messages.append({"role": msg.role, "content": msg.content})
                messages.append({"role": "user", "content": user_prompt})

                provider = get_llm_provider()
                async for token in provider.generate_stream(messages, temperature=0.5):
                    yield f"data: {json.dumps({'token': token}, ensure_ascii=False)}\n\n"

                yield f"data: {json.dumps({'done': True})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
