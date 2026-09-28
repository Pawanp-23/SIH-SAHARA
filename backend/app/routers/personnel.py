"""Personnel self-service: consent, check-in, readiness test, crisis route, welfare needs, My Data Mirror."""
import hashlib

import numpy as np
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import BAND_HIGH, DIMENSIONS
from ..core.db import get_db
from ..core.errors import Forbidden
from ..core.security import Principal, require
from ..ml.engine import band
from ..models import Alert, AuditEvent, Consent, WelfareNeed
from ..schemas import CheckInIn, ConsentIn, CrisisIn, ReadinessIn, WelfareNeedIn
from ..services import alerts as alert_svc
from ..services import repository as repo
from ..services.audit import record
from ..services.repository import TODAY
from ..services.risk import risk_service

router = APIRouter(prefix="/v1", tags=["personnel"])
me_only = require("personnel")

PLAIN = {
    "Low": "Your recent pattern looks steady.",
    "Moderate": "Your load has been rising. Small recovery steps can help.",
    "High": "Your recent load is heavy. Support and recovery options are available whenever you want them.",
}
HELPLINES = [{"name": "Tele-MANAS (national mental health helpline)", "phone": "14416"},
             {"name": "Unit counsellor (on duty)", "phone": "Internal 2201"}]


def _consents(db: Session, pid: str) -> dict:
    rows = db.execute(select(Consent).where(Consent.person_id == pid).order_by(Consent.id)).scalars().all()
    latest = {}
    for c in rows:
        latest[c.modality] = c.granted
    return latest


def _require_consent(db: Session, pid: str, modality: str) -> None:
    if not _consents(db, pid).get(modality):
        raise Forbidden(f"Consent for '{modality}' is not granted. Enable it in your privacy settings first.")


def _rescore(db: Session, p: Principal) -> dict:
    change = risk_service.recompute(p.person_id)
    after = change["after"]
    sc = repo.scores(p.person_id)
    recent = sc[sc["day"].between(TODAY - 2, TODAY)][[f"p_{d}" for d in DIMENSIONS]].max(axis=1)
    person = repo.person(p.person_id)
    alert_svc.upsert_person_alert(db, pid=p.person_id, battalion=person["battalion"], company=person["company"],
                                  probs={d: v["probability"] for d, v in after["dimensions"].items()},
                                  conf=after["confidence"]["value"], sustained_high=bool((recent >= BAND_HIGH).all()))
    return {"confidence_before": change["before"]["confidence"]["value"],
            "confidence_after": after["confidence"]["value"]}


@router.get("/me/overview")
def overview(p: Principal = Depends(me_only), db: Session = Depends(get_db)):
    snap = risk_service.snapshot(p.person_id, with_details=False)
    person = repo.person(p.person_id)
    d = repo.daily(p.person_id)
    d = d[d["day"].between(TODAY - 29, TODAY)]
    request = db.execute(select(Alert).where(Alert.person_id == p.person_id, Alert.tier == "T3",
                                             Alert.status == "open")).scalar_one_or_none()
    needs = db.execute(select(WelfareNeed).where(WelfareNeed.person_id == p.person_id)).scalars().all()
    top_band = band(snap["priority"])
    return {
        "person_id": p.person_id, "unit": person["company"], "language": person["language"],
        "summary": PLAIN[top_band], "band": top_band,
        "dimensions": {k: {"label": v["label"], "band": v["band"]} for k, v in snap["dimensions"].items()},
        "evidence_request": ({"message": "Your duty load has gone up recently. A 90-second readiness check helps us "
                                         "understand how you are doing. It is optional.", "alert_id": request.id}
                             if request else None),
        "checkins": [{"date": r.date, "energy": None if np.isnan(r.energy) else int(r.energy),
                      "sleep": None if np.isnan(r.sleep_quality) else int(r.sleep_quality)} for r in d.itertuples()],
        "consents": _consents(db, p.person_id),
        "needs": [{"id": n.id, "category": n.category, "status": n.status, "description": n.description,
                   "created_at": n.created_at.isoformat()} for n in needs],
        "helplines": HELPLINES,
    }


