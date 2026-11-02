"""
AnonCampus — FastAPI application entrypoint

Production mode (ENVIRONMENT=production):
  - API docs disabled
  - Auto-seeding disabled
  - Log level: WARNING
  - CORS: strict (ALLOWED_ORIGINS only, never *)

Development mode (ENVIRONMENT=development):
  - API docs enabled at /api/docs
  - Demo institution + admin auto-seeded on first run
  - Log level: INFO
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.utils.observability import setup_logging
from app.api.routes import auth, issues, admin

# Configure structured logging — WARNING in production, INFO in dev
setup_logging(level=logging.WARNING if settings.ENVIRONMENT == "production" else logging.INFO)
logger = logging.getLogger("anoncampus.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AnonCampus starting up (env=%s)", settings.ENVIRONMENT)
    from app.db.session import init_db
    await init_db()

    # Only seed in development — never in production
    if settings.ENVIRONMENT != "production":
        await _seed_defaults()

    logger.info("AnonCampus ready")
    yield
    logger.info("AnonCampus shutting down")


# Disable interactive docs in production
_docs_url  = None if settings.ENVIRONMENT == "production" else "/api/docs"
_redoc_url = None if settings.ENVIRONMENT == "production" else "/api/redoc"

app = FastAPI(
    title="AnonCampus API",
    description="Anonymous Grievance Intelligence Platform",
    version="1.0.0",
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    lifespan=lifespan,
)

# CORS — strict, never wildcard
# In production ALLOWED_ORIGINS must list exact frontend domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,   # e.g. ["https://app.yourdomain.com"]
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID"],
)

# Security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.ENVIRONMENT == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# Routers
app.include_router(auth.router,   prefix="/api")
app.include_router(issues.router, prefix="/api")
app.include_router(admin.router,  prefix="/api")


# ── Health probes ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["ops"], include_in_schema=False)
async def health():
    """Liveness probe — returns 200 if the process is alive."""
    return {"status": "ok", "service": "anoncampus-api", "env": settings.ENVIRONMENT}


@app.get("/ready", tags=["ops"], include_in_schema=False)
async def readiness():
    """
    Readiness probe — checks DB and Redis connectivity.
    Returns 200 only when all upstream dependencies are reachable.
    Used by Docker HEALTHCHECK and load-balancer probes.
    """
    checks = {"db": False, "redis": False}

    try:
        from app.db.session import AsyncSessionLocal
        from sqlalchemy import text
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        checks["db"] = True
    except Exception as exc:
        logger.warning("DB readiness check failed: %s", exc)

    try:
        import redis as redis_sync
        r = redis_sync.from_url(settings.REDIS_URL, socket_timeout=1)
        r.ping()
        checks["redis"] = True
    except Exception as exc:
        logger.warning("Redis readiness check failed: %s", exc)

    all_ready = all(checks.values())
    return JSONResponse(
        status_code=200 if all_ready else 503,
        content={"status": "ready" if all_ready else "not_ready", "checks": checks},
    )


@app.get("/", tags=["ops"], include_in_schema=False)
async def root():
    return {"message": "AnonCampus API", "docs": _docs_url or "disabled in production"}


# ── Development seeding (never runs in production) ────────────────────────────

async def _seed_defaults():
    """
    Creates a demo institution, admin, and demo student with sample clusters on first run.
    Only called when ENVIRONMENT != production.
    Default credentials:
      admin@nsrit.edu.in / Admin1234
      student@nsrit.edu.in / Admin1234
    """
    from datetime import datetime, timezone, timedelta
    from app.db.session import AsyncSessionLocal
    from app.models.user import Institution, User
    from app.models.cluster import Cluster
    from app.models.issue import Issue
    from app.core.security import hash_password
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Institution).limit(1))
        if result.scalar_one_or_none():
            return  # Already seeded

        inst = Institution(
            name="NSRIT — Demo Campus",
            domain="nsrit.edu.in",
            allowed_email_domain="nsrit.edu.in",
            tier="medium",
            is_active=True,
        )
        db.add(inst)
        await db.flush()

        admin_user = User(
            email="admin@nsrit.edu.in",
            hashed_password=hash_password("Admin1234"),
            student_id="ADMIN0001",
            role="super_admin",
            institution_id=inst.id,
            is_verified=True,
            department="Administration",
            academic_year=1,
        )
        db.add(admin_user)

        student_user = User(
            email="student@nsrit.edu.in",
            hashed_password=hash_password("Admin1234"),
            student_id="22NU1A0501",
            role="student",
            institution_id=inst.id,
            is_verified=True,
            department="CSE",
            academic_year=3,
        )
        db.add(student_user)
        await db.flush()

        # Seed initial demo clusters for realistic showcase
        cluster1 = Cluster(
            institution_id=inst.id,
            title="Wi-Fi connectivity failure across central library & CSE labs",
            summary="Multiple students reporting sustained network outages in Lab 3 and 4 during practical exam hours.",
            category="infrastructure",
            status="active",
            severity=0.75,
            confidence_score=0.82,
            visibility_score=0.88,
            diversity_score=0.65,
            diversity_valid=True,
            is_escalated=False,
            report_count=8,
            support_count=15,
            context_count=3,
            scope=0.6,
            departments_involved=["CSE", "ECE", "IT"],
            years_involved=[2, 3, 4],
            sla_deadline=datetime.now(timezone.utc) + timedelta(hours=48),
        )
        db.add(cluster1)
        await db.flush()

        issue1 = Issue(
            institution_id=inst.id,
            cluster_id=cluster1.id,
            title="Wi-Fi connectivity failure across central library & CSE labs",
            body="Internet connection drops every 10 minutes in Lab 3. We cannot load compiler tools or submit labs.",
            category="infrastructure",
            status="active",
            severity=0.75,
            is_moderated=True,
            submitter_department="CSE",
            submitter_year=3,
        )
        db.add(issue1)

        await db.commit()
        logger.info("Dev seed complete — admin@nsrit.edu.in & student@nsrit.edu.in / Admin1234")
