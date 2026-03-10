"""Background translation service.

After AI generates content in the selected language, this service translates
it to the other supported language and stores both in the DB so users can
switch languages without re-generating.
"""
import json
import logging

from app.llm.factory import get_llm_provider
from app.llm.prompts.translation import TRANSLATION_SYSTEM_PROMPT, TRANSLATION_USER_TEMPLATE

logger = logging.getLogger(__name__)

LANGUAGE_NAMES = {
    "en": "English",
    "zh": "Chinese (Simplified)",
}

# For a given primary language, what is the other language to translate to
OTHER_LANGUAGE = {"en": "zh", "zh": "en"}


async def _call_translation(content: dict | list, to_lang: str) -> dict | list | None:
    """Call LLM to translate JSON content to the target language."""
    lang_name = LANGUAGE_NAMES.get(to_lang, to_lang)
    prompt = TRANSLATION_USER_TEMPLATE.format(
        target_language=lang_name,
        content=json.dumps(content, ensure_ascii=False, indent=2),
    )
    provider = get_llm_provider()
    response = await provider.generate(
        prompt=prompt,
        system_prompt=TRANSLATION_SYSTEM_PROMPT,
        temperature=0.1,
        json_mode=True,
    )
    return response.parsed


async def translate_question_set_items(question_set_id: str) -> None:
    """Background task: translate all question items in a set to the other language.

    All items are sent in a single batched LLM call (one call instead of N calls)
    to avoid partial failures where only some items get translated.
    Falls back to per-item translation if the batch call fails.
    """
    from sqlalchemy import select
    from app.database import async_session
    from app.models.question_set import QuestionSet, QuestionSetItem

    async with async_session() as db:
        try:
            qs_result = await db.execute(
                select(QuestionSet).where(QuestionSet.id == question_set_id)
            )
            qs = qs_result.scalar_one_or_none()
            if not qs:
                return

            from_lang = qs.primary_language or "en"
            to_lang = OTHER_LANGUAGE.get(from_lang)
            if not to_lang:
                return

            items_result = await db.execute(
                select(QuestionSetItem)
                .where(QuestionSetItem.question_set_id == question_set_id)
                .order_by(QuestionSetItem.sort_order)
            )
            items = list(items_result.scalars().all())
            if not items:
                return

            # Build a list of field dicts in sort_order; zip back by index after translation
            batch = []
            for item in items:
                entry = {
                    "question_text": item.question_text,
                    "interviewer_guidance": item.interviewer_guidance,
                    "good_answer_indicators": item.good_answer_indicators,
                    "red_flags": item.red_flags,
                }
                if item.scoring_rubric:
                    entry["scoring_rubric"] = item.scoring_rubric
                batch.append(entry)

            translated_batch = None
            try:
                translated_batch = await _call_translation(batch, to_lang)
            except Exception as e:
                logger.warning("Batch translation failed for question set %s: %s — falling back to per-item", question_set_id, e)

            if isinstance(translated_batch, list) and len(translated_batch) == len(items):
                # Batch succeeded — zip by position
                for item, translated in zip(items, translated_batch):
                    if isinstance(translated, dict):
                        existing = dict(item.translations or {})
                        existing[to_lang] = translated
                        item.translations = existing
            else:
                # Batch failed or returned wrong length — fall back to per-item
                logger.info("Falling back to per-item translation for question set %s", question_set_id)
                for item in items:
                    fields = {
                        "question_text": item.question_text,
                        "interviewer_guidance": item.interviewer_guidance,
                        "good_answer_indicators": item.good_answer_indicators,
                        "red_flags": item.red_flags,
                    }
                    if item.scoring_rubric:
                        fields["scoring_rubric"] = item.scoring_rubric
                    try:
                        translated = await _call_translation(fields, to_lang)
                        if isinstance(translated, dict):
                            existing = dict(item.translations or {})
                            existing[to_lang] = translated
                            item.translations = existing
                    except Exception as e:
                        logger.warning("Failed to translate question item %s: %s", item.id, e)

            await db.commit()
        except Exception as e:
            logger.error("Translation task failed for question set %s: %s", question_set_id, e)
            await db.rollback()


