"""Recruitment Pipeline Assistant — agentic chat service.

Phase 1: LLM uses tool calling to decide what live data to fetch (non-streaming).
Phase 2: LLM streams the final answer using the fetched data as context.
"""
import json
import logging
from typing import AsyncIterator

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.factory import get_llm_provider

logger = logging.getLogger(__name__)

LANGUAGE_NAMES = {"en": "English", "zh": "Chinese (Simplified)"}

SYSTEM_PROMPT_TEMPLATE = """You are a concise HR recruitment assistant. Answer only what was asked — do not add extra information unless the user requests it.

Tool selection rules (MANDATORY):
- ANY question about jobs — how many, which jobs, what positions, list jobs, open roles → call get_open_jobs
- ONLY call get_pipeline_summary when user explicitly asks for a full pipeline overview covering ALL of: jobs + candidates + screened + shortlisted together
- Question about a SPECIFIC named candidate → call search_candidate first to find them, then call other tools as needed
- Question about candidates for a specific job → call get_top_candidates or get_candidates_for_job
- Question about interview status, pipeline stage, did someone pass/fail interview → call search_candidate, then get_candidate_evaluations if needed
- Question about who is in the pipeline / interview stages for a job → call get_interview_pipeline
- How-to / workflow questions → answer from your knowledge, no tool needed

Response rules (MANDATORY):
- When tool data contains a list (e.g. job titles, candidate names), ALWAYS list every item by name in your reply — never collapse a list into just a count.
- When comparing or ranking candidates, ALWAYS include their scores and the reason why one ranks higher — never just give a name without justification.
- When reporting on a specific candidate's interview: state their current pipeline stage, stage_status, completed evaluations, and latest fit_score if available.
- Keep answers focused. Do not volunteer unrelated information, but always include data that directly supports or explains your answer.

HR System Workflow (for how-to questions):
1. Jobs — Create job requisitions with requirements and preferred skills
2. Screening — Upload resumes; AI scores each candidate against the job (0–100)
3. Rankings — View candidates ranked by AI score for each job
4. Questions — Generate AI-tailored interview question sets for a job
5. Evaluations — Conduct interviews, record answers, generate AI evaluation reports
6. Pipeline — Track candidates through HR → Dept → 3rd interview → Decision stages
7. Offers — Generate professional offer letters for selected candidates

Available tools:
- get_open_jobs            : Use for ANY question about jobs. Returns id, title, department, seniority level for every open position.
- get_pipeline_summary     : Full pipeline totals (jobs + candidates + screened + shortlisted). Only for explicit "full summary/overview" requests.
- get_top_candidates       : Top candidates for a specific job by score (requires job_id)
- get_candidates_for_job   : All screened candidates for a specific job (requires job_id)
- search_candidate         : Find a candidate by name. Returns their ID, status, screening scores across jobs, current pipeline stage, AND all completed interview evaluations (fit score, recommendation, summary). This is the ONLY tool you need for questions about a specific candidate's interview results — do NOT call get_candidate_evaluations separately after this.
- get_interview_pipeline   : All candidates currently in the interview pipeline for a specific job, with their stage and evaluation status.
- get_candidate_evaluations: All completed evaluation reports for a specific candidate (by candidate_id), across all jobs.

Language rules (MANDATORY):
- Detect the language the user writes in. Reply in THAT language.
- If the user explicitly requests a specific language (e.g. "reply in English"), use that language.
- Only fall back to {language} if you truly cannot determine the user's language.
- NEVER reply in a different language than what the user used, unless they ask you to."""

