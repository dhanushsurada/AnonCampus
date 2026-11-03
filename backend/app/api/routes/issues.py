"""
Issues API routes — all queries institution-scoped
Rate limits enforced per action
Idempotency-Key header supported on POST /issues
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, desc, func
from typing import Optional, List

from app.db.session import get_db
from app.models.user import User
from app.models.issue import Issue
from app.models.cluster import Cluster
from app.models.report import Report, Vote, Comment
from app.schemas.issue import (
    IssueCreate, IssueResponse, IssueDetailResponse,
    FeedbackCreate, ContextAddRequest, PaginatedResponse,
    ClusterResponse, ClusterDetailResponse, ScoreExplanation,
    CommentCreate, CommentResponse,
)
from app.core.security import get_current_user
from app.middleware.rate_limit import (
    check_issue_submit_limit, check_support_limit,
    check_feedback_limit, check_comment_limit, get_idempotency_key,
)
from app.services.issue_service import submit_issue, add_support, add_context, submit_feedback

router = APIRouter(prefix="/issues", tags=["issues"])


@router.post("", response_model=IssueResponse, status_code=status.HTTP_201_CREATED)
async def create_issue(
    payload: IssueCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_issue_submit_limit(current_user.id)
    idem_key = get_idempotency_key(request)
    issue = await submit_issue(db, payload, current_user, idempotency_key=idem_key)
    return issue


@router.get("/clusters", response_model=PaginatedResponse)
async def list_clusters(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None),
    feed_type: Optional[str] = Query(None, description="new|active|trending|urgent|resolved"),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    escalated_only: Optional[bool] = Query(False),
    severity_min: Optional[float] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Student feed — clusters sorted by visibility score"""
    conditions = [
        Cluster.institution_id == current_user.institution_id,
        Cluster.status != "archived",
    ]
    if status_filter:
        conditions.append(Cluster.status == status_filter.lower())
    elif feed_type == "new":
        conditions.append(Cluster.status == "new")
    elif feed_type == "active":
        conditions.append(Cluster.status == "active")
    elif feed_type == "trending":
        conditions.append(Cluster.visibility_score >= 0.5)
    elif feed_type == "urgent":
        conditions.append(or_(Cluster.is_escalated == True, Cluster.severity >= 0.7))
    elif feed_type == "resolved":
        conditions.append(Cluster.status == "resolved")

    if escalated_only:
        conditions.append(Cluster.is_escalated == True)
    if severity_min is not None and severity_min > 0:
        conditions.append(Cluster.severity >= severity_min)

    if category:
        conditions.append(Cluster.category == category.lower())

    if search:
        search_term = f"%{search.strip()}%"
        conditions.append(
            or_(
                Cluster.title.ilike(search_term),
                Cluster.summary.ilike(search_term),
            )
        )

    base = select(Cluster).where(and_(*conditions))
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar()
    result = await db.execute(
        base.order_by(desc(Cluster.visibility_score))
            .offset((page - 1) * page_size).limit(page_size)
    )
    items = result.scalars().all()

    cluster_ids = [c.id for c in items]
    user_voted_cluster_ids = set()
    comment_counts = {}
    if cluster_ids:
        # Check votes by current user
        vote_stmt = (
            select(Issue.cluster_id)
            .join(Vote, Vote.issue_id == Issue.id)
            .where(
                Vote.voter_id == current_user.id,
                Issue.cluster_id.in_(cluster_ids)
            )
        )
        user_voted_cluster_ids = set((await db.execute(vote_stmt)).scalars().all())

        # Count comments for these clusters
        comment_stmt = (
            select(Comment.cluster_id, func.count(Comment.id))
            .where(Comment.cluster_id.in_(cluster_ids))
            .group_by(Comment.cluster_id)
        )
        comment_counts = dict((await db.execute(comment_stmt)).all())

    response_items = []
    for c in items:
        c_dict = ClusterResponse.model_validate(c).model_dump()
        c_dict["user_supported"] = c.id in user_voted_cluster_ids
        c_dict["comment_count"] = comment_counts.get(c.id, 0)
        response_items.append(ClusterResponse(**c_dict))

    return PaginatedResponse(
        items=response_items,
        total=total, page=page, page_size=page_size,
        has_next=(page * page_size) < total,
    )


