"""End-to-end P-104 scenario (PRD section 20) plus privacy/security acceptance checks."""
from tests.conftest import login


def test_health(client):
    assert client.get("/v1/health").json()["status"] == "ok"


def test_p104_low_confidence_then_evidence_raises_confidence(client):
    me = login(client, "p104")
    ov = client.get("/v1/me/overview", headers=me).json()
    assert ov["evidence_request"] is not None, "stale evidence should trigger an optional readiness request (T3)"

    r = client.post("/v1/checkins", headers=me, json={
        "energy": 2, "sleep_quality": 2, "workload_feel": 5,
        "who5_items": [2, 2, 1, 2, 2], "burnout_items": [3, 3, 3, 2]}).json()
    before = r["confidence_before"]
    r = client.post("/v1/readiness/summary", headers=me, json={
        "rt_median_ms": 352, "lapses": 6, "false_starts": 1, "trials": 40, "hr_bpm": 82, "hrv_ms": 29,
        "signal_quality": 0.9}).json()
    assert set(r["stored_fields"]) == {"rt_median", "rt_lapses", "hr_rest", "hrv"}
    assert r["confidence_after"] > before + 0.25, (before, r["confidence_after"])


def test_welfare_officer_sees_explainable_case(client):
    h = login(client, "welfare.3bn", purpose="welfare")
    q = client.get("/v1/welfare/queue", headers=h).json()
    assert any(i["person_id"] == "P-104" and i["tier"] == "T1" for i in q["items"]), "P-104 should reach the T1 queue"
    case = client.get("/v1/welfare/cases/P-104", headers=h).json()
    assert set(case["dimensions"]) == {"acute_stress", "burnout", "emotional_fatigue", "welfare_concern"}
    assert case["factors"][case["top_dimension"]], "every alert needs contributing factors"
    assert case["what_would_help"], "High/Moderate cases need actionable counterfactuals"
    assert len(case["trend"]) == 180
    r = client.post("/v1/welfare/cases/P-104/actions", headers=h,
                    json={"action_type": "offer_support", "rationale": "Offer confidential check-in", "followup_days": 3})
    assert r.status_code == 200


def test_roster_preview_reduces_p104_nights(client):
    h = login(client, "welfare.3bn", purpose="welfare")
    r = client.post("/v1/welfare/cases/P-104/roster-preview", headers=h).json()
    assert r["feasible"]
    assert r["person"]["plan_nights"] == 4 and r["person"]["optimized_nights"] <= 3
    assert r["summary"]["optimized_rule_violations"] == 0


def test_commander_cannot_read_individual_case_and_denial_is_logged(client):
    h = login(client, "cmdr.3bn", purpose="welfare")
    r = client.get("/v1/welfare/cases/P-104", headers=h)
    assert r.status_code == 403
    audit = client.get("/v1/audit?outcome=denied", headers=login(client, "auditor")).json()
    assert any(e["actor"] == "cmdr.3bn" and e["subject"] == "P-104" for e in audit)


def test_disciplinary_purpose_is_blocked(client):
    h = login(client, "discipline.client", purpose="disciplinary")
    assert client.get("/v1/welfare/cases/P-104", headers=h).status_code == 403
    # even a welfare officer token is refused when the declared purpose is not welfare
    h2 = login(client, "welfare.3bn", purpose="disciplinary")
    assert client.get("/v1/welfare/cases/P-104", headers=h2).status_code == 403


def test_commander_aggregates_are_dp_and_small_units_suppressed(client):
    h = login(client, "cmdr.3bn")
    ov = client.get("/v1/commander/units/3 Bn/overview", headers=h).json()
    det = next(u for u in ov["units"] if u["company"] == "3 Bn Det")
    assert det["suppressed"] and det["high_share"]["burnout"] is None
    assert "person_id" not in str(ov)
    again = client.get("/v1/commander/units/3 Bn/overview", headers=h).json()
    assert again["units"] == ov["units"], "same query must return the same noisy answer (no averaging attack)"


def test_cross_unit_access_denied(client):
    h = login(client, "welfare.3bn", purpose="welfare")
    assert client.get("/v1/welfare/cases/P-001", headers=h).status_code == 403   # P-001 is in 1 Bn


def test_my_data_mirror_shows_officer_access(client):
    log = client.get("/v1/me/access-log", headers=login(client, "p104")).json()
    assert any(e["action"] == "view_case" and e["actor_role"] == "welfare_officer" for e in log)


def test_crisis_route_creates_t0(client):
    r = client.post("/v1/crisis", headers=login(client, "p104"), json={"trigger": "help_button"}).json()
    assert r["helplines"][0]["phone"] == "14416"
    q = client.get("/v1/welfare/queue", headers=login(client, "welfare.3bn", purpose="welfare")).json()
    assert q["items"][0]["tier"] == "T0"


def test_consent_withdrawal_stops_collection(client):
    me = login(client, "p104")
    client.post("/v1/consents", headers=me, json={"modality": "readiness", "granted": False})
    r = client.post("/v1/readiness/summary", headers=me, json={"rt_median_ms": 300, "lapses": 1, "false_starts": 0, "trials": 30})
    assert r.status_code == 403
    client.post("/v1/consents", headers=me, json={"modality": "readiness", "granted": True})


def test_audit_chain_is_intact(client):
    v = client.get("/v1/audit/verify", headers=login(client, "auditor")).json()
    assert v["valid"] and v["events_checked"] > 10


def test_validation_errors_are_clean(client):
    r = client.post("/v1/checkins", headers=login(client, "p104"), json={"energy": 9})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"


def test_audit_chain_survives_concurrent_requests(client):
    """Regression: parallel requests used to fork the hash chain."""
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda _: client.post("/v1/auth/login", json={"username": "auditor"}), range(24)))
    v = client.get("/v1/audit/verify", headers=login(client, "auditor")).json()
    assert v["valid"], v
