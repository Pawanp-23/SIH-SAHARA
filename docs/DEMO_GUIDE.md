# Demo guide

## Reset the stage (2 minutes)

From `backend/`, with the API stopped:

```powershell
.venv\Scripts\python -m scripts.seed        # fresh synthetic data + models + alerts
```

Start the API and the web app (see the README), then stage the scenario:

```powershell
.venv\Scripts\python -m scripts.demo_flow   # P-104: confidence 40% -> 59% -> 97%, T1 alert
```

Open `http://localhost:5173` at full screen (1440 × 900 or larger).

## Scenario: P-104, 3 Bn C

Head Constable, static guard. Six night duties in the last 10 days and four more planned next
week (breaks the 3-night rule), 31 days of continuous deployment, 90 days since home leave,
leave cancelled, transferred 30 days ago to a post 1,450 km from home, open leave request for a
family surgery. Before the check-in, confidence is only 40% because the last self-report is 9 days
old and the last readiness test is 27 days old.

## 7-minute walkthrough

| Time | Screen | Show |
|---|---|---|
| 0:00–0:40 | — | Problem: 730 suicides and 55,555 exits in 2020–24 (MHA, Rajya Sabha Q.1036). Welfare, never surveillance. |
| 0:40–1:40 | Personnel App | Hindi UI, 10-second check-in, reaction test (tap when green), "only summary numbers are sent" |
| 1:40–3:00 | Welfare Console | P-104 at the top of the queue: 4 risks, confidence 97%, evidence agreement, change-point, SHAP factors |
| 3:00–3:50 | Welfare Console | "What would help": recovery window + leave → High to Moderate. Click **Plan fair roster (OR-Tools)** |
| 3:50–4:40 | Command Readiness | DP sub-unit table, suppressed 4-person detachment, 14-day forecast. Click **Open case P-104 as commander** → 403 |
| 4:40–5:30 | Audit & Privacy | Chain **Intact**; **Run misuse attempts** → all three blocked and logged |
| 5:30–6:10 | Personnel App | My Data Mirror shows the officer's access; help button → Tele-MANAS 14416 |
| 6:10–7:00 | Model Metrics | Held-out results, honest baseline comparison, fairness table |

## Screenshots

With both servers running, from the repository root:

```powershell
powershell -File tools\screenshots.ps1
```

Images are written to `docs/screenshots/` at 2880 × 1800.
