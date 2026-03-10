from urllib.parse import quote_plus

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


def _build_connection_url() -> str:
    """Build the async MSSQL connection URL.

    Uses odbc_connect parameter to pass the raw ODBC connection string,
    which handles instance names (backslash) and Windows auth correctly.
    """
    odbc_string = (
        f"DRIVER={{{settings.DB_DRIVER}}};"
        f"SERVER={settings.DB_SERVER};"
        f"DATABASE={settings.DB_NAME};"
        f"Trusted_Connection={settings.DB_TRUSTED_CONNECTION};"
        f"TrustServerCertificate={settings.DB_TRUST_SERVER_CERT};"
    )
    return f"mssql+aioodbc:///?odbc_connect={quote_plus(odbc_string)}"


engine = create_async_engine(
    _build_connection_url(),
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

async_session = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    """FastAPI dependency that provides an async database session.

    Commits on success, rolls back on exception, and always closes the session.
    """
    session = async_session()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
