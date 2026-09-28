"""Tiered automated alert engine with SLA-based escalation.

Tiers (PRD section 10):
  T0 crisis           -> duty counsellor + welfare officer, ack within 30 min
  T1 high             -> welfare officer, 24 h   (High, confidence >= 0.60, sustained 3 days)
  T2 moderate         -> welfare officer, 72 h   (Moderate+, confidence >= 0.50)
  T3 evidence request -> the person only (optional check), never escalates to staff
"""
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import BAND_HIGH, BAND_MODERATE, DIMENSIONS
from ..core.logging import get_logger
from ..ml.engine import RiskEngine, band
from ..models import Alert
from . import repository as repo
from .audit import record
from .repository import TODAY

log = get_logger("sahara.alerts")

SLA = {"T0": timedelta(minutes=30), "T1": timedelta(hours=24), "T2": timedelta(hours=72),
       "T3": timedelta(days=7), "UH": timedelta(days=7)}
RECIPIENT = {"T0": "counsellor", "T1": "welfare_officer", "T2": "welfare_officer", "T3": "personnel", "UH": "commander"}
ESCALATE_TO = {"T0": "Medical Officer", "T1": "Senior Welfare Officer", "T2": "Welfare Officer (re-queued as T1)", "UH": "Formation Welfare Cell"}


def decide_tier(p_max: float, confidence: float, sustained_high: bool) -> str | None:
    if p_max >= BAND_HIGH and confidence >= 0.60 and sustained_high:
        return "T1"
    if p_max >= BAND_MODERATE and confidence >= 0.50:
        return "T2"
    if p_max >= BAND_MODERATE:
        return "T3"
    return None


def _reason(probs: dict, conf: float, tier: str) -> str:
    top = max(probs, key=probs.get)
    if tier == "T3":
        return f"{DIMENSIONS[top][0]} risk rising but confidence only {conf:.0%}: optional readiness check requested"
    return f"{DIMENSIONS[top][0]} {band(probs[top])} ({probs[top]:.0%}), confidence {conf:.0%}"


def upsert_person_alert(db: Session, *, pid: str, battalion: str, company: str, probs: dict, conf: float,
                        sustained_high: bool, created_at: datetime | None = None) -> Alert | None:
    tier = decide_tier(max(probs.values()), conf, sustained_high)
    current = db.execute(select(Alert).where(Alert.person_id == pid, Alert.tier != "T0",
                                             Alert.status.in_(["open", "acknowledged", "escalated"]))).scalar_one_or_none()
    if current and current.tier == tier:
        current.reason = _reason(probs, conf, tier)
        db.commit()
        return current
    if current:
        current.status = "closed"
    if tier is None:
        db.commit()
        return None
    now = created_at or datetime.now(timezone.utc)
    a = Alert(tier=tier, person_id=pid, unit=company, battalion=battalion, reason=_reason(probs, conf, tier),
              recipient_role=RECIPIENT[tier], created_at=now, sla_due=now + SLA[tier])
    db.add(a)
    db.commit()
    log.debug("alert %s for %s: %s", tier, pid, a.reason)
    return a


def crisis_alert(db: Session, pid: str, battalion: str, company: str, trigger: str) -> Alert:
    now = datetime.now(timezone.utc)
    a = Alert(tier="T0", person_id=pid, unit=company, battalion=battalion, recipient_role="counsellor",
              reason=f"Crisis Safe-Route: {trigger}. Human contact required.", created_at=now, sla_due=now + SLA["T0"])
    db.add(a)
    db.commit()
    log.warning("T0 crisis alert raised for %s", pid)
    return a


def generate_all(db: Session, engine: RiskEngine) -> dict:
    """Batch alert generation for all personnel (run after seeding / nightly)."""
    feats = repo.features_on(TODAY)
    probs = engine.predict(feats)
    sc = repo.scores_between(TODAY - 2, TODAY)
    p_top = sc[[f"p_{d}" for d in DIMENSIONS]].max(axis=1)
    sustained = (p_top >= BAND_HIGH).groupby(sc["person_id"]).all()
    people = repo.people().set_index("person_id")
    rng = np.random.default_rng(7)
    counts = {}
    for i, row in feats.reset_index(drop=True).iterrows():
        pr = {d: float(v[i]) for d, v in probs.items()}
        conf = engine.confidence(engine.evidence(row), max(pr.values()))["value"]
        pid = row["person_id"]
        age = timedelta(hours=float(rng.uniform(1, 60)))       # alerts were raised at different times
        a = upsert_person_alert(db, pid=pid, battalion=people.at[pid, "battalion"], company=people.at[pid, "company"],
                                probs=pr, conf=conf, sustained_high=bool(sustained.get(pid, False)),
                                created_at=datetime.now(timezone.utc) - age)
        if a:
            counts[a.tier] = counts.get(a.tier, 0) + 1
    return counts


def escalate_overdue(db: Session, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    n = 0
    for a in db.execute(select(Alert).where(Alert.status == "open", Alert.tier.in_(["T0", "T1", "T2", "UH"]))).scalars():
        due = a.sla_due if a.sla_due.tzinfo else a.sla_due.replace(tzinfo=timezone.utc)
        if due < now:
            a.status, a.escalated_to = "escalated", ESCALATE_TO[a.tier]
            record(db, actor="alert-engine", role="system", action="escalate_alert", resource=f"alert/{a.id}",
                   purpose="welfare", subject_person=a.person_id, detail=f"{a.tier} SLA missed -> {a.escalated_to}")
            n += 1
    db.commit()
    if n:
        log.info("escalated %d overdue alerts", n)
    return n


def alerts_frame(db: Session, battalion: str, roles: list[str]) -> pd.DataFrame:
    rows = db.execute(select(Alert).where(Alert.battalion == battalion, Alert.recipient_role.in_(roles),
                                          Alert.status != "closed")).scalars().all()
    return pd.DataFrame([{c.name: getattr(a, c.name) for c in Alert.__table__.columns} for a in rows])
