"""Commander + planner views: differential-privacy unit aggregates, 14-day forecast, roster optimizer.

No route here returns individual wellness data. Individual night-duty assignments in the
roster plan are operational data the planner already holds, shown with risk as a weight only.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import BAND_HIGH, DIMENSIONS, MIN_GROUP_SIZE
from ..core.db import get_db
from ..core.security import Principal, ensure_same_battalion, require
from ..models import Alert
from ..schemas import RosterIn
from ..services import repository as repo
from ..services import roster as roster_svc
from ..services.audit import record
from ..services.privacy import dp_mean, dp_share
from ..services.repository import TODAY
from ..services.risk import risk_service

router = APIRouter(prefix="/v1", tags=["commander"])
command = require("commander", "planner")


@router.get("/commander/units/{battalion}/overview")
def overview(battalion: str, p: Principal = Depends(command), db: Session = Depends(get_db)):
    ensure_same_battalion(p, battalion)
    people = repo.battalion_people(battalion)
    sc = repo.scores_between(TODAY, TODAY).merge(people[["person_id", "company"]], on="person_id")
    ft = repo.features_on(TODAY).merge(people[["person_id", "company"]], on="person_id")
    units = []
    for company, g in sc.groupby("company"):
        f = ft[ft["company"] == company]
        key = f"{company}|{TODAY}"
        units.append({
            "company": company, "n": len(g),
            "suppressed": len(g) < MIN_GROUP_SIZE,
            "high_share": {d: dp_share(g[f"p_{d}"] >= BAND_HIGH, key=f"{key}|{d}")["value"] for d in DIMENSIONS},
            "avg_night_7": dp_mean(f["night_7"], 0, 7, key=f"{key}|n7")["value"],
            "avg_duty_hours": dp_mean(f["duty_hours_7"], 0, 16, key=f"{key}|dh")["value"],
            "leave_overdue_share": dp_share(f["days_since_home_leave"] >= 75, key=f"{key}|lv")["value"],
            "deployed_share": dp_share(f["deployed_continuous"] > 0, key=f"{key}|dp")["value"],
        })
    units.sort(key=lambda u: -(u["high_share"]["burnout"] or 0))
    hot = db.execute(select(Alert).where(Alert.battalion == battalion, Alert.tier == "UH",
                                         Alert.status != "closed")).scalars().all()
    record(db, actor=p.username, role=p.role, action="view_unit_aggregate", resource=f"commander/{battalion}",
           purpose="command_readiness")
    return {"battalion": battalion, "date": sc["date"].iloc[0], "min_group_size": MIN_GROUP_SIZE,
            "privacy": "Laplace differential privacy (epsilon 1.0) on every aggregate; groups under 10 suppressed.",
            "strength": int(len(people)), "units": units,
            "hotspots": [{"unit": a.unit, "reason": a.reason} for a in hot]}


@router.get("/commander/units/{battalion}/forecast")
def forecast(battalion: str, p: Principal = Depends(command), db: Session = Depends(get_db)):
    ensure_same_battalion(p, battalion)
    fc = repo.forecast(battalion).merge(repo.battalion_people(battalion)[["person_id", "company"]], on="person_id")
    series = {}
    for company, g in fc.groupby("company"):
        pts = []
        for day, d in g.groupby("day"):
            pts.append({"date": d["date"].iloc[0],
                        "burnout": dp_share(d["p_burnout"] >= BAND_HIGH, key=f"fc|{company}|{day}|b")["value"],
                        "acute_stress": dp_share(d["p_acute_stress"] >= BAND_HIGH, key=f"fc|{company}|{day}|a")["value"]})
        series[company] = {"n": int(g["person_id"].nunique()), "points": pts}
    record(db, actor=p.username, role=p.role, action="view_unit_forecast", resource=f"commander/{battalion}/forecast",
           purpose="command_readiness")
    return {"battalion": battalion, "horizon_days": 14, "series": series,
            "method": "Risk models applied to the planned roster; share of personnel projected High, DP-protected."}


@router.post("/roster/scenarios")
def roster(body: RosterIn, p: Principal = Depends(command), db: Session = Depends(get_db)):
    ensure_same_battalion(p, body.company.rsplit(" ", 1)[0])
    result = roster_svc.optimize(body.company, risk_service.engine)
    for r in result.get("personnel", []):          # planners see the plan and aggregate effect only,
        for k in ("burnout_now", "projected_before", "projected_after"):   # never individual risk scores
            r.pop(k, None)
    record(db, actor=p.username, role=p.role, action="run_roster_scenario", resource=f"roster/{body.company}",
           purpose="workload_balancing")
    return result