# ---------------------------------------------------------------------------
# Tool definitions (Ollama format)
# ---------------------------------------------------------------------------
TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "get_pipeline_summary",
            "description": (
                "Get an overview of the entire recruitment pipeline: "
                "total open jobs, total candidates, screened candidates, shortlisted candidates."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_open_jobs",
            "description": "Get a list of all open job positions including their id, title, department, and seniority level.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_top_candidates",
            "description": "Get the top-ranked screened candidates for a specific job, ordered by overall AI score (highest first).",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {
                        "type": "string",
                        "description": "The UUID of the job position.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Number of top candidates to return (default: 5).",
                    },
                },
                "required": ["job_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_candidates_for_job",
            "description": "Get all screened candidates for a specific job with their scores and AI recommendations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {
                        "type": "string",
                        "description": "The UUID of the job position.",
                    },
                },
                "required": ["job_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_candidate",
            "description": (
                "Search for a candidate by their name (first or last name). "
                "Returns their profile, status, screening scores, current pipeline stage, "
                "AND all completed interview evaluations with fit scores and recommendations. "
                "Use this as the single tool for any question about a specific candidate."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "The candidate's first name, last name, or full name to search for.",
                    },
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_interview_pipeline",
            "description": (
                "Get all candidates currently in the interview pipeline for a specific job. "
                "Returns each candidate's name, current stage (hr_interview, dept_interview, "
                "third_interview, decision), stage status, completed evaluation count, and latest fit score."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {
                        "type": "string",
                        "description": "The UUID of the job position.",
                    },
                },
                "required": ["job_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_candidate_evaluations",
            "description": (
                "Get all completed interview evaluation reports for a specific candidate. "
                "Returns each evaluation's interview round, fit score, summary, strengths, "
                "concerns, and overall recommendation."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "candidate_id": {
                        "type": "string",
                        "description": "The UUID of the candidate.",
                    },
                },
                "required": ["candidate_id"],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------
async def _execute_tool(name: str, arguments: dict, db: AsyncSession) -> dict | list:
    from app.models.job import JobRequisition
    from app.models.candidate import Candidate, ScreeningScore

    if name == "get_pipeline_summary":
        open_jobs_count = await db.scalar(
            select(func.count()).select_from(JobRequisition).where(JobRequisition.status == "open")
        )
        total_candidates = await db.scalar(select(func.count()).select_from(Candidate).where(Candidate.is_archived == False))  # noqa: E712
        screened = await db.scalar(
            select(func.count()).select_from(ScreeningScore).where(ScreeningScore.status == "completed")
        )
        shortlisted = await db.scalar(
            select(func.count()).select_from(Candidate).where(Candidate.status == "shortlisted", Candidate.is_archived == False)  # noqa: E712
        )
        jobs_result = await db.execute(
            select(JobRequisition).where(JobRequisition.status == "open")
        )
        open_job_list = [
            {"id": str(j.id), "title": j.title, "department": j.department}
            for j in jobs_result.scalars().all()
        ]
        return {
            "open_jobs": open_jobs_count or 0,
            "open_job_titles": open_job_list,
            "total_candidates": total_candidates or 0,
            "screened_candidates": screened or 0,
            "shortlisted_candidates": shortlisted or 0,
        }

    if name == "get_open_jobs":
        result = await db.execute(
            select(JobRequisition).where(JobRequisition.status == "open")
        )
        jobs = result.scalars().all()
        return [
            {
                "id": str(j.id),
                "title": j.title,
                "department": j.department,
                "seniority_level": j.seniority_level,
            }
            for j in jobs
        ]

    if name in ("get_top_candidates", "get_candidates_for_job"):
        job_id = arguments.get("job_id")
        if not job_id:
            return {"error": "job_id is required"}
        limit = int(arguments.get("limit", 5)) if name == "get_top_candidates" else None

        query = (
            select(ScreeningScore, Candidate)
            .join(Candidate, ScreeningScore.candidate_id == Candidate.id)
            .where(
                ScreeningScore.job_id == job_id,
                ScreeningScore.status == "completed",
                Candidate.is_archived == False,  # noqa: E712
            )
            .order_by(ScreeningScore.overall_score.desc())
        )
        if limit:
            query = query.limit(limit)
        result = await db.execute(query)
        rows = result.all()
        return [
            {
                "candidate_name": f"{c.first_name} {c.last_name}",
                "overall_score": float(s.overall_score) if s.overall_score is not None else None,
                "recommendation": s.recommendation,
                "skill_match": float(s.skill_match_score) if s.skill_match_score is not None else None,
                "experience_score": float(s.experience_score) if s.experience_score is not None else None,
            }
            for s, c in rows
        ]

    if name == "search_candidate":
        from app.models.pipeline import InterviewPipeline
        from app.models.interview import InterviewEvaluation
        search_name = arguments.get("name", "").strip()
        if not search_name:
            return {"error": "name is required"}
        # Search by first_name or last_name (case-insensitive via LIKE)
        result = await db.execute(
            select(Candidate).where(
                Candidate.is_archived == False,  # noqa: E712
                or_(
                    Candidate.first_name.ilike(f"%{search_name}%"),
                    Candidate.last_name.ilike(f"%{search_name}%"),
                )
            ).limit(5)
        )
        candidates = result.scalars().all()
        if not candidates:
            return {"found": False, "message": f"No candidate found with name matching '{search_name}'"}

        output = []
        for c in candidates:
            # Screening scores across all jobs
            scores_result = await db.execute(
                select(ScreeningScore, JobRequisition)
                .join(JobRequisition, ScreeningScore.job_id == JobRequisition.id)
                .where(ScreeningScore.candidate_id == c.id, ScreeningScore.status == "completed")
                .order_by(ScreeningScore.overall_score.desc())
            )
            scores = [
                {
                    "job_title": j.title,
                    "overall_score": float(s.overall_score) if s.overall_score else None,
                    "recommendation": s.recommendation,
                }
                for s, j in scores_result.all()
            ]

            # Pipeline entry
            pipeline_result = await db.execute(
                select(InterviewPipeline, JobRequisition)
                .join(JobRequisition, InterviewPipeline.job_id == JobRequisition.id)
                .where(InterviewPipeline.candidate_id == c.id)
                .order_by(InterviewPipeline.updated_at.desc())
            )
            pipeline_rows = pipeline_result.all()
            pipeline_info = [
                {
                    "job_title": j.title,
                    "current_stage": p.current_stage,
                    "stage_status": p.stage_status,
                    "rejection_reason": p.rejection_reason,
                }
                for p, j in pipeline_rows
            ]

            # Completed evaluations — included inline so no second tool call is needed
            eval_result = await db.execute(
                select(InterviewEvaluation, JobRequisition)
                .join(JobRequisition, InterviewEvaluation.job_id == JobRequisition.id)
                .where(
                    InterviewEvaluation.candidate_id == c.id,
                    InterviewEvaluation.status == "completed",
                )
                .order_by(InterviewEvaluation.updated_at.desc())
            )
            eval_rows = eval_result.all()
            evaluations = [
                {
                    "job_title": j.title,
                    "interview_round": ev.interview_round,
                    "interviewer": ev.interviewer_name,
                    "fit_score": (ev.generated_report or {}).get("fit_score"),
                    "overall_recommendation": (ev.generated_report or {}).get("overall_recommendation"),
                    "summary": (ev.generated_report or {}).get("summary"),
                }
                for ev, j in eval_rows
            ]

            output.append({
                "candidate_id": c.id,
                "name": f"{c.first_name or ''} {c.last_name or ''}".strip(),
                "email": c.email,
                "status": c.status,
                "screening_scores": scores,
                "pipeline": pipeline_info,
                "completed_evaluations": evaluations,
            })
        return output

    if name == "get_interview_pipeline":
        from app.models.pipeline import InterviewPipeline
        from app.models.interview import InterviewEvaluation
        job_id = arguments.get("job_id")
        if not job_id:
            return {"error": "job_id is required"}

        pipeline_result = await db.execute(
            select(InterviewPipeline, Candidate)
            .join(Candidate, InterviewPipeline.candidate_id == Candidate.id)
            .where(InterviewPipeline.job_id == job_id, Candidate.is_archived == False)  # noqa: E712
            .order_by(InterviewPipeline.created_at.asc())
        )
        rows = pipeline_result.all()

        output = []
        for p, c in rows:
            eval_count = await db.scalar(
                select(func.count()).select_from(InterviewEvaluation).where(
                    InterviewEvaluation.job_id == job_id,
                    InterviewEvaluation.candidate_id == c.id,
                    InterviewEvaluation.status == "completed",
                )
            ) or 0
            latest_eval = (await db.execute(
                select(InterviewEvaluation).where(
                    InterviewEvaluation.job_id == job_id,
                    InterviewEvaluation.candidate_id == c.id,
                    InterviewEvaluation.status == "completed",
                ).order_by(InterviewEvaluation.updated_at.desc())
            )).scalar_one_or_none()
            fit_score = None
            if latest_eval and latest_eval.generated_report:
                fit_score = latest_eval.generated_report.get("fit_score")
            output.append({
                "candidate_id": c.id,
                "name": f"{c.first_name or ''} {c.last_name or ''}".strip(),
                "current_stage": p.current_stage,
                "stage_status": p.stage_status,
                "rejection_reason": p.rejection_reason,
                "completed_evaluations": eval_count,
                "latest_fit_score": fit_score,
            })
        return output if output else {"message": "No candidates in the pipeline for this job"}

    if name == "get_candidate_evaluations":
        from app.models.interview import InterviewEvaluation
        candidate_id = arguments.get("candidate_id")
        if not candidate_id:
            return {"error": "candidate_id is required"}

        result = await db.execute(
            select(InterviewEvaluation, JobRequisition)
            .join(JobRequisition, InterviewEvaluation.job_id == JobRequisition.id)
            .where(
                InterviewEvaluation.candidate_id == candidate_id,
                InterviewEvaluation.status == "completed",
            )
            .order_by(InterviewEvaluation.updated_at.desc())
        )
        rows = result.all()
        if not rows:
            return {"message": "No completed evaluations found for this candidate"}

        output = []
        for ev, j in rows:
            report = ev.generated_report or {}
            output.append({
                "job_title": j.title,
                "interview_round": ev.interview_round,
                "interviewer": ev.interviewer_name,
                "fit_score": report.get("fit_score"),
                "overall_recommendation": report.get("overall_recommendation"),
                "summary": report.get("summary"),
                "strengths": report.get("strengths", []),
                "concerns": report.get("concerns", []),
            })
        return output

    return {"error": f"Unknown tool: {name}"}


# ---------------------------------------------------------------------------
# Agent loop
# ---------------------------------------------------------------------------
def _build_messages(history: list[dict], message: str, language: str) -> list[dict]:
    lang_name = LANGUAGE_NAMES.get(language, "English")
    system = SYSTEM_PROMPT_TEMPLATE.format(language=lang_name)
    messages: list[dict] = [{"role": "system", "content": system}]
    for h in history:
        if h.get("role") in ("user", "assistant") and h.get("content"):
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})
    return messages