@router.post("/consents")
def set_consent(body: ConsentIn, p: Principal = Depends(me_only), db: Session = Depends(get_db)):
    receipt = hashlib.sha256(f"{p.person_id}|{body.modality}|{body.granted}|1.0".encode()).hexdigest()
    db.add(Consent(person_id=p.person_id, modality=body.modality, granted=body.granted, receipt_hash=receipt))
    db.commit()
    record(db, actor=p.username, role=p.role, action="consent_" + ("grant" if body.granted else "withdraw"),
           resource=f"consent/{body.modality}", purpose="self_service", subject_person=p.person_id)
    return {"modality": body.modality, "granted": body.granted, "receipt": receipt}


@router.post("/checkins")
def checkin(body: CheckInIn, p: Principal = Depends(me_only), db: Session = Depends(get_db)):
    _require_consent(db, p.person_id, "checkin")
    values = {"energy": body.energy, "sleep_quality": body.sleep_quality, "workload_feel": body.workload_feel}
    if body.who5_items:
        values["who5"] = float(sum(body.who5_items))
    if body.burnout_items:
        values["burnout_pulse"] = float(np.mean(body.burnout_items) / 4 * 100)
    repo.update_daily(p.person_id, TODAY, values)
    record(db, actor=p.username, role=p.role, action="submit_checkin", resource="checkin", purpose="self_service",
           subject_person=p.person_id)
    crisis = None
    low_who5 = values.get("who5") is not None and values["who5"] <= 7
    if body.urgent_support or low_who5:
        person = repo.person(p.person_id)
        a = alert_svc.crisis_alert(db, p.person_id, person["battalion"], person["company"],
                                   "urgent support requested" if body.urgent_support else "very low wellbeing score")
        crisis = {"alert_id": a.id, "helplines": HELPLINES}
    return {"saved": True, **_rescore(db, p), "crisis_route": crisis}


@router.post("/readiness/summary")
def readiness(body: ReadinessIn, p: Principal = Depends(me_only), db: Session = Depends(get_db)):
    _require_consent(db, p.person_id, "readiness")
    values = {"rt_median": body.rt_median_ms, "rt_lapses": float(body.lapses)}
    if body.hr_bpm is not None and body.signal_quality >= 0.6:
        _require_consent(db, p.person_id, "camera_ppg")
        values["hr_rest"] = body.hr_bpm
        if body.hrv_ms is not None:
            values["hrv"] = body.hrv_ms
    repo.update_daily(p.person_id, TODAY, values)
    record(db, actor=p.username, role=p.role, action="submit_readiness", resource="readiness_summary",
           purpose="self_service", subject_person=p.person_id,
           detail=f"derived features only; trials={body.trials}, quality={body.signal_quality}")
    request = db.execute(select(Alert).where(Alert.person_id == p.person_id, Alert.tier == "T3",
                                             Alert.status == "open")).scalar_one_or_none()
    if request:
        request.status = "closed"
        db.commit()
    return {"saved": True, "stored_fields": sorted(values), **_rescore(db, p)}


@router.post("/crisis")
def crisis(body: CrisisIn, p: Principal = Depends(me_only), db: Session = Depends(get_db)):
    person = repo.person(p.person_id)
    a = alert_svc.crisis_alert(db, p.person_id, person["battalion"], person["company"], body.trigger.replace("_", " "))
    record(db, actor=p.username, role=p.role, action="crisis_safe_route", resource=f"alert/{a.id}",
           purpose="safety", subject_person=p.person_id)
    return {"alert_id": a.id, "message": "A counsellor will call you within 30 minutes. You can also call now.",
            "helplines": HELPLINES}


@router.post("/welfare-needs")
def raise_need(body: WelfareNeedIn, p: Principal = Depends(me_only), db: Session = Depends(get_db)):
    n = WelfareNeed(person_id=p.person_id, category=body.category, description=body.description)
    db.add(n)
    db.commit()
    record(db, actor=p.username, role=p.role, action="raise_welfare_need", resource=f"welfare_need/{n.id}",
           purpose="self_service", subject_person=p.person_id)
    return {"id": n.id, "status": n.status, "sla_days": n.sla_days}


@router.get("/me/access-log")
def access_log(p: Principal = Depends(me_only), db: Session = Depends(get_db)):
    """My Data Mirror: every time someone else touched my data, and why."""
    rows = db.execute(select(AuditEvent).where(AuditEvent.subject_person == p.person_id)
                      .order_by(AuditEvent.id.desc()).limit(100)).scalars().all()
    return [{"ts": e.ts.isoformat(), "actor_role": e.role, "action": e.action, "purpose": e.purpose,
             "outcome": e.outcome, "detail": e.detail} for e in rows if e.actor != p.username]

