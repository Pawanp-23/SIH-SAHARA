"""Night-duty roster optimizer (Google OR-Tools CP-SAT).

Hard constraints: same nightly coverage as the current plan, at least one QRT-qualified
person per night where the plan had one, max 3 nights per person per 7 days, no more than
2 consecutive nights, nobody rostered while on leave.
Objective: minimise risk-weighted night load + fairness (max nights) + plan changes.
Output is advisory only; command approves any change.
"""
import numpy as np
import pandas as pd
from ortools.sat.python import cp_model

from ..core.errors import SaharaError
from ..core.logging import get_logger
from . import repository as repo
from .repository import TODAY

log = get_logger("sahara.roster")
HORIZON = 7
MAX_NIGHTS = 3
MAX_CONSEC = 2


def optimize(company: str, engine) -> dict:
    people = repo.people()
    members = people[people["company"] == company].reset_index(drop=True)
    if members.empty:
        raise SaharaError(f"Unknown company {company}")
    pids = members["person_id"].tolist()
    ph = ",".join(f"'{p}'" for p in pids)          # pids come from our own table, not user input
    plan = repo.read_sql(f"SELECT person_id, day, date, night_duty, on_leave FROM daily WHERE person_id IN ({ph}) "
                         f"AND day BETWEEN :a AND :b", a=TODAY + 1, b=TODAY + HORIZON)
    days = sorted(plan["day"].unique())
    dates = plan.drop_duplicates("day").set_index("day")["date"].to_dict()
    P = plan.pivot(index="person_id", columns="day", values="night_duty").reindex(pids).fillna(0).astype(int)
    L = plan.pivot(index="person_id", columns="day", values="on_leave").reindex(pids).fillna(0).astype(int)

    feats = repo.features_on(TODAY).set_index("person_id").loc[pids].reset_index()
    risk = engine.predict(feats)["burnout"]
    w = {pid: int(round(100 * r)) for pid, r in zip(pids, risk)}
    qrt = dict(zip(pids, members["qrt_qualified"].astype(bool)))

    m = cp_model.CpModel()
    x = {(p, d): m.NewBoolVar(f"x_{p}_{d}") for p in pids for d in days}
    for d in days:
        m.Add(sum(x[p, d] for p in pids) == int(P[d].sum()))
        if any(P.at[p, d] and qrt[p] for p in pids):
            m.Add(sum(x[p, d] for p in pids if qrt[p]) >= 1)
        for p in pids:
            if L.at[p, d]:
                m.Add(x[p, d] == 0)
    for p in pids:
        m.Add(sum(x[p, d] for d in days) <= MAX_NIGHTS)
        for i in range(len(days) - MAX_CONSEC):
            m.Add(sum(x[p, days[i + k]] for k in range(MAX_CONSEC + 1)) <= MAX_CONSEC)
    max_n = m.NewIntVar(0, HORIZON, "max_nights")
    for p in pids:
        m.Add(sum(x[p, d] for d in days) <= max_n)
    changes = []
    for p in pids:
        for d in days:
            c = m.NewBoolVar(f"c_{p}_{d}")
            m.Add(x[p, d] != int(P.at[p, d])).OnlyEnforceIf(c)
            m.Add(x[p, d] == int(P.at[p, d])).OnlyEnforceIf(c.Not())
            changes.append(c)
    m.Minimize(sum(w[p] * x[p, d] for p in pids for d in days) + 40 * max_n + 8 * sum(changes))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5.0
    solver.parameters.num_workers = 4
    status = solver.Solve(m)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        log.warning("roster infeasible for %s (status %s)", company, solver.StatusName(status))
        return {"company": company, "feasible": False, "status": solver.StatusName(status)}

    X = pd.DataFrame({d: [int(solver.Value(x[p, d])) for p in pids] for d in days}, index=pids)

    def project(nights: pd.Series) -> np.ndarray:
        f = feats.copy()
        f["night_7"] = nights.to_numpy()
        f["night_30"] = f["night_30"] - feats["night_7"] + nights.to_numpy()
        return engine.predict(f)["burnout"]

    before, after = project(P.sum(axis=1)), project(X.sum(axis=1))
    rows = []
    for i, p in enumerate(pids):
        rows.append({"person_id": p, "qrt": qrt[p], "burnout_now": round(float(risk[i]), 3),
                     "plan": P.loc[p].tolist(), "optimized": X.loc[p].tolist(),
                     "plan_nights": int(P.loc[p].sum()), "optimized_nights": int(X.loc[p].sum()),
                     "projected_before": round(float(before[i]), 3), "projected_after": round(float(after[i]), 3)})
    moves = []
    for d in days:
        off = [p for p in pids if P.at[p, d] and not X.at[p, d]]
        on = [p for p in pids if X.at[p, d] and not P.at[p, d]]
        for a, b in zip(off, on):
            moves.append({"date": dates[d], "from": a, "to": b})
    violations_before = int((P.sum(axis=1) > MAX_NIGHTS).sum())
    result = {
        "company": company, "feasible": True, "status": solver.StatusName(status), "dates": [dates[d] for d in days],
        "constraints": {"coverage_per_night": [int(P[d].sum()) for d in days], "max_nights_per_7d": MAX_NIGHTS,
                        "max_consecutive": MAX_CONSEC, "qrt_cover": True, "leave_respected": True},
        "summary": {
            "plan_rule_violations": violations_before, "optimized_rule_violations": 0,
            "plan_max_nights": int(P.sum(axis=1).max()), "optimized_max_nights": int(X.sum(axis=1).max()),
            "changes": len(moves),
            "avg_projected_burnout_before": round(float(before.mean()), 3),
            "avg_projected_burnout_after": round(float(after.mean()), 3),
            "high_risk_before": int((before >= 0.6).sum()), "high_risk_after": int((after >= 0.6).sum()),
        },
        "moves": moves, "personnel": rows, "note": "Advisory plan. Command approval required before any change.",
    }
    log.info("roster %s optimized: %s", company, result["summary"])
    return result

