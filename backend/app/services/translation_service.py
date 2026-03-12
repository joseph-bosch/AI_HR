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
            # Include additional_insights text fields if present
            if score.additional_insights:
                insights = score.additional_insights
                insights_to_translate = {}
                for key in ("career_trajectory", "cultural_indicators"):
                    if insights.get(key):
                        insights_to_translate[key] = insights[key]
                for key in ("standout_qualities", "risk_flags"):
                    if insights.get(key):
                        insights_to_translate[key] = insights[key]
                if insights_to_translate:
                    fields["additional_insights"] = insights_to_translate

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


async def translate_resume_summary(resume_id: str) -> None:
    """Background task: translate the resume parsed data to the other language.

    Translates summary, skills, experience (title/company/description),
    and education (degree/field/institution) in a single LLM call.
    """
    from sqlalchemy import select
    from app.database import async_session
    from app.models.candidate import Resume

    async with async_session() as db:
        try:
            result = await db.execute(
                select(Resume).where(Resume.id == resume_id)
            )
            resume = result.scalar_one_or_none()
            if not resume or not resume.parsed_data:
                return

            parsed = resume.parsed_data
            from_lang = resume.primary_language or "en"
            to_lang = OTHER_LANGUAGE.get(from_lang)
            if not to_lang:
                return

            # Build the fields to translate
            fields: dict = {}
            if parsed.get("summary"):
                fields["summary"] = parsed["summary"]
            if parsed.get("skills"):
                fields["skills"] = parsed["skills"]
            if parsed.get("experience"):
                fields["experience"] = [
                    {
                        "title": exp.get("title", ""),
                        "company": exp.get("company", ""),
                        "description": exp.get("description", ""),
                    }
                    for exp in parsed["experience"]
                ]
            if parsed.get("education"):
                fields["education"] = [
                    {
                        "degree": edu.get("degree", ""),
                        "field": edu.get("field", ""),
                        "institution": edu.get("institution", ""),
                    }
                    for edu in parsed["education"]
                ]

            if not fields:
                return

            try:
                translated = await _call_translation(fields, to_lang)
                if isinstance(translated, dict):
                    existing = dict(resume.parsed_translations or {})
                    existing[to_lang] = translated
                    resume.parsed_translations = existing
                    await db.commit()
            except Exception as e:
                logger.warning("Failed to translate resume %s: %s", resume_id, e)
                await db.rollback()
        except Exception as e:
            logger.error("Translation task failed for resume %s: %s", resume_id, e)
            await db.rollback()


async def translate_decision_report(decision_id: str) -> None:
    """Background task: translate a decision report to the other language."""
    from sqlalchemy import select
    from app.database import async_session
    from app.models.decision import InterviewDecision

    async with async_session() as db:
        try:
            result = await db.execute(
                select(InterviewDecision).where(InterviewDecision.id == decision_id)
            )
            decision = result.scalar_one_or_none()
            if not decision or not decision.generated_report:
                return

            from_lang = decision.primary_language or "en"
            to_lang = OTHER_LANGUAGE.get(from_lang)
            if not to_lang:
                return

            report = decision.generated_report
            # Only translate text fields; preserve numeric/enum/structural fields
            non_translatable = ("overall_recommendation", "confidence")
            fields_to_translate = {
                k: v for k, v in report.items()
                if k not in non_translatable
                and k != "salary_recommendation"
                and isinstance(v, (str, list))
            }
            # Also translate text inside interview_stages_summary
            if report.get("interview_stages_summary"):
                fields_to_translate["interview_stages_summary"] = report["interview_stages_summary"]
            # Translate only the rationale text inside salary_recommendation
            sal_rec = report.get("salary_recommendation") or {}
            if sal_rec.get("rationale"):
                fields_to_translate["salary_rationale"] = sal_rec["rationale"]

            try:
                translated = await _call_translation(fields_to_translate, to_lang)
                if isinstance(translated, dict):
                    # Merge back non-translated fields
                    for key in non_translatable:
                        if key in report:
                            translated[key] = report[key]
                    # Reconstruct salary_recommendation with translated rationale
                    translated_rationale = translated.pop("salary_rationale", None)
                    translated["salary_recommendation"] = {
                        **sal_rec,
                        "rationale": translated_rationale or sal_rec.get("rationale", ""),
                    }
                    existing = dict(decision.report_translations or {})
                    existing[to_lang] = translated
                    decision.report_translations = existing
                    await db.commit()
            except Exception as e:
                logger.warning("Failed to translate decision report %s: %s", decision_id, e)
                await db.rollback()
        except Exception as e:
            logger.error("Translation task failed for decision %s: %s", decision_id, e)
            await db.rollback()


async def translate_offer_content(offer_id: str) -> None:
    """Background task: translate an offer letter to the other language."""
    from sqlalchemy import select
    from app.database import async_session
    from app.models.offer import GeneratedOffer

    async with async_session() as db:
        try:
            result = await db.execute(
                select(GeneratedOffer).where(GeneratedOffer.id == offer_id)
            )
            offer = result.scalar_one_or_none()
            if not offer or not offer.content:
                return

            from_lang = offer.primary_language or "en"
            to_lang = OTHER_LANGUAGE.get(from_lang)
            if not to_lang:
                return

            try:
                translated = await _call_translation({"content": offer.content}, to_lang)
                if isinstance(translated, dict) and translated.get("content"):
                    existing = dict(offer.content_translations or {})
                    existing[to_lang] = translated["content"]
                    offer.content_translations = existing
                    await db.commit()
            except Exception as e:
                logger.warning("Failed to translate offer %s: %s", offer_id, e)
                await db.rollback()
        except Exception as e:
            logger.error("Translation task failed for offer %s: %s", offer_id, e)
            await db.rollback()
