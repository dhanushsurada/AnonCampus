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

engine_kwargs = {
    "echo": settings.ENVIRONMENT == "development",
    "connect_args": connect_args,
}

if "sqlite" in settings.DATABASE_URL.lower():
    engine_kwargs["pool_pre_ping"] = True
else:
    engine_kwargs.update({
        "pool_pre_ping": True,
        "pool_size": settings.DB_POOL_SIZE,
        "max_overflow": settings.DB_MAX_OVERFLOW,
        "pool_timeout": settings.DB_POOL_TIMEOUT,
        "pool_recycle": settings.DB_POOL_RECYCLE,
    })

engine = create_async_engine(
    _clean_db_url(settings.DATABASE_URL),
    **engine_kwargs
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


async def ensure_nsrit_institution(db: AsyncSession):
    """Guarantees that NSRIT institution and its primary record exist in the database."""
    from sqlalchemy import select
    from app.models.user import Institution

    res = await db.execute(
        select(Institution).where(Institution.domain == "nsrit.edu.in")
    )
    inst = res.scalar_one_or_none()
    if not inst:
        inst = Institution(
            name="Nadimpalli Satyanarayana Raju Institute of Technology (NSRIT)",
            domain="nsrit.edu.in",
            allowed_email_domain="nsrit.edu.in",
            tier="medium",
            is_active=True,
        )
        db.add(inst)
        await db.commit()
        await db.refresh(inst)
    else:
        updated = False
        if "Demo" in inst.name or inst.name == "Nsrit Edu In":
            inst.name = "Nadimpalli Satyanarayana Raju Institute of Technology (NSRIT)"
            updated = True
        if not inst.is_active:
            inst.is_active = True
            updated = True
        if updated:
            await db.commit()
            await db.refresh(inst)
    return inst


async def init_db():
    async with engine.begin() as conn:
        from app.models import user, cluster, issue, report
        await conn.run_sync(Base.metadata.create_all)
        try:
            from sqlalchemy import text
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS security_question VARCHAR(255);"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS hashed_security_answer VARCHAR(255);"))
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS comments (
                    id SERIAL PRIMARY KEY,
                    cluster_id INTEGER NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
                    content TEXT NOT NULL,
                    author_role VARCHAR(20) NOT NULL DEFAULT 'student',
                    author_department VARCHAR(100),
                    author_year INTEGER,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_comments_cluster ON comments(cluster_id);"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_comments_created ON comments(created_at);"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_clusters_institution_category ON clusters(institution_id, category);"))
        except Exception:
            pass  # Non-PostgreSQL dialects or SQLite in-memory tests ignore this

    # Ensure NSRIT exists in database on startup
    try:
        async with AsyncSessionLocal() as session:
            await ensure_nsrit_institution(session)
    except Exception:
        pass  # In tests or offline environments, ignore
