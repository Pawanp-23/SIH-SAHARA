# Model card: SAHARA risk models

## Intended use

Early, **non-diagnostic** welfare risk estimates for uniformed personnel, used only to help
welfare officers decide whom to offer support. Every alert is reviewed by a human. The models must
not be used for diagnosis, discipline, promotion, ACR or any employment decision; the API enforces
this with purpose-of-use checks.

## Data

**Synthetic only** (seed 26186): 300 personnel in 3 battalions over 180 days. Each person has a
hidden strain state driven by duty load, night duties, deployment, leave, incidents and individual
sensitivity. Observed signals are noisy, delayed and often missing; 10% of people under-report.
Labels mark whether the hidden state crosses its 93rd percentile within the dimension's horizon.
The models never see the hidden state or the generator's rules.

Split by person (no person appears in two splits): 180 train, 60 calibration, 60 test.

## Features

37 features: 20 operational indicators from HRMS (night duties, duty hours and trend, rest days,
continuous deployment, days since home leave, cancelled leave, transfers, family separation,
training load, critical incidents, unit load) and 17 individual signals (self-report, WHO-5,
burnout pulse, reaction time, attention lapses, resting heart rate, HRV, sleep) expressed as
deviation from the person's own robust baseline, plus evidence age and open welfare needs.

## Results on held-out personnel (simulated)

| Dimension | Horizon | Prevalence | AUROC | PR-AUC | Calibration error | Precision at High | HRMS-only PR-AUC | Duty-rule AUROC |
|---|---|---|---|---|---|---|---|---|
| Acute stress | 7 d | 9.4% | 0.97 | 0.79 | 0.014 | 83% | 0.53 | 0.87 |
| Burnout | 30 d | 18.0% | 0.82 | 0.60 | 0.034 | 82% | 0.46 | 0.73 |
| Emotional fatigue | 14 d | 11.4% | 0.94 | 0.73 | 0.013 | 78% | 0.51 | 0.82 |
| Welfare concern | 7 d | 11.5% | 0.86 | 0.75 | 0.006 | 95% | 0.13 | 0.45 |

**Early warning, burnout, equal alert budget:** of 32 onsets in the test set, SAHARA (Moderate or
above) detected 29 with a median of 11 days' warning; a duty-load rule tuned to the same alert rate
detected 31 with a median of 19 days. The rule warns as early; SAHARA's gain is precision (fewer
false alarms), four separate dimensions and explanations. We report this openly.

Regenerate these numbers with `python -m scripts.seed`; they are written to
`backend/artifacts/metrics.json` and shown on the Model Metrics screen.

## Fairness

Burnout recall and false-alert rate are reported per duty type (Model Metrics screen) and per rank
band (`backend/artifacts/metrics.json`). Cohorts are used for auditing only, never as model inputs.

## Limitations

- Synthetic data demonstrates the pipeline, not real-world accuracy. A governed pilot with force
  data, force psychologists (for example DIPR) and ethics approval is required before any use.
- Counterfactuals are model what-ifs on actionable features, not causal claims.
- Probabilities are clipped to 2–97%; ties at 97% are shown for the most severe cases.
- No suicide-risk prediction: crisis signals bypass the models and go straight to a human.
