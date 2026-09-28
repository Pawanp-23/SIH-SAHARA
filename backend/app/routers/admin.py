"""Auth, audit, model metrics, HRMS integration and health."""
import json

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.db import get_db
from ..core.errors import NotFound
from ..core.security import DEMO_USERS, Principal, create_token, require
from ..ml.engine import METRICS_PATH
from ..models import AuditEvent
from ..schemas import LoginIn
from ..services import repository as repo
from ..services.audit import record, verify_chain
from ..services.risk import risk_service

router = APIRouter(prefix="/v1", tags=["admin"])
staff = require("welfare_officer", "counsellor", "commander", "planner", "auditor")


@router.get("/health")
def health():
    return {"status": "ok", "model_ready": METRICS_PATH.exists()}


@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    token = create_token(body.username)
    u = DEMO_USERS[body.username]
    record(db, actor=body.username, role=u["role"], action="login", resource="auth", purpose="authentication")
    return {"access_token": token, "token_type": "bearer", "user": {"username": body.username, **u}}


@router.get("/auth/demo-users")
def demo_users():
    return [{"username": k, "role": v["role"], "name": v["name"]} for k, v in DEMO_USERS.items()]


@router.get("/audit")
def audit(p: Principal = Depends(require("auditor", "welfare_officer")), db: Session = Depends(get_db),
          limit: int = Query(100, le=500), outcome: str | None = None):
    q = select(AuditEvent).order_by(AuditEvent.id.desc()).limit(limit)
    if outcome:
        q = q.where(AuditEvent.outcome == outcome)
    rows = db.execute(q).scalars().all()
    return [{"id": e.id, "ts": e.ts.isoformat(), "actor": e.actor, "role": e.role, "action": e.action,
             "resource": e.resource, "purpose": e.purpose, "subject": e.subject_person, "outcome": e.outcome,
             "detail": e.detail, "hash": e.hash[:16]} for e in rows]


@router.get("/audit/verify")
def audit_verify(p: Principal = Depends(require("auditor", "welfare_officer")), db: Session = Depends(get_db)):
    return verify_chain(db)


@router.get("/metrics")
def metrics(p: Principal = Depends(staff)):
    if not METRICS_PATH.exists():
        raise NotFound("Metrics not available. Run the seed pipeline.")
    return {**json.loads(METRICS_PATH.read_text()), "model_version": risk_service.engine.version}


class HrmsEvent(BaseModel):
    person_id: str = Field(pattern=r"^P-\d{3}$")
    open_needs: int = Field(ge=0, le=10)


@router.post("/integrations/hrms/events")
def hrms_events(events: list[HrmsEvent], p: Principal = Depends(require("service")), db: Session = Depends(get_db)):
    """Adapter endpoint for HRMS pushes (prototype: welfare-need counts). Idempotent per person/day."""
    for e in events:
        repo.person(e.person_id)
        repo.update_daily(e.person_id, repo.TODAY, {"open_needs": e.open_needs})
        risk_service.recompute(e.person_id)
    record(db, actor=p.username, role=p.role, action="hrms_ingest", resource="integrations/hrms",
           purpose="integration", detail=f"{len(events)} events")
    return {"accepted": len(events)}