async def translate_evaluation_questions(evaluation_id: str) -> None:
    """Background task: translate evaluation questions to the other language."""
    from sqlalchemy import select
    from app.database import async_session
    from app.models.interview import InterviewEvaluation

    async with async_session() as db:
        try:
            result = await db.execute(
                select(InterviewEvaluation).where(InterviewEvaluation.id == evaluation_id)
            )
            evaluation = result.scalar_one_or_none()
            if not evaluation or not evaluation.questions:
                return

            from_lang = evaluation.primary_language or "en"
            to_lang = OTHER_LANGUAGE.get(from_lang)
            if not to_lang:
                return

            # Only translate the "text" fields, keep id/category/order as-is
            questions = evaluation.questions
            texts_only = [{"id": q.get("id"), "text": q.get("text", "")} for q in questions]

            try:
                translated = await _call_translation(texts_only, to_lang)
                if isinstance(translated, list):
                    # Build translated question list preserving structure
                    text_map = {item["id"]: item.get("text", "") for item in translated if "id" in item}
                    translated_questions = [
                        {**q, "text": text_map.get(q.get("id"), q.get("text", ""))}
                        for q in questions
                    ]
                    existing = dict(evaluation.questions_translations or {})
                    existing[to_lang] = translated_questions
                    evaluation.questions_translations = existing
                    await db.commit()
            except Exception as e:
                logger.warning("Failed to translate eval questions %s: %s", evaluation_id, e)
                await db.rollback()
        except Exception as e:
            logger.error("Translation task failed for evaluation %s: %s", evaluation_id, e)
            await db.rollback()


async def translate_evaluation_report(evaluation_id: str) -> None:
    """Background task: translate evaluation report to the other language."""
    from sqlalchemy import select
    from app.database import async_session
    from app.models.interview import InterviewEvaluation

    async with async_session() as db:
        try:
            result = await db.execute(
                select(InterviewEvaluation).where(InterviewEvaluation.id == evaluation_id)
            )
            evaluation = result.scalar_one_or_none()
            if not evaluation or not evaluation.generated_report:
                return

            from_lang = evaluation.primary_language or "en"
            to_lang = OTHER_LANGUAGE.get(from_lang)
            if not to_lang:
                return

            report = evaluation.generated_report
            # Only translate text fields; preserve numeric/enum fields
            fields_to_translate = {
                k: v for k, v in report.items()
                if k not in ("overall_recommendation", "fit_score")
            }

            try:
                translated = await _call_translation(fields_to_translate, to_lang)
                if isinstance(translated, dict):
                    # Merge back non-translated fields
                    translated["overall_recommendation"] = report.get("overall_recommendation")
                    translated["fit_score"] = report.get("fit_score")
                    existing = dict(evaluation.report_translations or {})
                    existing[to_lang] = translated
                    evaluation.report_translations = existing
                    await db.commit()
            except Exception as e:
                logger.warning("Failed to translate eval report %s: %s", evaluation_id, e)
                await db.rollback()
        except Exception as e:
            logger.error("Translation task failed for report %s: %s", evaluation_id, e)
            await db.rollback()


async def translate_screening_score(score_id: str) -> None:
    """Background task: translate screening explanation/strengths/weaknesses to the other language."""
    from sqlalchemy import select
    from app.database import async_session
    from app.models.candidate import ScreeningScore

    async with async_session() as db:
        try:
            result = await db.execute(
                select(ScreeningScore).where(ScreeningScore.id == score_id)
            )
            score = result.scalar_one_or_none()
            if not score or score.status != "completed":
                return

            from_lang = score.primary_language or "en"
            to_lang = OTHER_LANGUAGE.get(from_lang)
            if not to_lang:
                return

            fields = {
                "explanation": score.explanation,
                "strengths": score.strengths or [],
                "weaknesses": score.weaknesses or [],
            }

            try:
                translated = await _call_translation(fields, to_lang)
                if isinstance(translated, dict):
                    existing = dict(score.score_translations or {})
                    existing[to_lang] = translated
                    score.score_translations = existing
                    await db.commit()
            except Exception as e:
                logger.warning("Failed to translate screening score %s: %s", score_id, e)
                await db.rollback()
        except Exception as e:
            logger.error("Translation task failed for score %s: %s", score_id, e)
            await db.rollback()