async def run_agent_stream(
    message: str,
    history: list[dict],
    language: str,
    db: AsyncSession,
) -> AsyncIterator[dict]:
    """Async generator yielding SSE-ready dicts: {chunk} | {done, tools_used} | {error}."""
    provider = get_llm_provider()
    messages = _build_messages(history, message, language)
    tools_used: list[str] = []
    direct_answer: str | None = None

    # ------------------------------------------------------------------
    # Phase 1: Tool-calling loop (non-streaming, up to 3 iterations)
    # ------------------------------------------------------------------
    for _ in range(3):
        try:
            resp = await provider.generate_with_tools(messages, TOOLS, temperature=0.3)
        except Exception as e:
            logger.error("generate_with_tools error: %s", e)
            yield {"error": str(e)}
            return

        if resp.tool_calls:
            # Append assistant's tool-call message
            messages.append({
                "role": "assistant",
                "content": resp.content or "",
                "tool_calls": resp.tool_calls,
            })
            # Execute each requested tool
            for tc in resp.tool_calls:
                fn = tc.get("function", {})
                tool_name = fn.get("name", "")
                tool_args = fn.get("arguments") or {}
                # arguments may be a JSON string in some Ollama versions
                if isinstance(tool_args, str):
                    try:
                        tool_args = json.loads(tool_args)
                    except json.JSONDecodeError:
                        tool_args = {}
                try:
                    result = await _execute_tool(tool_name, tool_args, db)
                except Exception as e:
                    logger.warning("Tool %s failed: %s", tool_name, e)
                    result = {"error": str(e)}
                tools_used.append(tool_name)
                messages.append({
                    "role": "tool",
                    "content": json.dumps(result, ensure_ascii=False),
                    "name": tool_name,
                })
        else:
            # LLM answered directly without tools
            direct_answer = resp.content or ""
            break

    # ------------------------------------------------------------------
    # Phase 2: Stream the final answer
    # ------------------------------------------------------------------
    if not tools_used and direct_answer is not None:
        # No tools used — emit the non-streamed answer as one chunk
        yield {"chunk": direct_answer}
    else:
        # Tools were used — stream the synthesis
        try:
            async for token in provider.generate_stream(messages, temperature=0.3):
                yield {"chunk": token}
        except Exception as e:
            logger.error("generate_stream error: %s", e)
            yield {"error": str(e)}
            return

    yield {"done": True, "tools_used": tools_used}
