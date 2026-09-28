# API reference

Base URL `http://localhost:8000`. Interactive docs: `http://localhost:8000/docs`.

## Authentication

Prototype login takes a demo username and returns a JWT:

```http
POST /v1/auth/login
{"username": "welfare.3bn"}
```

Send it as `Authorization: Bearer <token>`. Welfare routes also require the header
`X-Purpose-Of-Use: welfare`; any other purpose is refused with 403 and logged.

| Demo user | Role | Unit |
|---|---|---|
| `p104` | personnel (P-104) | 3 Bn |
| `welfare.3bn` | welfare_officer | 3 Bn |
| `counsellor.3bn` | counsellor | 3 Bn |
| `cmdr.3bn` | commander | 3 Bn |
| `planner.3bn` | planner | 3 Bn |
| `auditor` | auditor | all |
| `hrms.service` | service | all |
| `discipline.client` | hr_disciplinary (simulated misuse) | 3 Bn |

## Errors

Every error has the same shape; unexpected errors are logged with a traceback but never leak internals.

```json
{"error": {"code": "forbidden", "message": "Access denied: ...", "request_id": "3f9c1a2b7d10"}}
```

## Endpoints

### Personnel (`p104`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/me/overview` | Plain-language summary, own risk bands, check-in history, consents, needs, evidence request |
| POST | `/v1/consents` | Grant or withdraw consent per data type (receipt hash returned) |
| POST | `/v1/checkins` | 10-second check-in, optional WHO-5 and burnout pulse; re-scores the person |
| POST | `/v1/readiness/summary` | Reaction-test and heart-rate summary computed on the device |
| POST | `/v1/crisis` | Crisis Safe-Route: T0 alert + helplines (Tele-MANAS 14416) |
| POST | `/v1/welfare-needs` | Raise a welfare need (family, housing, finance, leave, ...) |
| GET | `/v1/me/access-log` | My Data Mirror: who accessed my data, when and why |

### Welfare officer / counsellor (purpose `welfare`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/welfare/queue` | Prioritised alert queue for the officer's unit |
| GET | `/v1/welfare/cases/{person_id}` | Full case: 4 risks, confidence, evidence, SHAP factors, counterfactuals, trend, needs |
| POST | `/v1/welfare/cases/{person_id}/actions` | Record a human decision (support, counselling, recovery window, ...) |
| POST | `/v1/welfare/alerts/{alert_id}/ack` | Acknowledge an alert |
| POST | `/v1/welfare/cases/{person_id}/reveal` | Break-glass identity reveal (justification + approver, audited) |
| POST | `/v1/welfare/cases/{person_id}/roster-preview` | Fair-roster plan and projected effect for this person |
| POST | `/v1/welfare/escalations/run` | Escalate alerts past their SLA |

### Commander / planner (aggregates only)

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/commander/units/{battalion}/overview` | Differentially private sub-unit readiness, small groups suppressed |
| GET | `/v1/commander/units/{battalion}/forecast` | 14-day share of personnel projected at high risk |
| POST | `/v1/roster/scenarios` | OR-Tools night-duty optimisation (no individual risk scores returned) |

### Admin, audit and integration

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/health` | Liveness and model readiness |
| POST | `/v1/auth/login` | Demo login |
| GET | `/v1/auth/demo-users` | List demo users |
| GET | `/v1/audit` | Audit events (auditor, welfare officer) |
| GET | `/v1/audit/verify` | Verify the hash chain end to end |
| GET | `/v1/metrics` | Held-out model metrics |
| POST | `/v1/integrations/hrms/events` | HRMS adapter push (service identity) |
