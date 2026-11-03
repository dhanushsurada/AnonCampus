"""
Integration tests — full API flow
Uses SQLite in-memory for test isolation (no real Postgres required).
Covers: register → login → submit issue → support → feedback → admin view
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# ── Test DB setup ──────────────────────────────────────────────────────────────

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture
async def test_db_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    from app.db.session import Base
    # Import all models
    import app.models.user
    import app.models.cluster
    import app.models.issue
    import app.models.report
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_db_engine):
    Session = async_sessionmaker(test_db_engine, expire_on_commit=False)
    async with Session() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(test_db_engine):
    from app.main import app
    from app.db.session import get_db
    from sqlalchemy.ext.asyncio import AsyncSession

    Session = async_sessionmaker(test_db_engine, expire_on_commit=False)

    async def override_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def registered_student(client):
    resp = await client.post("/api/auth/register", json={
        "email": "student1@nsrit.edu.in",
        "password": "Test1234",
        "student_id": "22NU1A0401",
        "department": "CSE",
        "academic_year": 2,
    })
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest_asyncio.fixture
async def student_token(client, registered_student):
    resp = await client.post("/api/auth/login", json={
        "email": "student1@nsrit.edu.in",
        "password": "Test1234",
    })
    assert resp.status_code == 200
    return resp.json()["access_token"]


@pytest_asyncio.fixture
async def registered_student2(client):
    resp = await client.post("/api/auth/register", json={
        "email": "student2@nsrit.edu.in",
        "password": "Test1234",
        "student_id": "22NU1A0402",
        "department": "ECE",
        "academic_year": 3,
    })
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest_asyncio.fixture
async def student2_token(client, registered_student2):
    resp = await client.post("/api/auth/login", json={
        "email": "student2@nsrit.edu.in",
        "password": "Test1234",
    })
    assert resp.status_code == 200
    return resp.json()["access_token"]


# ── Auth tests ────────────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_register_success(client):
    resp = await client.post("/api/auth/register", json={
        "email": "newuser@nsrit.edu.in",
        "password": "Test1234",
        "student_id": "22NU1A0499",
        "department": "MECH",
        "academic_year": 1,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "student_id" not in data          # NEVER exposed
    assert "anon_id" in data
    assert data["department"] == "MECH"


@pytest.mark.anyio
async def test_register_duplicate_email(client, registered_student):
    resp = await client.post("/api/auth/register", json={
        "email": "student1@nsrit.edu.in",
        "password": "Test1234",
        "student_id": "22NU1A9999",
        "department": "CSE",
        "academic_year": 1,
    })
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_register_duplicate_student_id(client, registered_student):
    resp = await client.post("/api/auth/register", json={
        "email": "different@nsrit.edu.in",
        "password": "Test1234",
        "student_id": "22NU1A0401",   # same as registered_student
        "department": "CSE",
        "academic_year": 2,
    })
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_register_invalid_year(client):
    resp = await client.post("/api/auth/register", json={
        "email": "yr@nsrit.edu.in",
        "password": "Test1234",
        "student_id": "22NU1A0888",
        "department": "CSE",
        "academic_year": 9,       # invalid — must be 1-4
    })
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_login_success(client, registered_student):
    resp = await client.post("/api/auth/login", json={
        "email": "student1@nsrit.edu.in",
        "password": "Test1234",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["role"] == "student"


@pytest.mark.anyio
async def test_login_wrong_password(client, registered_student):
    resp = await client.post("/api/auth/login", json={
        "email": "student1@nsrit.edu.in",
        "password": "WrongPass1",
    })
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_get_me(client, student_token):
    resp = await client.get("/api/auth/me",
                            headers={"Authorization": f"Bearer {student_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "student_id" not in data
    assert data["email"] == "student1@nsrit.edu.in"


# ── Issue tests ───────────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_submit_issue(client, student_token):
    resp = await client.post("/api/issues",
        headers={"Authorization": f"Bearer {student_token}"},
        json={
            "title": "WiFi is completely broken in all computer labs",
            "body": "The internet connection has been down for 3 days in Lab Block C. "
                    "Students cannot complete their cloud computing assignments. Urgent fix needed.",
            "category": "infrastructure",
        }
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["category"] == "infrastructure"
    assert "id" in data


@pytest.mark.anyio
async def test_submit_issue_too_short(client, student_token):
    resp = await client.post("/api/issues",
        headers={"Authorization": f"Bearer {student_token}"},
        json={"title": "Short", "body": "Too short"},
    )
    assert resp.status_code in (422, 400)


@pytest.mark.anyio
async def test_list_clusters(client, student_token):
    resp = await client.get("/api/issues/clusters",
                            headers={"Authorization": f"Bearer {student_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data


@pytest.mark.anyio
async def test_support_issue(client, student_token, student2_token):
    # Submit an issue first
    issue_resp = await client.post("/api/issues",
        headers={"Authorization": f"Bearer {student_token}"},
        json={
            "title": "Hostel mess food quality is extremely poor",
            "body": "The food served in hostel mess has been of very poor quality for weeks. "
                    "Many students are falling sick. This requires immediate management attention.",
        }
    )
    assert issue_resp.status_code == 201
    issue_id = issue_resp.json()["id"]

    # Support from a different user
    sup_resp = await client.post(f"/api/issues/{issue_id}/support",
                                  headers={"Authorization": f"Bearer {student2_token}"})
    assert sup_resp.status_code == 200

    # Duplicate support rejected
    dup_resp = await client.post(f"/api/issues/{issue_id}/support",
                                  headers={"Authorization": f"Bearer {student2_token}"})
    assert dup_resp.status_code == 400


@pytest.mark.anyio
async def test_unauthenticated_rejected(client):
    resp = await client.get("/api/issues")
    assert resp.status_code in (401, 403)


@pytest.mark.anyio
async def test_forgot_and_reset_password(client):
    # Register a user first
    reg = await client.post("/api/auth/register", json={
        "email": "resetuser@nsrit.edu.in",
        "password": "OldPassword1",
        "student_id": "RESET001",
        "department": "CSE",
        "academic_year": 3,
    })
    assert reg.status_code == 201

    # Request reset token
    forgot_resp = await client.post("/api/auth/forgot-password", json={
        "email": "resetuser@nsrit.edu.in",
    })
    assert forgot_resp.status_code == 200
    forgot_data = forgot_resp.json()
    assert "reset_token" in forgot_data
    token = forgot_data["reset_token"]

    # Reset password
    reset_resp = await client.post("/api/auth/reset-password", json={
        "token": token,
        "new_password": "NewSecretPassword1",
    })
    assert reset_resp.status_code == 200

    # Old password should now fail
    old_login = await client.post("/api/auth/login", json={
        "email": "resetuser@nsrit.edu.in",
        "password": "OldPassword1",
    })
    assert old_login.status_code == 401

    # New password should succeed
    new_login = await client.post("/api/auth/login", json={
        "email": "resetuser@nsrit.edu.in",
        "password": "NewSecretPassword1",
    })
    assert new_login.status_code == 200


@pytest.mark.anyio
async def test_reset_password_by_student_credentials(client):
    reg = await client.post("/api/auth/register", json={
        "email": "creduser@nsrit.edu.in",
        "password": "OldPass1234",
        "student_id": "CRED001",
        "department": "ECE",
        "academic_year": 2,
        "security_question": "What was the name of your first school?",
        "security_answer": "Oakridge",
    })
    assert reg.status_code == 201

    # Check retrieve security question endpoint
    sq_resp = await client.get("/api/auth/security-question?email=creduser@nsrit.edu.in&student_id=CRED001")
    assert sq_resp.status_code == 200
    assert sq_resp.json()["security_question"] == "What was the name of your first school?"

    # Attempt with incorrect roll number -> 400
    bad_id_resp = await client.post("/api/auth/reset-password-student-credentials", json={
        "email": "creduser@nsrit.edu.in",
        "student_id": "WRONG_ID",
        "department": "ECE",
        "academic_year": 2,
        "security_answer": "Oakridge",
        "new_password": "NewSecretPass99",
    })
    assert bad_id_resp.status_code == 400

    # Attempt with incorrect security answer -> 400
    bad_ans_resp = await client.post("/api/auth/reset-password-student-credentials", json={
        "email": "creduser@nsrit.edu.in",
        "student_id": "CRED001",
        "department": "ECE",
        "academic_year": 2,
        "security_answer": "WrongSchool",
        "new_password": "NewSecretPass99",
    })
    assert bad_ans_resp.status_code == 400

    # Attempt with correct student credentials and security answer -> 200
    good_resp = await client.post("/api/auth/reset-password-student-credentials", json={
        "email": "creduser@nsrit.edu.in",
        "student_id": "CRED001",
        "department": "ECE",
        "academic_year": 2,
        "security_answer": "oakridge",  # case-insensitive check
        "new_password": "NewSecretPass99",
    })
    assert good_resp.status_code == 200

    # Verify login with new password
    login_resp = await client.post("/api/auth/login", json={
        "email": "creduser@nsrit.edu.in",
        "password": "NewSecretPass99",
    })
    assert login_resp.status_code == 200


@pytest.mark.anyio
async def test_change_password(client, student_token):
    # Authenticated change password
    change_resp = await client.post("/api/auth/change-password",
        headers={"Authorization": f"Bearer {student_token}"},
        json={
            "current_password": "Test1234",
            "new_password": "BrandNewPassword1",
        }
    )
    assert change_resp.status_code == 200

    # Verify login with new password
    login_resp = await client.post("/api/auth/login", json={
        "email": "student1@nsrit.edu.in",
        "password": "BrandNewPassword1",
    })
    assert login_resp.status_code == 200


@pytest.mark.anyio
async def test_update_profile(client, student_token):
    # Authenticated update profile
    patch_resp = await client.patch("/api/auth/profile",
        headers={"Authorization": f"Bearer {student_token}"},
        json={
            "department": "CSD",
            "academic_year": 3,
            "email": "hacked@gmail.com",       # Attempt to change locked email
            "student_id": "HACKED999",          # Attempt to change locked roll number
        }
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["department"] == "CSD"
    assert data["academic_year"] == 3
    assert data["email"] == "student1@nsrit.edu.in"  # Email is locked and unchanged!
    assert "student_id" not in data                  # Roll number remains unexposed


@pytest.mark.anyio
async def test_my_issues_and_filters(client, student_token):
    # Submit issue
    submit_resp = await client.post("/api/issues",
        headers={"Authorization": f"Bearer {student_token}"},
        json={
            "title": "Water cooler in block B is broken and leaking",
            "body": "The water cooler in block B second floor has been leaking water on the floor for 2 days. This is a slip hazard.",
            "category": "infrastructure",
        }
    )
    assert submit_resp.status_code == 201
    issue_id = submit_resp.json()["id"]

    # Query /issues/me
    my_resp = await client.get("/api/issues/me",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert my_resp.status_code == 200
    my_data = my_resp.json()
    assert my_data["total"] >= 1
    ids = [i["id"] for i in my_data["items"]]
    assert issue_id in ids

    # Test cluster search & category filter
    cat_resp = await client.get("/api/issues/clusters?category=infrastructure",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert cat_resp.status_code == 200

    search_resp = await client.get("/api/issues/clusters?search=Water",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert search_resp.status_code == 200


@pytest.mark.anyio
async def test_cluster_comments_and_discussion(client, student_token, student2_token):
    # Submit issue to create a cluster
    issue_resp = await client.post("/api/issues",
        headers={"Authorization": f"Bearer {student_token}"},
        json={
            "title": "Library air conditioner not functioning in summer",
            "body": "The reading hall AC in main central library has stopped cooling. It is unbearable to study.",
            "category": "infrastructure",
        }
    )
    assert issue_resp.status_code == 201
    issue_id = issue_resp.json()["id"]

    # Get the cluster
    cl_resp = await client.get(f"/api/issues/{issue_id}/cluster",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert cl_resp.status_code == 200
    cluster_id = cl_resp.json()["cluster"]["id"]

    # Add a public anonymous comment
    comm_resp = await client.post(f"/api/issues/clusters/{cluster_id}/comments",
        headers={"Authorization": f"Bearer {student2_token}"},
        json={"content": "I agree! 3rd floor reading room is especially humid and hot today."}
    )
    assert comm_resp.status_code == 201
    comment_data = comm_resp.json()
    assert comment_data["content"] == "I agree! 3rd floor reading room is especially humid and hot today."
    assert "author_role" in comment_data

    # List comments
    list_resp = await client.get(f"/api/issues/clusters/{cluster_id}/comments",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert list_resp.status_code == 200
    comments = list_resp.json()
    assert len(comments) >= 1
    assert any(c["id"] == comment_data["id"] for c in comments)


@pytest.mark.anyio
async def test_retract_support(client, student_token, student2_token):
    issue_resp = await client.post("/api/issues",
        headers={"Authorization": f"Bearer {student_token}"},
        json={
            "title": "Sports ground lights are broken during evening hours",
            "body": "The floodlights near the volleyball court are flickering and completely shut off by 7 PM.",
            "category": "sports",
        }
    )
    issue_id = issue_resp.json()["id"]

    # Student 2 supports
    sup_resp = await client.post(f"/api/issues/{issue_id}/support",
        headers={"Authorization": f"Bearer {student2_token}"}
    )
    assert sup_resp.status_code == 200

    # Retract support
    del_resp = await client.delete(f"/api/issues/{issue_id}/support",
        headers={"Authorization": f"Bearer {student2_token}"}
    )
    assert del_resp.status_code == 200

    # Student 2 can now support again
    sup_resp2 = await client.post(f"/api/issues/{issue_id}/support",
        headers={"Authorization": f"Bearer {student2_token}"}
    )
    assert sup_resp2.status_code == 200


# ── Health probes ──────────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
