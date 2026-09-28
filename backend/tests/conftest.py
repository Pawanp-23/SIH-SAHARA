"""Tests run against a temporary copy of the seeded database so the demo data stays untouched."""
import os
import shutil
import tempfile
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parents[1] / "data" / "sahara.db"
_tmp = Path(tempfile.mkdtemp()) / "sahara_test.db"
if not SRC.exists():
    raise RuntimeError("Seed the database first: python -m scripts.seed")
shutil.copy(SRC, _tmp)
os.environ["SAHARA_DB_URL"] = f"sqlite:///{_tmp}"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def login(client, username: str, purpose: str | None = None) -> dict:
    r = client.post("/v1/auth/login", json={"username": username})
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    if purpose:
        h["X-Purpose-Of-Use"] = purpose
    return h
