"""Append-only, hash-chained audit log.

Each event stores sha256(prev_hash | fields). Editing or deleting any past row breaks the
chain, which `verify_chain` detects. Personnel can read every event about themselves
(My Data Mirror).
"""
import hashlib
import threading
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.logging import get_logger
from ..models import AuditEvent

log = get_logger("sahara.audit")
GENESIS = "0" * 64
# Read-last-hash + insert must be atomic, or concurrent requests fork the chain.
# Single process: this lock. Multi-process production: a PostgreSQL advisory lock around the same block.
_chain_lock = threading.Lock()


def _digest(prev: str, ts: datetime, actor: str, role: str, action: str, resource: str,
            purpose: str, subject: str | None, outcome: str, detail: str) -> str:
    payload = "|".join([prev, ts.isoformat(), actor, role, action, resource, purpose, subject or "", outcome, detail])
    return hashlib.sha256(payload.encode()).hexdigest()


def record(db: Session, *, actor: str, role: str, action: str, resource: str, purpose: str,
           subject_person: str | None = None, outcome: str = "allowed", detail: str = "") -> AuditEvent:
    with _chain_lock:
        db.commit()                      # flush any pending work so the chain read sees committed rows
        last = db.execute(select(AuditEvent).order_by(AuditEvent.id.desc()).limit(1)).scalar_one_or_none()
        prev = last.hash if last else GENESIS
        ts = datetime.now(timezone.utc).replace(microsecond=0)
        ev = AuditEvent(ts=ts, actor=actor, role=role, action=action, resource=resource, purpose=purpose,
                        subject_person=subject_person, outcome=outcome, detail=detail, prev_hash=prev,
                        hash=_digest(prev, ts, actor, role, action, resource, purpose, subject_person, outcome, detail))
        db.add(ev)
        db.commit()
    if outcome == "denied":
        log.warning("DENIED %s (%s) %s %s purpose=%s", actor, role, action, resource, purpose)
    return ev


def verify_chain(db: Session) -> dict:
    prev = GENESIS
    n = 0
    for ev in db.execute(select(AuditEvent).order_by(AuditEvent.id)).scalars():
        ts = ev.ts if ev.ts.tzinfo else ev.ts.replace(tzinfo=timezone.utc)
        expect = _digest(prev, ts, ev.actor, ev.role, ev.action, ev.resource, ev.purpose,
                         ev.subject_person, ev.outcome, ev.detail)
        if ev.prev_hash != prev or ev.hash != expect:
            return {"valid": False, "events_checked": n, "broken_at_id": ev.id}
        prev = ev.hash
        n += 1
    return {"valid": True, "events_checked": n, "head": prev}
