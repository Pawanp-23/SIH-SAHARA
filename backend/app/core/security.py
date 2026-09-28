"""Authentication (demo JWT login), role checks and purpose-of-use enforcement.

Prototype note: demo users log in by username only. Production replaces `login` with the
force's OIDC identity provider + MFA; the role/unit/purpose checks below stay the same.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from .config import JWT_ALGO, JWT_SECRET
from .db import get_db
from .errors import Forbidden, Unauthorized

DEMO_USERS = {
    "p104": {"role": "personnel", "person_id": "P-104", "battalion": "3 Bn", "name": "Personnel P-104"},
    "welfare.3bn": {"role": "welfare_officer", "battalion": "3 Bn", "name": "Welfare Officer, 3 Bn"},
    "counsellor.3bn": {"role": "counsellor", "battalion": "3 Bn", "name": "Counsellor, 3 Bn"},
    "cmdr.3bn": {"role": "commander", "battalion": "3 Bn", "name": "Commandant, 3 Bn"},
    "planner.3bn": {"role": "planner", "battalion": "3 Bn", "name": "Roster Planner, 3 Bn"},
    "auditor": {"role": "auditor", "battalion": None, "name": "Auditor"},
    "hrms.service": {"role": "service", "battalion": None, "name": "HRMS Adapter"},
    # Simulated external system that must never read welfare data (purpose-binding demo).
    "discipline.client": {"role": "hr_disciplinary", "battalion": "3 Bn", "name": "External HR/Disciplinary System"},
}
WELFARE_ROLES = {"welfare_officer", "counsellor"}


@dataclass(frozen=True)
class Principal:
    username: str
    role: str
    battalion: str | None
    person_id: str | None
    name: str


def create_token(username: str) -> str:
    u = DEMO_USERS.get(username)
    if not u:
        raise Unauthorized("Unknown user")
    now = datetime.now(timezone.utc)
    claims = {"sub": username, "role": u["role"], "bn": u["battalion"], "pid": u.get("person_id"),
              "name": u["name"], "iat": now, "exp": now + timedelta(hours=8)}
    return jwt.encode(claims, JWT_SECRET, algorithm=JWT_ALGO)


def current_principal(request: Request, authorization: str | None = Header(default=None)) -> Principal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise Unauthorized("Missing bearer token")
    try:
        c = jwt.decode(authorization.split(" ", 1)[1], JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise Unauthorized("Session expired. Log in again.")
    except jwt.PyJWTError:
        raise Unauthorized("Invalid token")
    p = Principal(username=c["sub"], role=c["role"], battalion=c.get("bn"), person_id=c.get("pid"), name=c.get("name", c["sub"]))
    request.state.principal = p
    return p


def purpose_header(x_purpose_of_use: str | None = Header(default=None)) -> str:
    return (x_purpose_of_use or "unspecified").lower()


def require(*roles: str, purpose: str | None = None):
    """Dependency: allow only `roles` (and, if set, only the given purpose-of-use). Denials are audited."""
    def dep(request: Request, p: Principal = Depends(current_principal), used_purpose: str = Depends(purpose_header),
            db: Session = Depends(get_db)) -> Principal:
        from ..services.audit import record   # local import avoids a circular import at module load
        subject = request.path_params.get("person_id")
        if p.role not in roles or (purpose and used_purpose != purpose):
            why = f"role '{p.role}' not permitted" if p.role not in roles else f"purpose '{used_purpose}' not permitted"
            record(db, actor=p.username, role=p.role, action=f"{request.method} {request.url.path}",
                   resource=request.url.path, purpose=used_purpose, subject_person=subject, outcome="denied", detail=why)
            raise Forbidden(f"Access denied: {why}. This attempt has been logged.")
        return p
    return dep


def ensure_same_battalion(p: Principal, battalion: str) -> None:
    if p.battalion and p.battalion != battalion:
        raise Forbidden("Access is limited to your own unit")
