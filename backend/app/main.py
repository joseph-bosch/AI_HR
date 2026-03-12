from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.api.router import api_router

# Import new models so Base.metadata.create_all() creates their tables
import app.models.pipeline  # noqa: F401
import app.models.decision  # noqa: F401


def _run_migrations(conn):
    from sqlalchemy import text
    Base.metadata.create_all(bind=conn)
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'question_sets') AND name=N'primary_language') "
        "ALTER TABLE question_sets ADD primary_language NVARCHAR(10) NOT NULL DEFAULT 'en'"
    ))
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'question_set_items') AND name=N'translations') "
        "ALTER TABLE question_set_items ADD translations NVARCHAR(MAX) NULL"
    ))
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'interview_evaluations') AND name=N'primary_language') "
        "ALTER TABLE interview_evaluations ADD primary_language NVARCHAR(10) NOT NULL DEFAULT 'en'"
    ))
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'interview_evaluations') AND name=N'report_translations') "
        "ALTER TABLE interview_evaluations ADD report_translations NVARCHAR(MAX) NULL"
    ))
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'interview_evaluations') AND name=N'questions_translations') "
        "ALTER TABLE interview_evaluations ADD questions_translations NVARCHAR(MAX) NULL"
    ))
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'screening_scores') AND name=N'primary_language') "
        "ALTER TABLE screening_scores ADD primary_language NVARCHAR(10) NOT NULL DEFAULT 'en'"
    ))
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'screening_scores') AND name=N'score_translations') "
        "ALTER TABLE screening_scores ADD score_translations NVARCHAR(MAX) NULL"
    ))
    conn.execute(text(
        "IF (SELECT system_type_id FROM sys.columns WHERE object_id=OBJECT_ID(N'screening_scores') AND name=N'explanation') "
        "= TYPE_ID(N'varchar') "
        "ALTER TABLE screening_scores ALTER COLUMN explanation NVARCHAR(MAX) NOT NULL"
    ))
    # New columns: job_requisitions
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'job_requisitions') AND name=N'target_score') "
        "ALTER TABLE job_requisitions ADD target_score INT NULL"
    ))
    # New columns: question_sets
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'question_sets') AND name=N'candidate_id') "
        "ALTER TABLE question_sets ADD candidate_id NVARCHAR(36) NULL"
    ))
    # New columns: screening_scores
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'screening_scores') AND name=N'additional_insights') "
        "ALTER TABLE screening_scores ADD additional_insights NVARCHAR(MAX) NULL"
    ))
    # New columns: interview_evaluations (audio + transcript + hr_notes + report_edited)
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'interview_evaluations') AND name=N'audio_path') "
        "ALTER TABLE interview_evaluations ADD audio_path NVARCHAR(500) NULL"
    ))
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'interview_evaluations') AND name=N'transcript') "
        "ALTER TABLE interview_evaluations ADD transcript NVARCHAR(MAX) NULL"
    ))
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'interview_evaluations') AND name=N'transcript_status') "
        "ALTER TABLE interview_evaluations ADD transcript_status NVARCHAR(20) NOT NULL DEFAULT 'none'"
    ))
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'interview_evaluations') AND name=N'hr_notes') "
        "ALTER TABLE interview_evaluations ADD hr_notes NVARCHAR(MAX) NULL"
    ))
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'interview_evaluations') AND name=N'report_edited') "
        "ALTER TABLE interview_evaluations ADD report_edited INT NOT NULL DEFAULT 0"
    ))
    # New columns: resumes — language + translations for parsed data (summary)
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'resumes') AND name=N'primary_language') "
        "ALTER TABLE resumes ADD primary_language NVARCHAR(10) NOT NULL DEFAULT 'en'"
    ))
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'resumes') AND name=N'parsed_translations') "
        "ALTER TABLE resumes ADD parsed_translations NVARCHAR(MAX) NULL"
    ))
    # New columns: interview_decisions — language + translations for decision reports
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'interview_decisions') AND name=N'primary_language') "
        "ALTER TABLE interview_decisions ADD primary_language NVARCHAR(10) NOT NULL DEFAULT 'en'"
    ))
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'interview_decisions') AND name=N'report_translations') "
        "ALTER TABLE interview_decisions ADD report_translations NVARCHAR(MAX) NULL"
    ))
    # New columns: generated_offers — language + translations for offer content
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'generated_offers') AND name=N'primary_language') "
        "ALTER TABLE generated_offers ADD primary_language NVARCHAR(10) NOT NULL DEFAULT 'en'"
    ))
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'generated_offers') AND name=N'content_translations') "
        "ALTER TABLE generated_offers ADD content_translations NVARCHAR(MAX) NULL"
    ))
    # New columns: candidates — archive support
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'candidates') AND name=N'is_archived') "
        "ALTER TABLE candidates ADD is_archived BIT NOT NULL DEFAULT 0"
    ))
    conn.execute(text(
        "IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'candidates') AND name=N'archived_at') "
        "ALTER TABLE candidates ADD archived_at DATETIME NULL"
    ))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: create tables on startup, dispose engine on shutdown."""
    async with engine.begin() as conn:
        await conn.run_sync(_run_migrations)
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    debug=settings.DEBUG,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_PREFIX)
