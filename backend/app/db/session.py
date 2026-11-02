from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings
import ssl


def _clean_db_url(url: str) -> str:
    """Remove all query parameters from asyncpg URL — SSL handled via connect_args"""
    return url.split('?')[0]


import os
import ssl

def _should_use_ssl(url: str) -> bool:
    """Determine whether to enforce SSL on asyncpg connection"""
    forced_ssl = os.getenv("DB_SSL", "").lower()
    if forced_ssl in ("true", "1"):
        return True
    if forced_ssl in ("false", "0"):
        return False
    lower_url = url.lower()
    if "sqlite" in lower_url:
        return False
    if "sslmode=disable" in lower_url:
        return False
    if "sslmode=require" in lower_url or "ssl=true" in lower_url:
        return True
    # If in production and connecting to an external cloud database
    if settings.ENVIRONMENT == "production":
        if "localhost" not in lower_url and "127.0.0.1" not in lower_url and "@postgres" not in lower_url:
            return True
    return False


def _clean_db_url(url: str) -> str:
    """Remove all query parameters from asyncpg URL — SSL handled via connect_args"""
    if "sqlite" in url:
        return url
    return url.split('?')[0]


connect_args = {}
if _should_use_ssl(settings.DATABASE_URL):
    _ssl_ctx = ssl.create_default_context()
    connect_args["ssl"] = _ssl_ctx

engine = create_async_engine(
    _clean_db_url(settings.DATABASE_URL),
    echo=settings.ENVIRONMENT == "development",
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    connect_args=connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        from app.models import user, cluster, issue, report
        await conn.run_sync(Base.metadata.create_all)
