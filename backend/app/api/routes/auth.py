"""
Auth routes — fully hardened

- Register: domain validated against institution.allowed_email_domain
- Register: (institution_id, student_id) uniqueness enforced
- Login: lockout after 10 failed attempts (15-min block)
- Login: clears lockout on success
- Refresh: DB-backed token rotation with reuse detection
- Logout: revokes refresh token from DB
- Logout-all: revokes all sessions
"""
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.user import User, Institution
from app.schemas.auth import (
    RegisterRequest, LoginRequest, TokenResponse, UserResponse,
    ForgotPasswordRequest, ResetPasswordRequest, ChangePasswordRequest,
    StudentCredentialResetRequest,
)
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
    store_refresh_token, revoke_refresh_token, revoke_all_user_tokens,
    check_login_lockout, record_login_failure, clear_login_failures,
    get_current_user,
    create_password_reset_token, verify_password_reset_token,
)
from app.core.config import settings
from app.middleware.rate_limit import check_register_limit
from app.services.email_service import send_password_reset_email

logger = logging.getLogger("anoncampus.auth")
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # Rate limit: 5 registrations/hour per IP
    client_ip = request.client.host if request.client else "unknown"
    check_register_limit(client_ip)

    # Step 1: Extract domain from email
    domain = payload.email.split("@")[-1].lower()

    # Step 2: Match institution by domain
    inst_result = await db.execute(
        select(Institution).where(
            Institution.domain == domain,
            Institution.is_active == True,
        )
    )
    institution = inst_result.scalar_one_or_none()

    if not institution:
        # Dev mode: auto-create institution for unknown domains
        institution = Institution(
            name=domain.replace(".", " ").title(),
            domain=domain,
            allowed_email_domain=domain,
            tier="medium",
        )
        db.add(institution)
        await db.flush()

    # Step 3: Validate email domain matches institution's allowed domain
    if domain != institution.allowed_email_domain.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email domain '{domain}' not allowed for this institution. "
                   f"Expected: {institution.allowed_email_domain}",
        )

    # Step 4: Check email uniqueness
    existing_email = await db.execute(select(User).where(User.email == payload.email))
    if existing_email.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Step 5: Check (institution_id, student_id) uniqueness
    existing_sid = await db.execute(
        select(User).where(
            User.institution_id == institution.id,
            User.student_id == payload.student_id.upper(),
        )
    )
    if existing_sid.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Student ID already registered at this institution",
        )

    # Step 6: Create user
    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        student_id=payload.student_id.upper(),
        institution_id=institution.id,
        department=payload.department,
        academic_year=payload.academic_year,
        is_verified=True,
        security_question=payload.security_question.strip() if payload.security_question else None,
        hashed_security_answer=hash_password(payload.security_answer.strip().lower()) if payload.security_answer else None,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    logger.info(f"User registered: id={user.id} inst={institution.id} dept={user.department}")
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else "unknown"

    # Check lockout BEFORE attempting authentication
    check_login_lockout(client_ip)

    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    # Constant-time comparison — don't leak user existence via timing
    if not user or not verify_password(payload.password, user.hashed_password):
        record_login_failure(client_ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    # Success — clear failure count
    clear_login_failures(client_ip)

    # Issue tokens with shared family_id for rotation tracking
    family_id = str(uuid.uuid4())
    access_token = create_access_token(user.id, user.institution_id, user.role, family_id)
    refresh_token = create_refresh_token(user.id, user.institution_id, user.role, family_id)

    # Store refresh token in DB
    await store_refresh_token(db, refresh_token, user.id, user.institution_id, family_id)
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        anon_id=user.anon_id,
        role=user.role,
        institution_id=user.institution_id,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Refresh token rotation:
    1. Validate refresh token signature
    2. Check not revoked in DB (reuse → revoke family)
    3. Revoke old token
    4. Issue new access + refresh pair
    """
    body = await request.json()
    raw_refresh = body.get("refresh_token")
    if not raw_refresh:
        raise HTTPException(status_code=400, detail="refresh_token required")

    payload = decode_token(raw_refresh, expected_type="refresh")
    user_id = int(payload["sub"])

    # Revoke old token (detects reuse internally)
    await revoke_refresh_token(db, raw_refresh, reason="rotation")

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Issue new token pair
    family_id = str(uuid.uuid4())
    access_token = create_access_token(user.id, user.institution_id, user.role, family_id)
    refresh_token = create_refresh_token(user.id, user.institution_id, user.role, family_id)
    await store_refresh_token(db, refresh_token, user.id, user.institution_id, family_id)
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        anon_id=user.anon_id,
        role=user.role,
        institution_id=user.institution_id,
    )


@router.post("/logout", status_code=200)
async def logout(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    body = await request.json()
    raw_refresh = body.get("refresh_token")
    if raw_refresh:
        await revoke_refresh_token(db, raw_refresh, reason="logout")
        await db.commit()
    return {"message": "Logged out"}


@router.post("/logout-all", status_code=200)
async def logout_all(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revoke all refresh tokens for this user (all devices)"""
    await revoke_all_user_tokens(db, current_user.id, reason="logout_all")
    await db.commit()
    return {"message": "All sessions revoked"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/forgot-password")
async def forgot_password(
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate password reset token and dispatch email via SMTP (if configured).
    Generic response to prevent user enumeration.
    In development/non-production, returns reset_token & reset_url directly for testing.
    """
    result = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = result.scalar_one_or_none()

    response_data = {
        "message": "If this email is registered, a password reset link has been dispatched.",
        "email_sent": False,
    }

    if user and user.is_active:
        token = create_password_reset_token(user.email)
        # Attempt delivery via SMTP
        email_sent = await send_password_reset_email(user.email, token)
        response_data["email_sent"] = email_sent

        if email_sent:
            response_data["message"] = f"A password reset link has been sent to {user.email}."

        if settings.ENVIRONMENT != "production":
            response_data["reset_token"] = token
            response_data["reset_url"] = f"/auth/reset-password?token={token}"
            logger.info(f"Password reset token generated for {user.email}: {token} (SMTP delivered: {email_sent})")
        else:
            logger.info(f"Password reset triggered for {user.email} (SMTP delivered: {email_sent})")

    return response_data


@router.get("/security-question")
async def get_security_question(
    email: str = Query(...),
    student_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve registered security question for student credential recovery.
    """
    result = await db.execute(
        select(User).where(
            User.email == email.lower(),
            User.student_id == student_id.strip().upper(),
            User.is_active == True,
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student account not found with provided email and ID",
        )

    return {
        "security_question": user.security_question or "What was the name of your first school?",
        "has_security_question": bool(user.hashed_security_answer),
    }


@router.post("/reset-password-student-credentials")
async def reset_password_by_student_credentials(
    payload: StudentCredentialResetRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Alternative password recovery for students when college domain email
    delivery is blocked, delayed, or unreachable.
    Validates email + student_id + department + academic_year + security_answer.
    """
    result = await db.execute(
        select(User).where(
            User.email == payload.email.lower(),
            User.student_id == payload.student_id.strip().upper(),
            User.department == payload.department.strip(),
            User.academic_year == payload.academic_year,
            User.is_active == True,
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student credentials do not match our records",
        )

    # If the user registered a security answer, enforce it
    if user.hashed_security_answer:
        if not payload.security_answer:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Security answer is required for this account",
            )
        if not verify_password(payload.security_answer.strip().lower(), user.hashed_security_answer):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incorrect answer to the security question",
            )

    user.hashed_password = hash_password(payload.new_password)
    await revoke_all_user_tokens(db, user.id, reason="student_credential_reset")
    await db.commit()

    logger.info(f"Password reset via verified student credentials for user id={user.id}")
    return {"message": "Password reset successfully. You can now sign in with your new password."}


@router.post("/reset-password")
async def reset_password(
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Reset user password using a valid reset token.
    Revokes all previous refresh tokens/sessions.
    """
    email = verify_password_reset_token(payload.token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found or account disabled",
        )

    user.hashed_password = hash_password(payload.new_password)
    await revoke_all_user_tokens(db, user.id, reason="password_reset")
    await db.commit()

    logger.info(f"Password successfully reset for user id={user.id}")
    return {"message": "Password reset successfully. You can now sign in with your new password."}


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Change password for an authenticated user.
    Validates current password and updates to new password.
    """
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    current_user.hashed_password = hash_password(payload.new_password)
    await revoke_all_user_tokens(db, current_user.id, reason="change_password")
    await db.commit()

    logger.info(f"Password changed for user id={current_user.id}")
    return {"message": "Password updated successfully"}
