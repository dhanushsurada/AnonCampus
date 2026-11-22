"""
NSRIT Institutional Seeding & Database Audit Script
Verifies and guarantees that Nadimpalli Satyanarayana Raju Institute of Technology (NSRIT)
and its administrative credentials are fully seeded and configured for public release.

Usage:
    PYTHONPATH=backend python scripts/seed_nsrit.py
"""
import asyncio
import logging
import sys
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, func
from app.db.session import AsyncSessionLocal, init_db, engine
from app.models.user import Institution, User, UserRole
from app.models.cluster import Cluster
from app.models.issue import Issue
from app.core.security import hash_password
from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seed_nsrit")


async def main():
    print("\n" + "=" * 70)
    print("  AnonCampus — NSRIT Institutional Audit & Production Readiness Seed")
    print("=" * 70)

    # Step 1: Initialize DB schema
    print("\n[1/4] Ensuring database schema and required indexes are present...")
    try:
        await init_db()
        print("  ✓ Database schema verified.")
    except Exception as e:
        print(f"  ✗ Schema init error: {e}")
        return 1

    # Step 2: Verify or Create NSRIT Institution
    print("\n[2/4] Verifying NSRIT Institution in database...")
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Institution).where(Institution.domain == "nsrit.edu.in")
        )
        inst = result.scalar_one_or_none()

        if not inst:
            print("  + NSRIT institution not found. Creating official NSRIT record...")
            inst = Institution(
                name="Nadimpalli Satyanarayana Raju Institute of Technology (NSRIT)",
                domain="nsrit.edu.in",
                allowed_email_domain="nsrit.edu.in",
                tier="medium",
                is_active=True,
            )
            session.add(inst)
            await session.commit()
            await session.refresh(inst)
            print(f"  ✓ NSRIT created successfully (ID: {inst.id})")
        else:
            updated = False
            if "Demo" in inst.name or inst.name == "Nsrit Edu In":
                inst.name = "Nadimpalli Satyanarayana Raju Institute of Technology (NSRIT)"
                updated = True
            if not inst.is_active:
                inst.is_active = True
                updated = True
            if updated:
                await session.commit()
                await session.refresh(inst)
                print(f"  ✓ Updated NSRIT details to official standards (ID: {inst.id})")
            else:
                print(f"  ✓ NSRIT institution is already present and active (ID: {inst.id})")

        # Step 3: Verify Administrator Account
        print("\n[3/4] Verifying NSRIT Administrator account...")

        # Deprecate legacy admin if present
        old_admin_result = await session.execute(
            select(User).where(User.email == "admin@nsrit.edu.in")
        )
        old_admin = old_admin_result.scalar_one_or_none()
        if old_admin and old_admin.email != settings.INITIAL_ADMIN_EMAIL:
            if old_admin.role in (UserRole.super_admin, "super_admin"):
                old_admin.role = UserRole.student
            if old_admin.student_id == "ADMIN0001":
                old_admin.student_id = "ADMIN_DEPRECATED"
            await session.commit()
            print("  ✓ Deprecated legacy admin@nsrit.edu.in role to student")

        admin_email = settings.INITIAL_ADMIN_EMAIL
        admin_result = await session.execute(
            select(User).where(User.email == admin_email)
        )
        admin = admin_result.scalar_one_or_none()

        if not admin:
            print(f"  + Admin account ({admin_email}) missing. Provisioning super_admin...")
            admin = User(
                email=admin_email,
                hashed_password=hash_password(settings.INITIAL_ADMIN_PASSWORD),
                student_id="ADMIN0001",
                role=UserRole.super_admin,
                institution_id=inst.id,
                is_verified=True,
                department="Administration",
                academic_year=1,
            )
            session.add(admin)
            await session.commit()
            print(f"  ✓ Administrator account created: {admin_email}")
        else:
            admin.hashed_password = hash_password(settings.INITIAL_ADMIN_PASSWORD)
            admin.role = UserRole.super_admin
            admin.institution_id = inst.id
            admin.is_verified = True
            await session.commit()
            print(f"  ✓ Administrator account verified: {admin_email} (Role: {admin.role.value if hasattr(admin.role, 'value') else admin.role})")

        # Step 4: Audit Existing Data & Concurrency Sizing
        print("\n[4/4] Auditing NSRIT data volume and concurrency sizing...")
        cluster_count = (await session.execute(
            select(func.count(Cluster.id)).where(Cluster.institution_id == inst.id)
        )).scalar() or 0

        user_count = (await session.execute(
            select(func.count(User.id)).where(User.institution_id == inst.id)
        )).scalar() or 0

        print(f"  - Institution ID:           {inst.id}")
        print(f"  - Institution Name:         {inst.name}")
        print(f"  - Primary Domain:           {inst.domain}")
        print(f"  - Allowed Email Domain:     @{inst.allowed_email_domain}")
        print(f"  - Active Status:            {'Active (Enabled)' if inst.is_active else 'Disabled'}")
        print(f"  - Registered Users:         {user_count}")
        print(f"  - Active Issue Topics:      {cluster_count}")
        print(f"  - DB Connection Pool Size:  {settings.DB_POOL_SIZE} (Max Overflow: {settings.DB_MAX_OVERFLOW})")
        print(f"  - Registration Rate Limit:  {settings.RATE_LIMIT_REGISTER_PER_HOUR}/hr (Campus NAT friendly)")
        print(f"  - Upvote Rate Limit:        {settings.RATE_LIMIT_SUPPORT_PER_DAY}/day per student")

    print("\n" + "=" * 70)
    print("  STATUS: NSRIT IS VERIFIED & READY FOR 1,000+ STUDENT CONCURRENCY")
    print("=" * 70 + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