@router.get("/me", response_model=PaginatedResponse)
async def list_my_issues(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns issues submitted by the current authenticated student.
    Anonymity is maintained externally — only the submitter can view their own submission history.
    """
    subquery = (
        select(Report.issue_id)
        .where(
            Report.reporter_id == current_user.id,
            Report.institution_id == current_user.institution_id,
            Report.signal_type == "report",
        )
    )
    base = select(Issue).where(
        Issue.institution_id == current_user.institution_id,
        Issue.id.in_(subquery),
    )
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    result = await db.execute(
        base.order_by(desc(Issue.created_at))
            .offset((page - 1) * page_size).limit(page_size)
    )
    items = result.scalars().all()
    return PaginatedResponse(
        items=[IssueResponse.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        has_next=(page * page_size) < total,
    )


@router.get("", response_model=PaginatedResponse)
async def list_issues(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    sort_by: str = Query("created_at", pattern="^(created_at|severity)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conditions = [Issue.institution_id == current_user.institution_id]
    if status_filter:
        conditions.append(Issue.status == status_filter.lower())
    if category:
        conditions.append(Issue.category == category)

    base = select(Issue).where(and_(*conditions))
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar()
    order_col = desc(Issue.severity) if sort_by == "severity" else desc(Issue.created_at)
    result = await db.execute(
        base.order_by(order_col).offset((page - 1) * page_size).limit(page_size)
    )
    items = result.scalars().all()
    return PaginatedResponse(
        items=[IssueResponse.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        has_next=(page * page_size) < total,
    )


@router.get("/{issue_id}", response_model=IssueDetailResponse)
async def get_issue(
    issue_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    issue = await db.get(Issue, issue_id)
    if not issue or issue.institution_id != current_user.institution_id:
        raise HTTPException(status_code=404, detail="Issue not found")
    return issue


@router.post("/{issue_id}/support", status_code=200)
async def support_issue(
    issue_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_support_limit(current_user.id)
    ok = await add_support(db, issue_id, current_user)
    if not ok:
        raise HTTPException(status_code=400, detail="Already supported or issue not found")
    return {"message": "Support recorded"}


@router.delete("/{issue_id}/support", status_code=200)
async def remove_issue_support(
    issue_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.issue_service import _resolve_issue, _trigger_score
    issue = await _resolve_issue(db, issue_id, current_user.institution_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    vote_res = await db.execute(
        select(Vote).where(Vote.issue_id == issue.id, Vote.voter_id == current_user.id)
    )
    vote = vote_res.scalar_one_or_none()
    if not vote:
        raise HTTPException(status_code=400, detail="Not supported yet")

    await db.delete(vote)
    await db.commit()
    _trigger_score(issue.cluster_id)
    return {"message": "Support removed"}


@router.post("/{issue_id}/context", status_code=200)
async def add_issue_context(
    issue_id: int,
    payload: ContextAddRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ok = await add_context(db, issue_id, current_user, payload.context_text)
    if not ok:
        raise HTTPException(status_code=400, detail="Context already added or issue not found")
    return {"message": "Context recorded"}


@router.post("/{issue_id}/feedback", status_code=200)
async def give_feedback(
    issue_id: int,
    payload: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_feedback_limit(current_user.id)
    ok = await submit_feedback(db, issue_id, current_user, payload)
    if not ok:
        raise HTTPException(status_code=400, detail="Feedback already submitted or issue not found")
    return {"message": "Feedback recorded"}


@router.get("/clusters/{cluster_id}", response_model=ClusterDetailResponse)
async def get_cluster_by_id(
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cluster = await db.get(Cluster, cluster_id)
    if not cluster or cluster.institution_id != current_user.institution_id:
        raise HTTPException(status_code=404, detail="Cluster not found")

    issue_count = (await db.execute(
        select(func.count()).where(Issue.cluster_id == cluster_id)
    )).scalar() or 0

    user_supported = (await db.execute(
        select(func.count())
        .select_from(Vote)
        .join(Issue, Issue.id == Vote.issue_id)
        .where(Vote.voter_id == current_user.id, Issue.cluster_id == cluster_id)
    )).scalar() > 0

    comment_count = (await db.execute(
        select(func.count()).where(Comment.cluster_id == cluster_id)
    )).scalar() or 0

    explanation = ScoreExplanation(
        confidence=cluster.confidence_score,
        diversity_valid=cluster.diversity_valid,
        escalated=cluster.is_escalated,
        escalation_type=cluster.escalation_type,
        reason={
            "reports": cluster.report_count,
            "supports": cluster.support_count,
            "contexts": cluster.context_count,
            "diversity": (
                f"valid ({len(cluster.departments_involved)} depts, "
                f"{len(cluster.years_involved)} years)"
                if cluster.diversity_valid
                else "insufficient cross-department diversity"
            ),
            "severity": cluster.severity,
            "scope": cluster.scope,
        },
    )

    c_dict = ClusterResponse.model_validate(cluster).model_dump()
    c_dict["user_supported"] = user_supported
    c_dict["comment_count"] = comment_count

    return ClusterDetailResponse(
        **c_dict,
        explanation=explanation,
        timeline=[],
        issue_count=issue_count,
    )


@router.get("/{issue_id}/cluster")
async def get_issue_cluster(
    issue_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target_cluster = None
    issue = await db.get(Issue, issue_id)
    if issue and issue.institution_id == current_user.institution_id:
        if issue.cluster_id:
            target_cluster = await db.get(Cluster, issue.cluster_id)
    elif not target_cluster:
        # Fallback: maybe issue_id is actually cluster_id (from frontend issue link)
        cluster = await db.get(Cluster, issue_id)
        if cluster and cluster.institution_id == current_user.institution_id:
            target_cluster = cluster

    if not target_cluster:
        raise HTTPException(status_code=404, detail="Issue or cluster not found")

    user_supported = (await db.execute(
        select(func.count())
        .select_from(Vote)
        .join(Issue, Issue.id == Vote.issue_id)
        .where(Vote.voter_id == current_user.id, Issue.cluster_id == target_cluster.id)
    )).scalar() > 0

    comment_count = (await db.execute(
        select(func.count()).where(Comment.cluster_id == target_cluster.id)
    )).scalar() or 0

    c_dict = ClusterResponse.model_validate(target_cluster).model_dump()
    c_dict["user_supported"] = user_supported
    c_dict["comment_count"] = comment_count
    return {"cluster": ClusterResponse(**c_dict)}


@router.get("/clusters/{cluster_id}/comments", response_model=List[CommentResponse])
async def list_cluster_comments(
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cluster = await db.get(Cluster, cluster_id)
    if not cluster or cluster.institution_id != current_user.institution_id:
        raise HTTPException(status_code=404, detail="Cluster not found")

    result = await db.execute(
        select(Comment)
        .where(Comment.cluster_id == cluster_id)
        .order_by(Comment.created_at.asc())
    )
    comments = result.scalars().all()
    return [CommentResponse.model_validate(c) for c in comments]


@router.post("/clusters/{cluster_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_cluster_comment(
    cluster_id: int,
    payload: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_comment_limit(current_user.id)
    cluster = await db.get(Cluster, cluster_id)
    if not cluster or cluster.institution_id != current_user.institution_id:
        raise HTTPException(status_code=404, detail="Cluster not found")

    author_role_str = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    comment = Comment(
        cluster_id=cluster_id,
        user_id=current_user.id,
        institution_id=current_user.institution_id,
        content=payload.content,
        author_role=author_role_str,
        author_department=current_user.department,
        author_year=current_user.academic_year,
    )
    db.add(comment)
    cluster.last_activity_at = func.now()
    await db.commit()
    await db.refresh(comment)
    return CommentResponse.model_validate(comment)
