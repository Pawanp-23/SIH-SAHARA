"""Welfare Officer / Counsellor console. Every route requires purpose-of-use = welfare."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import DIMENSIONS
from ..core.db import get_db
from ..core.errors import NotFound
from ..core.security import Principal, ensure_same_battalion, require
from ..models import Alert, CaseAction, IdentityVault, WelfareNeed
from ..schemas import CaseActionIn, RevealIn
from ..services import alerts as alert_svc
from ..services import repository as repo
from ..services import roster as roster_svc
from ..services.audit import record
from ..services.repository import TODAY
from ..services.risk import risk_service

router = APIRouter(prefix="/v1/welfare", tags=["welfare"])
welfare_staff = require("welfare_officer", "counsellor", purpose="welfare")
TIER_ORDER = {"T0": 0, "T1": 1, "T2": 2}


def _case_person(p: Principal, person_id: str) -> dict:
    person = repo.person(person_id)
    ensure_same_battalion(p, person["battalion"])
    return person


def _iso(dt: datetime) -> str:
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


@router.get("/queue")
def queue(p: Principal = Depends(welfare_staff), db: Session = Depends(get_db)):
    rows = db.execute(select(Alert).where(Alert.battalion == p.battalion, Alert.tier.in_(list(TIER_ORDER)),
                                          Alert.status != "closed")).scalars().all()
    sc = repo.scores_between(TODAY, TODAY).set_index("person_id")
    items = []
    for a in rows:
        s = sc.loc[a.person_id]
        probs = {d: float(s[f"p_{d}"]) for d in DIMENSIONS}
        top = max(probs, key=probs.get)
        items.append({"alert_id": a.id, "tier": a.tier, "person_id": a.person_id, "unit": a.unit, "status": a.status,
                      "reason": a.reason, "top_dimension": DIMENSIONS[top][0], "priority": round(probs[top], 3),
                      "created_at": _iso(a.created_at), "sla_due": _iso(a.sla_due), "escalated_to": a.escalated_to})
    items.sort(key=lambda r: r["created_at"], reverse=True)            # newest first within ties
    items.sort(key=lambda r: (TIER_ORDER[r["tier"]], -r["priority"]))
    record(db, actor=p.username, role=p.role, action="view_queue", resource="welfare/queue", purpose="welfare")
    counts = {t: sum(1 for i in items if i["tier"] == t) for t in TIER_ORDER}
    return {"battalion": p.battalion, "counts": counts,
            "escalated": sum(1 for i in items if i["status"] == "escalated"), "items": items}


@router.get("/cases/{person_id}")
def case(person_id: str, p: Principal = Depends(welfare_staff), db: Session = Depends(get_db)):
    person = _case_person(p, person_id)
    snap = risk_service.snapshot(person_id)
    needs = db.execute(select(WelfareNeed).where(WelfareNeed.person_id == person_id)).scalars().all()
    actions = db.execute(select(CaseAction).where(CaseAction.person_id == person_id)
                         .order_by(CaseAction.id.desc())).scalars().all()
    alerts = db.execute(select(Alert).where(Alert.person_id == person_id).order_by(Alert.id.desc())).scalars().all()
    record(db, actor=p.username, role=p.role, action="view_case", resource=f"welfare/cases/{person_id}",
           purpose="welfare", subject_person=person_id)
    return {
        **snap,
        "profile": {"pseudonym": person_id, "unit": person["company"], "rank_band": person["rank_band"],
                    "duty_type": person["duty_type"], "language": person["language"]},
        "needs": [{"id": n.id, "category": n.category, "status": n.status, "description": n.description,
                   "age_days": (datetime.now(timezone.utc) - (n.created_at if n.created_at.tzinfo else
                                n.created_at.replace(tzinfo=timezone.utc))).days, "sla_days": n.sla_days} for n in needs],
        "actions": [{"id": a.id, "type": a.action_type, "rationale": a.rationale, "actor": a.actor,
                     "followup_days": a.followup_days, "created_at": _iso(a.created_at)} for a in actions],
        "alerts": [{"id": a.id, "tier": a.tier, "status": a.status, "reason": a.reason, "created_at": _iso(a.created_at)}
                   for a in alerts],
        "caution": "Risk estimates are non-diagnostic and show contributing factors, not causes. A human decides every action.",
    }


@router.post("/cases/{person_id}/actions")
def act(person_id: str, body: CaseActionIn, p: Principal = Depends(welfare_staff), db: Session = Depends(get_db)):
    _case_person(p, person_id)
    snap = risk_service.snapshot(person_id, with_details=False)
    a = CaseAction(person_id=person_id, actor=p.username, action_type=body.action_type, rationale=body.rationale,
                   followup_days=body.followup_days,
                   pre_scores={d: v["probability"] for d, v in snap["dimensions"].items()})
    db.add(a)
    for al in db.execute(select(Alert).where(Alert.person_id == person_id, Alert.status.in_(["open", "escalated"]),
                                             Alert.tier.in_(["T1", "T2"]))).scalars():
        al.status, al.acked_by = "acknowledged", p.username
    db.commit()
    record(db, actor=p.username, role=p.role, action=f"case_action:{body.action_type}",
           resource=f"welfare/cases/{person_id}", purpose="welfare", subject_person=person_id,
           detail=f"follow-up in {body.followup_days} days")
    return {"id": a.id, "saved": True, "followup_days": body.followup_days}


@router.post("/alerts/{alert_id}/ack")
def ack(alert_id: int, p: Principal = Depends(welfare_staff), db: Session = Depends(get_db)):
    a = db.get(Alert, alert_id)
    if not a or a.battalion != p.battalion:
        raise NotFound("Alert not found")
    a.status, a.acked_by = "acknowledged", p.username
    db.commit()
    record(db, actor=p.username, role=p.role, action="ack_alert", resource=f"alert/{alert_id}", purpose="welfare",
           subject_person=a.person_id)
    return {"id": a.id, "status": a.status}


@router.post("/cases/{person_id}/reveal")
def reveal(person_id: str, body: RevealIn, request: Request, p: Principal = Depends(welfare_staff),
           db: Session = Depends(get_db)):
    """Break-glass identity reveal: justification + named approver, fully audited and visible to the person."""
    _case_person(p, person_id)
    v = db.get(IdentityVault, person_id)
    record(db, actor=p.username, role=p.role, action="break_glass_identity_reveal", resource=f"identity/{person_id}",
           purpose="welfare", subject_person=person_id,
           detail=f"justification: {body.justification}; approver: {body.approver}")
    return {"person_id": person_id, "display_name": v.display_name, "service_no": v.service_no,
            "valid_for_minutes": 30}


@router.post("/cases/{person_id}/roster-preview")
def roster_preview(person_id: str, p: Principal = Depends(welfare_staff), db: Session = Depends(get_db)):
    """Welfare officer view of the roster optimizer: what the fair plan changes for this person."""
    person = _case_person(p, person_id)
    result = roster_svc.optimize(person["company"], risk_service.engine)
    mine = next((r for r in result.get("personnel", []) if r["person_id"] == person_id), None)
    record(db, actor=p.username, role=p.role, action="roster_preview", resource=f"roster/{person['company']}",
           purpose="welfare", subject_person=person_id)
    return {"company": person["company"], "feasible": result["feasible"], "dates": result.get("dates"),
            "person": mine, "summary": result.get("summary"), "constraints": result.get("constraints"),
            "note": result.get("note")}


@router.post("/escalations/run")
def run_escalations(p: Principal = Depends(welfare_staff), db: Session = Depends(get_db)):
    return {"escalated": alert_svc.escalate_overdue(db)}
