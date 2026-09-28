const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType,
  HeadingLevel, AlignmentType, LevelFormat, BorderStyle, PageBreak, Footer, Header, PageNumber,
  TableOfContents,
} = require("docx");

const NAVY = "1F3A5F", TEAL = "0F766E", LIGHT = "E8EEF5", AMBER = "FFF4E0", RED = "FDECEC", GREEN = "E7F5EE";
const W = 9746; // content width (A4, 0.75in margins)
const FONT = "Calibri";

// **bold** inline parser
function runs(text, opts = {}) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map(p => p.startsWith("**")
    ? new TextRun({ text: p.slice(2, -2), bold: true, font: FONT, size: opts.size || 21, color: opts.color })
    : new TextRun({ text: p, bold: opts.bold, italics: opts.italics, font: FONT, size: opts.size || 21, color: opts.color }));
}
const P = (t, o = {}) => new Paragraph({ children: runs(t, o), spacing: { after: 120, line: 276 }, alignment: o.align });
const H1 = t => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, font: FONT })], keepNext: true });
const H2 = t => new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun({ text: t, font: FONT })] });
const B = (t, lvl = 0) => new Paragraph({ numbering: { reference: "bul", level: lvl }, children: runs(t), spacing: { after: 60 } });
const N = (t) => new Paragraph({ numbering: { reference: "num", level: 0 }, children: runs(t), spacing: { after: 60 } });
const BR = () => new Paragraph({ children: [new PageBreak()] });

const border = { style: BorderStyle.SINGLE, size: 4, color: "B8C4D2" };
const borders = { top: border, bottom: border, left: border, right: border };
function cell(text, width, fill, bold, color) {
  const lines = Array.isArray(text) ? text : [text];
  return new TableCell({
    width: { size: width, type: WidthType.DXA }, borders,
    shading: fill ? { fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: lines.map(l => new Paragraph({ children: runs(l, { size: 19, bold, color }), spacing: { after: 20 } })),
  });
}
function T(headers, rows, fr, opts = {}) {
  const tot = fr.reduce((a, b) => a + b, 0);
  const ws = fr.map(f => Math.floor(W * f / tot));
  ws[ws.length - 1] += W - ws.reduce((a, b) => a + b, 0);
  const trs = [];
  if (headers) trs.push(new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, ws[i], NAVY, true, "FFFFFF")) }));
  rows.forEach((r, ri) => trs.push(new TableRow({
    children: r.map((c, i) => cell(c, ws[i], opts.fill ? opts.fill(r, ri, i) : (ri % 2 ? "F6F8FB" : undefined), opts.boldFirst && i === 0)),
  })));
  return [new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: ws, rows: trs }), new Paragraph({ spacing: { after: 100 }, children: [] })];
}
function callout(title, text, fill = LIGHT) {
  const lines = Array.isArray(text) ? text : [text];
  return [new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [W],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: W, type: WidthType.DXA },
      borders: { top: border, bottom: border, right: border, left: { style: BorderStyle.SINGLE, size: 24, color: TEAL } },
      shading: { fill, type: ShadingType.CLEAR, color: "auto" },
      margins: { top: 100, bottom: 100, left: 160, right: 160 },
      children: [new Paragraph({ children: runs(title, { bold: true, color: NAVY }), spacing: { after: 60 } }),
        ...lines.map(l => new Paragraph({ children: runs(l, { size: 20 }), spacing: { after: 40 } }))],
    })] })],
  }), new Paragraph({ spacing: { after: 100 }, children: [] })];
}
const flow = steps => callout("Flow", steps.join("  →  "), "F1F5F9");

// ---------------------------------------------------------------- CONTENT
const c = [];

// Title page
c.push(new Paragraph({ spacing: { before: 1800, after: 200 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "SAHARA", font: FONT, size: 72, bold: true, color: NAVY })] }));
c.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
  children: [new TextRun({ text: "Stress-Aware Health And Resilience Analytics", font: FONT, size: 26, color: TEAL })] }));
c.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
  children: [new TextRun({ text: "AI-Based Predictive Personnel Stress and Welfare Monitoring System for Uniformed Forces", font: FONT, size: 32, bold: true })] }));
c.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 },
  children: [new TextRun({ text: "Product Requirements Document  |  Version 2.0  |  Smart India Hackathon Grand Finale", font: FONT, size: 22, color: "555555" })] }));
c.push(...T(null, [
  ["Purpose", "SIH Grand Finale build specification, problem statement traceability and judging defence"],
  ["Primary users", "Personnel, Welfare Officers, Counsellors / Medical Officers, Unit Commanders, Roster Planners, Administrators"],
  ["Deployment posture", "Prototype: 100% synthetic data. Production: force controlled private network or approved Government community cloud (MeitY empanelled)."],
  ["PS ID / Organization", "SIH26186  /  Ministry of Home Affairs  |  Theme: MedTech / BioTech / HealthTech  |  Category: Software"],
  ["Team", "TribeCoders (Team ID 144977)"],
  ["Supersedes", "PRD v1.0 (SAHARA core loop). v2.0 dated 25 Sep 2026."],
  ["Status", "Scope frozen for finale build. Tier 1 = must demo, Tier 2 = show, Tier 3 = roadmap only."],
], [1, 3], { boldFirst: true }));
c.push(...callout("One-line pitch",
  "SAHARA predicts acute stress (7-day), emotional fatigue (14-day) and burnout (30-day) risk by comparing each person against their own baseline, asks for only the minimum voluntary evidence it needs, routes explainable alerts to welfare staff (never to discipline), recommends a feasible intervention including roster rebalancing, and proves recovery. All of this runs privacy-first and fully inside the force network."));
c.push(BR());

c.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }));
c.push(BR());

// 3 Problem framing
c.push(H1("1. Executive Summary and Problem Framing"));
c.push(P("Personnel in CAPFs and the Armed Forces face long deployments, night duty concentration, frequent transfers, separation from family, deferred leave and exposure to traumatic incidents. Welfare today is reactive: stress is noticed through manual observation or self-reporting, often after a crisis. Workload data sits in HRMS, wellbeing information is scattered, and actions are not followed up."));
c.push(P("**The real problem is not 'detect stress from duty hours'.** Strain affects people differently, objective and self-reported signals can disagree, and welfare teams need defensible, minimally invasive evidence before offering support. SAHARA therefore estimates **risk trajectories** for four welfare dimensions, measures its own confidence, requests extra voluntary evidence only when needed, and closes the loop with human-approved intervention and measured recovery."));
c.push(H2("1.1 Product principles"));
[
  "**Personal baseline before population threshold.** What is abnormal for this person matters more than a generic cutoff.",
  "**Multimodal confirmation.** Operational, cognitive, physiological and self-reported evidence are interpreted together.",
  "**Adaptive evidence acquisition.** When confidence is low, ask for one short optional check instead of over-escalating.",
  "**Human in the loop.** Welfare staff review every individual alert and own every decision. No automatic action on a person.",
  "**Welfare-only purpose binding.** Data tagged welfare can never be read by disciplinary, promotion or ACR workflows (technically enforced).",
  "**Least data necessary.** No microphone, message content, call logs, GPS tracking, face or emotion recognition.",
  "**Personal benefit first.** Personnel get value (own trend, sleep insight, support) before the organization gets insight.",
  "**Safety over scoring.** Any crisis signal bypasses the model and goes straight to a human.",
].forEach(t => c.push(B(t)));

// 2 Traceability
c.push(H1("2. Problem Statement Traceability Matrix"));
c.push(P("Every line of the official problem statement maps to a concrete SAHARA feature and a visible proof in the finale demo. Judges can tick this table line by line."));
c.push(H2("2.1 System capabilities (\"The system should\")"));
c.push(...T(["PS requirement", "SAHARA feature", "Demo proof"], [
  ["Analyze HR indicators: leave patterns, deployment history, duty schedules, transfer frequency, training commitments, workload trends", "HRMS Adapter + Operational Feature Engine (Section 7.1): 26 derived features incl. transfers in 24m, leave fragmentation, workload slope", "Feature panel for P-104 shows each indicator vs personal baseline"],
  ["Optional self-reporting and wellness assessments via secure mobile app", "SAHARA Mobile (Android APK + PWA): 10-second check-in, WHO-5 style wellbeing, burnout pulse, device binding, PIN, screenshot block", "Live check-in on phone in under 20 seconds"],
  ["Voluntary biometric and wellness data where authorized", "On-device camera PPG, reaction time readiness test, optional Health Connect wearable sleep/HRV. Consent per modality.", "Consent toggles; payload shows derived features only"],
  ["Detect behavioral patterns associated with elevated stress", "Behavioral Analytics Engine: personal baseline deviation, Isolation Forest anomaly, change-point detection, engagement pattern shifts", "Baseline chart with deviation band and change-point marker"],
  ["Generate risk assessments and welfare recommendations for welfare officers and commanders", "4-dimension risk model + Intervention Recommender; welfare officers see individuals (pseudonymous), commanders see aggregates", "Welfare queue vs commander dashboard side by side"],
  ["Enable proactive counseling, welfare interventions and workload balancing", "Counselling booking, Welfare Need module, OR-Tools roster optimizer, counterfactual 'what would help'", "Redistribute 2 night duties, projected burnout drop shown"],
  ["Strong privacy safeguards, welfare not disciplinary", "Privacy Gateway, purpose-binding ('welfare-only' tag blocks use in disciplinary APIs), My Data Mirror, DP aggregates", "Commander tries individual endpoint, gets 403, and it is logged"],
], [2.2, 2.6, 1.8]));
c.push(H2("2.2 Expected solution components"));
c.push(...T(["PS component", "SAHARA module", "Tier"], [
  ["Personnel Wellness Monitoring Dashboard", "Welfare Officer Console + Commander Readiness Dashboard + Personnel 'My Trend'", "Tier 1"],
  ["Mobile-based Wellness and Self-Assessment Application", "SAHARA Mobile (Android APK/PWA, offline-first, multilingual)", "Tier 1"],
  ["Predictive Behavioral Analytics Engine", "Baseline + Anomaly + Change-point + Trajectory engine (Section 8)", "Tier 1"],
  ["Stress and Burnout Risk Prediction Models", "Four calibrated models: Acute Stress, Burnout, Emotional Fatigue, Welfare Concern + 14-day unit forecast", "Tier 1"],
  ["Welfare Intervention Recommendation System", "Rule + model hybrid recommender, counterfactuals, roster optimizer, effectiveness tracker", "Tier 1"],
  ["Role-based Access Control and Privacy Management Framework", "RBAC + ABAC (unit, purpose), consent manager, purpose-binding, break-glass, DPDP rights portal", "Tier 1"],
  ["Automated Alerts for authorized welfare personnel", "Tiered Alert Engine with SLA escalation, push/SMS/email, crisis fast lane", "Tier 1"],
  ["Data anonymization and secure storage", "Pseudonym vault, k-anonymity, differential privacy, AES-256, hash-chained audit", "Tier 1"],
], [2.3, 3.5, 0.8]));
c.push(H2("2.3 Preliminary scope, technical challenges and benefits"));
c.push(...T(["PS item", "Where addressed"], [
  ["Scope 1-5: analytics algorithms, mobile platform, risk engine, dashboards, recommendation system", "Sections 6-12"],
  ["Scope 6: Secure integration with HRMS", "Section 13.3: HRMS Adapter (REST/CSV/SFTP), schema mapping, mTLS service identity, idempotent ingestion"],
  ["Scope 7: Privacy-preserving analytics and RBAC", "Section 14"],
  ["Challenge 1: Privacy and confidentiality", "Privacy Gateway, minimization, on-prem, DP (Section 14)"],
  ["Challenge 2: Preventing stigmatization", "Non-diagnostic language, pseudonymous queue, commander sees no individuals, purpose-binding, no label visible to peers"],
  ["Challenge 3: False positives / negatives", "Personal baselines, multimodal agreement, calibrated confidence, adaptive evidence request, recall at review capacity metric"],
  ["Challenge 4: Ethical and transparent AI", "SHAP + counterfactuals, model cards, fairness audit, human-in-the-loop, Ethics Board review"],
  ["Challenge 5: Cyber threats", "STRIDE threat model, OWASP ASVS L2 controls, mTLS, HSM keys, SIEM, CERT-In reporting (Section 14.4)"],
  ["Challenge 6: Building trust", "My Data Mirror, consent receipts, withdraw anytime, personal benefit first ('My Trend'), buddy system"],
  ["Benefits 1-8", "Mapped to metrics in Section 18 (early identification lead time, incident trend, retention risk, workload balance index)"],
  ["Strategic: indigenous, Indian operational/cultural context", "Section 15: languages, kiosk/offline for remote posts, Tele-MANAS, DPDP, on-prem Indian stack"],
  ["Potential market", "Section 22"],
], [2.2, 4.4]));

// 0 change log
c.push(H1("3. What Changed from v1.0"));
c.push(...T(["Area", "v1.0", "v2.0 upgrade", "Why (PS link)"], [
  ["HR indicators", "Duty, night shift, deployment, leave deferral, training", "Added **transfer frequency**, full **leave pattern** analytics, workload trend slope, hardship posting index", "PS: 'leave patterns ... transfer frequency ... workload trends'"],
  ["Risk outputs", "Single 'welfare concern' band", "**Four named risk dimensions**: Acute Stress, Burnout, Emotional Fatigue, Welfare Concern (non-diagnostic)", "PS: 'Stress and Burnout Risk Prediction Models'"],
  ["Welfare concerns", "Psychological signals only", "**Welfare Need & Grievance module** (family, housing, finance, children education, leave, medical of dependants)", "PS: '...and welfare concerns'"],
  ["Alerts", "Queue only", "**Tiered Automated Alert Engine** with SLA, escalation and multi-channel notifications", "PS: 'Automated Alerts for authorized welfare personnel'"],
  ["Safety", "Suicide risk out of scope, no safety route", "**Crisis Safe-Route**: immediate human + Tele-MANAS 14416 routing, no scoring", "PS: 'reduction in stress-related incidents'"],
  ["Prediction", "Individual trajectory only", "**Unit Welfare Weather Forecast**: 14-day forward strain from planned roster/deployment", "PS: 'Predictive ... proactive'"],
  ["Explanation", "SHAP top factors", "SHAP + **Counterfactual 'What Would Help'** linked to roster optimizer", "PS: 'ethical and transparent AI'"],
  ["Trust", "Consent + audit", "**My Data Mirror** (personnel see who viewed their data and why), buddy system, anonymous counsellor chat", "PS: 'Building trust among personnel'"],
  ["Anonymization", "Pseudonyms, n>=10 suppression", "Minimum cell size + **Differential Privacy** on commander aggregates with privacy budget", "PS: 'Data anonymization'"],
  ["Planning", "None", "**Welfare Resource Planner**: counsellor demand forecast, aggregate retention risk", "PS benefits 6 and 7"],
  ["Biometrics", "Camera PPG", "+ optional **wearable sleep/HRV via Android Health Connect**", "PS: 'voluntary biometric ... data'"],
  ["Indian context", "Generic", "**DPDP Act 2023** compliance map, CERT-In, Hindi + regional languages, offline/kiosk mode, Tele-MANAS", "PS: 'indigenous capability ... Indian CAPFs'"],
  ["Hackathon plan", "6-week roadmap, 5 roles", "Pre-finale plan + **36-hour finale plan**, **6 roles**, judge round strategy", "SIH format"],
  ["Market", "None", "Market, scalability and adoption section", "PS: 'Potential Market'"],
], [1.1, 1.5, 2.4, 1.6]));

// 4 Personas
c.push(H1("4. Users, Personas and Permissions"));
c.push(...T(["Persona", "Needs", "Can see", "Cannot see"], [
  ["Personnel member (Jawan / Officer)", "Fast respectful check-in, confidential help, control over data, no punishment", "Own trend, own risk band in plain language, who accessed their data", "Anyone else's data"],
  ["Buddy (opt-in peer)", "Know when a nominated peer wants a call", "Only a 'please check on me' nudge that the person triggers", "Scores, assessments"],
  ["Welfare Officer", "Prioritized queue, evidence, case notes, follow-ups", "Pseudonymous individual evidence for own units", "Identity (unless approved reveal), other units"],
  ["Counsellor / Medical Officer", "Referral context, appointment, confidential notes", "Referred cases with consent", "Commander views, roster data"],
  ["Unit Commander", "Unit readiness, workload hotspots, forecast", "DP-protected aggregates (n>=10), roster options", "Any individual wellness data or identity"],
  ["Roster Planner", "Feasible duty alternatives", "Availability, skills, anonymized strain weights", "Assessments, case notes"],
  ["Administrator / Auditor", "Onboarding, policy, audit", "Config, audit logs, model registry", "Welfare case content"],
], [1.4, 1.8, 1.8, 1.6]));

// 5 Scope
c.push(H1("5. Scope"));
c.push(...T(["In scope (SIH prototype)", "Explicit non-goals"], [
  ["Synthetic HRMS for 300 personnel across 3 battalions, 180 days", "Clinical diagnosis, therapy, medication, suicide risk scoring"],
  ["Mobile app: consent, check-in, wellbeing and burnout pulse, reaction test, camera PPG, Health Connect", "Continuous monitoring, microphone, messages, call logs, GPS, face or emotion recognition"],
  ["4-dimension risk model, baseline, anomaly, forecast, SHAP, counterfactuals", "Any disciplinary, promotion, ACR, leave denial or automatic roster change"],
  ["Welfare console, commander dashboard, alert engine, crisis safe-route", "Public cloud LLM processing of personnel data"],
  ["Roster optimizer, welfare need module, resource planner, My Data Mirror", "Claims of validated clinical accuracy on real force data"],
], [1, 1]));

// 6 Personnel app
c.push(H1("6. SAHARA Mobile: Wellness and Self-Assessment App"));
c.push(...flow(["Consent (per modality)", "10-sec check-in", "Optional readiness test", "My Trend + tips", "Request support / Buddy / Welfare need"]));
c.push(...T(["Feature", "Detail", "Tier"], [
  ["Granular consent", "Separate toggles for check-in, readiness test, camera PPG, wearable, HRMS linkage for prediction. Consent receipt stored (DPDP).", "1"],
  ["10-second check-in", "3 emoji sliders: energy, sleep quality, workload feeling. Icon-based for low literacy.", "1"],
  ["Weekly wellbeing pulse", "WHO-5 Wellbeing Index (free to use) + 4-item burnout pulse adapted from the Copenhagen Burnout Inventory (public domain) + emotional fatigue item + one optional item: 'Do you need urgent support right now?'. No licensed instruments (e.g., MBI) used. Non-diagnostic.", "1"],
  ["Digital Readiness Check", "90-second touchscreen reaction test (PVT style): median RT, lapses, false starts, computed on device", "1"],
  ["Camera PPG (optional)", "30-second fingertip on camera: heart rate + HRV proxy computed on device; frames never leave the phone. Fallback: seeded demo value if device torch unsupported.", "1"],
  ["Wearable connector (optional)", "Android Health Connect read of sleep duration, resting HR, HRV summary (daily aggregates only). Needs native Android build (Capacitor plugin); PWA shows simulated feed.", "2"],
  ["My Trend", "Personal chart in plain language: 'your sleep is below your usual for 9 days'. Micro-tips (sleep hygiene, breathing).", "1"],
  ["Support request", "One tap: talk to welfare officer, counsellor, or anonymous chat. Choice of named or anonymous.", "1"],
  ["Welfare need / grievance", "Raise family, housing, finance, leave, child education, dependant medical need; tracked with status", "1"],
  ["Buddy system", "Nominate up to 2 trusted peers; 'please check on me' nudge without sharing any data", "2"],
  ["My Data Mirror", "Timeline of every access to my data: role, purpose, time. Download or request correction/erasure.", "1"],
  ["Security", "Device binding, app PIN/biometric unlock, screenshot block, encrypted local store, auto-wipe after inactivity", "1"],
  ["Languages and access", "English, Hindi + 2 regional (e.g., Tamil, Bengali) via i18n; large text; offline-first with sync queue", "1 (EN/HI), 2 (others)"],
  ["Kiosk mode", "Shared unit tablet for posts where personal phones are restricted; per-person PIN, session auto-clear", "2"],
], [1.4, 4.4, 0.8]));

// 7 Signals
c.push(H1("7. Signal Domains and Features"));
c.push(H2("7.1 Operational (HRMS) indicators"));
c.push(...T(["PS indicator", "Derived features (7d / 30d / 90d windows)"], [
  ["Leave patterns", "Days since last home leave; leave deferred/cancelled count; sudden short-leave frequency; sick-leave spikes vs baseline; leave fragmentation index; leave-balance hoarding"],
  ["Deployment history", "Continuous deployment days; hardship posting index (terrain, altitude, insurgency tier); cumulative deployments 24m; time since last rotation"],
  ["Duty schedules", "Night duty count and clustering; consecutive duty days; rest gap below policy; shift irregularity (circadian disruption score)"],
  ["Transfer frequency", "Transfers in 24m and 60m; days since last transfer; family separation flag after transfer; distance from home station"],
  ["Training commitments", "Training hours added on top of duty; training during recovery window; course failure/retake count"],
  ["Workload trends", "Duty hours slope (linear trend over 30d); workload vs unit median; overtime; staffing gap of unit (demand/strength)"],
  ["Critical incident exposure", "Count of logged operational incidents attended (casualty, IED, disaster) with decay weighting"],
], [1.3, 5.3]));
c.push(H2("7.2 Individual evidence domains"));
c.push(...T(["Domain", "Features", "Collection boundary"], [
  ["Cognitive readiness", "Median RT, lapses (>500 ms), variability, false starts, test quality", "Computed on phone; summary only"],
  ["Physiological proxy", "Resting HR, HRV (RMSSD proxy), sleep duration and regularity, signal quality", "On-device PPG or Health Connect daily aggregates"],
  ["Self-reported", "Energy, sleep, workload, wellbeing score, burnout pulse, emotional fatigue, support request", "Voluntary form"],
  ["Engagement pattern", "Check-in regularity change (only if user consented; never penalizing, used only to lower confidence or prompt gently)", "Metadata of voluntary use"],
  ["Welfare need", "Open welfare requests, category, age of unresolved need", "Welfare Need module"],
  ["Quality and trajectory", "Robust z-score, 7/30-day delta, change-points, missingness, modality age", "Feature layer"],
], [1.3, 3.4, 1.9]));

// 8 AI/ML
c.push(H1("8. Predictive Behavioral Analytics Engine"));
c.push(H2("8.1 Four risk dimensions (non-diagnostic)"));
c.push(...T(["Dimension", "Definition in SAHARA", "Primary drivers", "Horizon"], [
  ["Acute Stress Risk", "Short-term elevation of strain vs personal baseline", "Recent night clustering, incident exposure, readiness drop, HR/HRV shift, low check-ins", "7 days"],
  ["Burnout Risk", "Sustained exhaustion and detachment built over weeks", "Workload slope, leave deprivation, deployment length, burnout pulse, sleep debt", "30 days"],
  ["Emotional Fatigue", "Wearing down of emotional energy and wellbeing", "Wellbeing score trend, family separation, transfer recency, self-report discordance", "14 days"],
  ["Welfare Concern", "Unmet practical needs likely to drive strain", "Open welfare needs, leave cancelled, transfer far from home, dependant medical", "Current"],
], [1.2, 1.9, 2.6, 0.9]));
c.push(P("Each dimension outputs a **band** (Low / Moderate / High), a **calibrated probability**, a **confidence** score, **evidence coverage** and **top factors**. The UI never uses words like 'depressed', 'disorder' or 'unfit'."));
c.push(H2("8.2 Model components"));
c.push(...T(["Component", "Method", "Output"], [
  ["Personal baseline", "Robust rolling median and MAD after 21-day window", "Per-signal robust z-score"],
  ["Cold start", "Hierarchical shrinkage: blend cohort baseline (rank, duty type, posting tier) with personal data, weight grows with days observed", "Usable baseline from day 1"],
  ["Anomaly detector", "Isolation Forest on multivariate deviation vector", "Unusual pattern score"],
  ["Change-point detection", "PELT / CUSUM on key signals", "Date when trend shifted (shown on chart)"],
  ["Risk models (x4)", "Gradient boosting (XGBoost/LightGBM) per dimension on rolling features", "Probability of deterioration within horizon"],
  ["Calibration", "Isotonic regression on validation split", "Reliable probabilities (Brier, ECE)"],
  ["Evidence agreement", "Domain votes weighted by quality and recency", "Agreement / discordance / missing"],
  ["Explanation", "TreeSHAP + human-readable rule mapping", "Top 3 contributors with direction"],
  ["Counterfactual 'What would help'", "Constrained search over actionable features only (night duties, leave, training, rest gap)", "'2 fewer night duties + 3-day rest: Burnout High to Moderate'"],
  ["Adaptive evidence", "Expected information gain over missing or stale modalities", "Minimum next optional check"],
  ["Unit forecast", "Apply models to planned roster/deployment for next 14 days, aggregate with DP", "Welfare Weather Forecast per unit"],
  ["Anti-gaming checks", "PVT effort validity (too fast/too uniform), straight-lining detection, self vs objective discordance", "Quality flag, not a penalty"],
], [1.5, 3.2, 1.9]));
c.push(H2("8.3 Confidence logic"));
c.push(P("Confidence is separate from concern. It combines calibration, evidence coverage, modality quality, recency and inter-domain agreement. High operational load with no fresh individual evidence yields **low confidence plus an optional check request**, not an alert. Discordance is handled respectfully: poor self-report with normal objective signals always yields a **confidential support offer**, never dismissal."));
c.push(H2("8.4 Synthetic data generator (answers 'is the model just learning your generator?')"));
[
  "300 personnel, 3 battalions, 180 days; each person has a **hidden latent strain state** driven by operational load with individual sensitivity (random effects).",
  "Observed signals are noisy, delayed functions of latent strain, with missingness, device noise and 10% deliberately inconsistent self-reports.",
  "Confounders included: seasonal duty spikes, individuals with naturally slow reaction times, resilient high-load people.",
  "Labels (deterioration events) come from the latent state with a threshold plus noise. The model never sees the latent variable or generator rules.",
  "Baselines compared: single-threshold rule on duty hours, and a population-only model. SAHARA must beat both on lead time and PR-AUC.",
  "Everything is labelled SIMULATED in UI and metrics. Real validation plan in Section 23.",
].forEach(t => c.push(B(t)));

// 9 Crisis
c.push(H1("9. Crisis Safe-Route (Safety Net)"));
c.push(...callout("Non-negotiable design rule", "SAHARA does not predict or score suicide risk. But if any crisis signal appears, the system stops analysing and connects a human immediately.", RED));
c.push(...T(["Trigger", "Immediate response on phone", "Human response"], [
  ["User taps 'I need help now'", "Full-screen: call Tele-MANAS 14416, call unit counsellor, call buddy. Calming breathing guide.", "Counsellor + welfare officer alerted on crisis lane; callback SLA 30 minutes"],
  ["WHO-5 score very low (e.g., raw score <= 7) or 'urgent support' item answered Yes", "Gentle message + same options; no score shown", "Welfare officer alerted within 2 hours; mandatory human contact"],
  ["Crisis keyword in optional free-text (on-device keyword match only)", "Same safe-route; text itself never sent to server", "Flag only (no content) to counsellor"],
], [1.8, 2.6, 2.2]));
c.push(P("All SLA values are defaults, configurable to force policy. Crisis events bypass commander views entirely and are visible only to the counsellor and welfare officer on duty, with break-glass audit."));

// 10 Alerts
c.push(H1("10. Automated Alert Engine"));
c.push(...flow(["Risk event", "Policy rules + confidence gate", "Route by tier", "Notify (push / SMS / email)", "Acknowledge within SLA", "Auto-escalate if missed"]));
c.push(...T(["Tier", "Condition", "Recipient", "Ack SLA", "Escalation"], [
  ["T0 Crisis", "Crisis Safe-Route trigger", "Duty counsellor + welfare officer", "30 min", "Senior welfare officer / Medical Officer"],
  ["T1 High", "Any dimension High with confidence >= 0.7 sustained 3+ days", "Unit welfare officer", "24 h", "Senior welfare officer at 48 h"],
  ["T2 Moderate", "Moderate with evidence agreement >= 2 domains", "Unit welfare officer (digest)", "72 h", "Re-queue as T1 if worsening"],
  ["T3 Evidence request", "Low confidence with rising operational load", "Personnel (optional check request)", "N/A", "None, never escalates to staff"],
  ["Unit hotspot", "Unit forecast High for >= 20% of strength (DP aggregate)", "Commander + planner", "7 days", "Formation welfare cell"],
], [1.1, 2.3, 1.5, 0.7, 1.4]));
c.push(P("Alert fatigue controls: deduplication, daily digest for T2, capacity-aware ranking (recall at review capacity), and snooze with mandatory reason."));

// 11 Interventions
c.push(H1("11. Welfare Intervention Recommendation System"));
c.push(...flow(["Concern surfaced", "Welfare review", "Recommended options", "Human selects", "Roster / counselling / welfare action", "Follow-up", "Measure recovery"]));
c.push(...T(["Situation", "Recommended options (ranked)", "Follow-up"], [
  ["Burnout High, workload driven", "Roster rebalancing via optimizer, recovery window, defer non-critical training, welfare conversation", "7 days"],
  ["Acute Stress High after incident exposure", "Critical incident debrief, counsellor session, short rest period", "3 days"],
  ["Emotional Fatigue with family separation / recent transfer", "Family connect (video call slot), leave planning, welfare need follow-up", "7-14 days"],
  ["Welfare Concern open > 14 days", "Escalate grievance to responsible branch, update personnel with status", "Until closed"],
  ["Discordance (feels bad, signals normal)", "Confidential support offer, counsellor option, no adverse inference", "Officer decides"],
  ["Low confidence", "Optional readiness check only", "7-14 days"],
], [2, 3.3, 1.3]));
c.push(H2("11.1 Roster optimizer (workload balancing)"));
c.push(P("Google OR-Tools CP-SAT. Inputs: required posts, shift coverage, skills, policy rest limits, current assignment, approved non-availability, fairness (spread of night duties). Objective: minimize total predicted strain and inequality while keeping all hard constraints. Output: up to 3 feasible plans with coverage check, fairness index and projected risk change. **Advisory only; command authority approves.**"));
c.push(H2("11.2 Intervention effectiveness tracker"));
c.push(P("Each intervention records pre/post trajectory. Aggregated (never per-person to commanders) to show which interventions work for which duty types. Roadmap: contextual bandit to personalize recommendations after governance approval."));

// 12 Welfare need & resource planner
c.push(H1("12. Welfare Need Module and Resource Planner"));
c.push(H2("12.1 Welfare Need and Grievance module"));
c.push(P("Categories: family medical emergency, housing/quarters, children education, financial stress (loans, pay anomaly), leave request, transfer request, pending allowances. Each need has status, owner branch, SLA and closure feedback. Unresolved needs feed the Welfare Concern dimension. This addresses root causes, not just symptoms."));
c.push(H2("12.2 Welfare Resource Planner (commander and HQ view)"));
[
  "Forecast counsellor sessions needed per battalion for the next 30 days.",
  "Heat map of welfare need categories by sector (DP protected) for budget and resource allocation.",
  "Aggregate retention risk trend (burnout + welfare concern + leave deprivation) for HR planning, never individual.",
  "Workload Balance Index per unit: distribution of night duty and deployment burden.",
].forEach(t => c.push(B(t)));

// 13 Architecture
c.push(H1("13. Technical Architecture"));
c.push(...flow(["Mobile App / Kiosk + HRMS Adapter", "API Gateway + Privacy Gateway", "Encrypted Postgres + Feature Store", "ML Engine + OR-Tools + Alert Engine", "Welfare / Commander / Admin apps"]));
c.push(H2("13.1 Stack"));
c.push(...T(["Layer", "Prototype choice", "Responsibility"], [
  ["Mobile", "React + Vite PWA (Capacitor wrap for Android APK), i18next, IndexedDB offline queue", "Consent, check-in, readiness test, PPG, My Trend, My Data Mirror"],
  ["Web dashboards", "React + Tailwind + Recharts", "Welfare console, commander, planner, admin"],
  ["API", "FastAPI (Python), OpenAPI, Pydantic, JWT/OIDC", "Auth, RBAC/ABAC, workflows, validation"],
  ["Data", "PostgreSQL with row level security; Redis for jobs/alerts", "Cases, features, audit, consent"],
  ["ML", "pandas, scikit-learn, XGBoost, SHAP, ruptures (change-points), MLflow", "Baselines, 4 models, calibration, explanation"],
  ["Optimization", "Google OR-Tools CP-SAT", "Roster alternatives"],
  ["Alerts", "Background worker + Web Push / SMS gateway stub / email", "Tiered notifications, SLA timers"],
  ["Deploy", "Docker Compose (prototype); Kubernetes on private cloud (production)", "One-command demo"],
  ["Optional assistant", "On-prem small LLM + RAG over approved welfare SOPs (Tier 3)", "Policy lookup only, never risk scoring"],
], [1.1, 2.8, 2.7]));
c.push(H2("13.2 Data flow"));
c.push(...T(["Stage", "Processing", "Output"], [
  ["Collection", "Client validation, consent check, on-device feature computation, raw discard", "Encrypted event with pseudonymous ID"],
  ["Privacy Gateway", "Tokenization, minimization, purpose tag, retention tag, authorization", "Authorized feature payload"],
  ["Feature layer", "Rolling windows, baseline deviation, change-points, missingness", "Versioned feature snapshot"],
  ["Inference", "4 risk models, calibration, confidence, SHAP, counterfactuals", "RiskAssessment record"],
  ["Alert engine", "Tier rules, dedup, SLA timers", "Notifications + queue"],
  ["Action", "Human decision, intervention, roster scenario, follow-up", "Audit event + recovery outcome"],
], [1.2, 3.4, 2]));
c.push(H2("13.3 HRMS integration"));
c.push(P("Adapter pattern: REST pull/push, CSV batch or SFTP drop from existing force HRMS. Canonical event schema (duty, leave, deployment, transfer, training, incident). mTLS service identity, unit-scoped tokens, schema validation, idempotency keys, replay protection. Only fields needed for features are ingested (field allow-list)."));

// 14 Privacy & Security
c.push(H1("14. Privacy, Security and Ethics Framework"));
c.push(H2("14.1 Privacy controls"));
c.push(...T(["Control", "Implementation", "Demo proof"], [
  ["Consent manager", "Per-modality, versioned, withdraw anytime, consent receipts", "Consent screen + receipt"],
  ["Purpose binding", "Every record tagged 'welfare'; policy engine denies non-welfare purposes", "Simulated external HR/disciplinary client requesting welfare data returns 403"],
  ["Minimization", "Derived features only; no raw frames, audio, text, GPS", "Inspect DB payload"],
  ["Pseudonymization", "Separate identity vault; rotating pseudonyms in analytics", "Queue shows P-IDs"],
  ["Anonymization", "Minimum cell size k>=10 (small groups suppressed) + Laplace differential privacy noise on aggregates with a privacy budget", "Small unit shows 'insufficient group'"],
  ["Identity reveal", "Break-glass: reason, second approver, time-limited, logged, visible in My Data Mirror", "Simulated reveal"],
  ["Retention", "Purpose-specific retention; auto deletion jobs", "Retention tag on events"],
  ["Transparency", "My Data Mirror + model cards + plain-language notice", "Personnel access log"],
], [1.3, 3.5, 1.8]));
c.push(H2("14.2 DPDP Act 2023 alignment"));
c.push(...T(["DPDP principle", "SAHARA mechanism"], [
  ["Notice and consent", "Plain-language notice in user's language; granular, itemized consent; consent receipts"],
  ["Purpose limitation", "Purpose-binding policy engine; welfare-only processing"],
  ["Data minimization and storage limitation", "Derived features, retention schedules, auto deletion"],
  ["Rights of data principal", "Access, correction, erasure and grievance through My Data Mirror"],
  ["Reasonable security safeguards", "Encryption, RBAC/ABAC, audit, SIEM, breach response"],
  ["Breach notification", "Incident runbook: report to authority and CERT-In within prescribed timelines"],
], [2, 4.6]));
c.push(P("Note: where processing is carried out by the State for security or other exempted purposes, SAHARA still applies these principles voluntarily to build trust.", { italics: true }));
c.push(H2("14.3 Security controls"));
c.push(...T(["Area", "Controls"], [
  ["Identity", "OIDC, MFA for staff, device binding for personnel, short-lived tokens"],
  ["Transport and storage", "TLS 1.3 / mTLS between services; AES-256 at rest; keys in HSM/KMS separate from data"],
  ["Application", "OWASP ASVS Level 2 controls, input validation, rate limits, CSP headers"],
  ["Audit", "Append-only, hash-chained audit log (tamper evident); SIEM export"],
  ["Mobile", "Encrypted local store, root detection, screenshot block, remote wipe"],
  ["Operations", "Air-gapped / private network deployment, least privilege, separation of duties, backup and DR"],
], [1.3, 5.3]));
c.push(H2("14.4 Threat model (STRIDE summary)"));
c.push(...T(["Threat", "Example", "Mitigation"], [
  ["Spoofing", "Stolen staff credentials", "MFA, device binding, anomaly login alerts"],
  ["Tampering", "Editing case history", "Hash-chained audit, RLS, immutable events"],
  ["Repudiation", "Officer denies viewing data", "Signed audit entries + My Data Mirror"],
  ["Information disclosure", "Commander infers individual from small unit", "k>=10 suppression + differential privacy + query budget"],
  ["Denial of service", "Flood API", "Rate limiting, queueing, private network"],
  ["Elevation of privilege", "Commander calls welfare endpoint", "ABAC with purpose + unit claims, 403 + alert"],
], [1.3, 2.4, 2.9]));
c.push(H2("14.5 Responsible AI"));
[
  "Model cards for every model: intended use, limits, training data (synthetic), metrics, fairness results.",
  "Fairness audit across rank, duty type, posting tier and gender (evaluation only, never as decision input).",
  "Ethics and Welfare Board sign-off before any production model release; drift monitoring and quarterly review.",
  "Welfare officer feedback ('helpful / not helpful / false alarm') captured for governed retraining.",
].forEach(t => c.push(B(t)));

// 15 Indian context
c.push(H1("15. Built for Indian Forces"));
c.push(...T(["Need", "SAHARA response"], [
  ["Linguistic diversity", "English + Hindi at launch, regional languages via i18n packs; icon-first check-in"],
  ["Remote posts, weak connectivity", "Offline-first app with encrypted sync queue; low-bandwidth mode; kiosk tablet at post"],
  ["Personal phone restrictions in ops areas", "Shared kiosk with per-person PIN; periodic check-in at base"],
  ["National mental health ecosystem", "Referral route to Tele-MANAS (14416) and force counselling cells"],
  ["Family separation", "Family connect scheduling, leave planning assistant, family welfare needs"],
  ["Data sovereignty", "Fully on-prem; open-source stack; no foreign cloud dependency; indigenous IP"],
  ["Hierarchy and stigma", "Commander never sees individuals; welfare-only purpose binding; anonymous support option"],
], [2, 4.6]));

// 16 Data model & API
c.push(H1("16. Data Model and APIs"));
c.push(H2("16.1 Core entities"));
c.push(...T(["Entity", "Key fields"], [
  ["PersonnelProfile", "person_id, pseudonym, unit_id, rank_band, duty_type, consent_state, baseline_status, language"],
  ["ConsentRecord", "consent_id, person_id, modality, purpose, version, status, receipt_hash, timestamp"],
  ["OperationalEvent", "event_id, person_id, type (duty/leave/deployment/transfer/training/incident), start, end, intensity, source"],
  ["ReadinessAssessment", "assessment_id, person_id, modality, metrics JSON, quality, device_ts"],
  ["CheckIn", "checkin_id, person_id, energy, sleep, workload, wellbeing, burnout_pulse, fatigue, ts"],
  ["FeatureSnapshot", "snapshot_id, person_id, window, features JSON, feature_version"],
  ["RiskAssessment", "id, person_id, model_version, dimension, band, probability, confidence, coverage, factors JSON, counterfactuals JSON"],
  ["Alert", "alert_id, tier, person_id or unit_id, reason, status, ack_by, sla_due, escalated_to"],
  ["WelfareCase", "case_id, person_id, state, owner, priority, followup_at"],
  ["Intervention", "id, case_id, type, rationale, approved_by, start, end, pre_score, post_score"],
  ["WelfareNeed", "need_id, person_id, category, status, owner_branch, sla_due, closure_feedback"],
  ["RosterScenario", "scenario_id, unit_id, constraints, changes, feasible, fairness_index, strain_delta"],
  ["UnitForecast", "unit_id, date, dimension, dp_value, epsilon_used, suppressed"],
  ["AuditEvent", "event_id, actor, role, action, resource, purpose, ts, prev_hash, hash"],
], [1.6, 5]));
c.push(H2("16.2 API surface"));
c.push(...T(["Endpoint", "Purpose", "Authorization"], [
  ["POST /v1/consents", "Grant or withdraw modality consent", "Personnel (self)"],
  ["POST /v1/checkins", "Submit check-in / pulse", "Personnel (self)"],
  ["POST /v1/readiness/summary", "Submit on-device derived features", "Personnel, consented modality"],
  ["POST /v1/crisis", "Trigger Crisis Safe-Route", "Personnel (self)"],
  ["POST /v1/welfare-needs", "Raise welfare need", "Personnel (self)"],
  ["GET /v1/me/trend  |  GET /v1/me/access-log", "My Trend  |  My Data Mirror", "Personnel (self)"],
  ["POST /v1/integrations/hrms/events", "Ingest HRMS events", "Service identity, unit scoped"],
  ["GET /v1/welfare/queue", "Prioritized alerts", "Welfare officer, unit + purpose"],
  ["GET /v1/welfare/cases/{id}", "Evidence, factors, counterfactuals", "Case owner"],
  ["POST /v1/welfare/cases/{id}/actions", "Record action and follow-up", "Welfare role, reason required"],
  ["POST /v1/alerts/{id}/ack", "Acknowledge alert", "Recipient"],
  ["GET /v1/commander/units/{id}/aggregate", "DP aggregates + forecast", "Commander, aggregate only"],
  ["POST /v1/roster/scenarios", "Run optimizer", "Planner / commander"],
  ["GET /v1/planner/resources", "Counsellor demand, need heat map", "HQ welfare cell"],
  ["GET /v1/audit", "Search audit", "Auditor"],
], [2.6, 2.3, 1.7]));

// 17 FRs
c.push(H1("17. Functional Requirements"));
c.push(...T(["ID", "Requirement", "Priority", "Acceptance signal"], [
  ["FR-01", "Granular consent and check-in under 20 seconds", "Must", "Consent receipt persists; withdrawal stops collection"],
  ["FR-02", "Ingest HRMS events incl. transfers and leave; compute 7/30/90-day features", "Must", "Feature panel shows all 6 PS indicators"],
  ["FR-03", "Readiness test and camera PPG computed on device; summaries only sent", "Must", "No raw tap/frame data server side"],
  ["FR-04", "Personal baseline with cold-start shrinkage; change-point marking", "Must", "Chart shows baseline band and shift date"],
  ["FR-05", "Four risk dimensions with band, probability, confidence, factors", "Must", "Reproducible outputs on seeded data"],
  ["FR-06", "Counterfactual 'what would help' on actionable features", "Must", "At least 1 actionable counterfactual per High alert"],
  ["FR-07", "Low confidence triggers minimum optional evidence request", "Must", "Confidence 40% to 97% after check (measured in prototype)"],
  ["FR-08", "Tiered alert engine with SLA and escalation", "Must", "Unacknowledged T1 escalates in demo (time-compressed)"],
  ["FR-09", "Crisis Safe-Route with Tele-MANAS and counsellor routing", "Must", "Crisis tap creates T0 alert; no score shown"],
  ["FR-10", "Welfare case workflow with follow-up and recovery tracking", "Must", "Case action in audit; post-score shown"],
  ["FR-11", "Commander DP aggregates, 14-day unit forecast, no individual access", "Must", "Individual endpoint returns 403 and is logged"],
  ["FR-12", "Roster optimizer with hard constraints and fairness", "Must", "Feasible plan with projected strain drop"],
  ["FR-13", "My Data Mirror access log for personnel", "Must", "Officer view appears in personnel timeline"],
  ["FR-14", "Welfare Need module with SLA", "Must", "Need raised, routed, closed"],
  ["FR-15", "Welfare Resource Planner", "Should", "Counsellor demand forecast chart"],
  ["FR-16", "Hindi language and offline check-in sync", "Must", "Toggle language; airplane mode check-in syncs"],
  ["FR-17", "Buddy nudge, anonymous counsellor chat, wearable connector, kiosk mode", "Could", "Shown if time permits"],
  ["FR-18", "Hash-chained audit and purpose-binding enforcement", "Must", "Tamper test breaks chain verification"],
], [0.7, 3, 0.8, 2.1]));

// 18 Metrics
c.push(H1("18. Evaluation Metrics"));
c.push(...T(["Dimension", "Metric", "Target (simulated)"], [
  ["Early detection", "Onsets detected and warning time vs a duty-load rule at the SAME alert budget", "Report honestly. Prototype: both warn early; SAHARA gains on precision (burnout PR-AUC 0.60 vs 0.46 HRMS-only)"],
  ["Model quality", "PR-AUC, AUROC, recall at review capacity, Brier, ECE per dimension", "Beat both baselines; ECE < 0.05"],
  ["False alerts", "Alerts per 100 personnel per week; precision at T1", "< 3 per 100; precision > 0.6"],
  ["Explainability", "Alerts with 3 factors + counterfactual + recency", "100%"],
  ["Fairness", "Recall and false-alert gap across rank/duty/posting cohorts", "Gap < 5 points; reported openly"],
  ["Usability", "Check-in time, SUS score, task success", "< 20 s; SUS > 75; > 90%"],
  ["Privacy/security", "Forbidden requests denied and logged; raw data absence", "100%"],
  ["Optimization", "Hard constraint satisfaction; strain reduction; fairness index", "100%; measurable reduction"],
  ["Alert operations", "T1 acknowledged within SLA", "> 95% in simulation"],
  ["Recovery loop", "Follow-up completion; post-intervention trend", "Shown per case"],
], [1.3, 3.4, 1.9]));

// 19 Hackathon plan
c.push(H1("19. Build Plan for SIH Grand Finale"));
c.push(H2("19.1 Team of 6"));
c.push(...T(["Role", "Ownership", "Finale outputs"], [
  ["M1 Team Lead / Product", "PRD, PS traceability, pitch, judge Q&A", "Deck, demo script, risk register"],
  ["M2 Mobile / Frontend", "SAHARA Mobile (check-in, readiness test, PPG, My Trend, My Data Mirror, crisis)", "Working mobile flows, Hindi toggle"],
  ["M3 Dashboard / Frontend", "Welfare console, commander, planner, admin/audit", "All role views"],
  ["M4 Backend / Security", "FastAPI, auth, RBAC/ABAC, privacy gateway, alert engine, audit chain", "OpenAPI, role tests, 403 proof"],
  ["M5 ML Engineer", "Generator, features, baselines, 4 models, SHAP, counterfactuals, forecast", "Metrics notebook, model cards"],
  ["M6 Optimization / QA / DevOps", "OR-Tools roster, Docker Compose, seeded demo, tests, fallback video", "One-command demo, runbook"],
], [1.5, 3, 2.1]));
c.push(H2("19.2 Before the finale (pre-build)"));
c.push(P("Compress or stretch these weeks to the actual time left before the Grand Finale; the order of work stays the same."));
c.push(...T(["Week", "Deliverable", "Exit criterion"], [
  ["1", "Synthetic generator, schema, wireframes, threat model", "Seeded DB with 300 personnel x 180 days"],
  ["2", "Backend core + auth/RBAC + mobile check-in and readiness test", "End-to-end ingestion works"],
  ["3", "Baselines, 4 models, calibration, SHAP, confidence", "P-104 scenario produces deterministic output"],
  ["4", "Welfare console, alert engine, crisis route, case workflow, welfare need module", "Role separation demonstrated"],
  ["5", "Commander DP view, forecast, roster optimizer, My Data Mirror", "Feasible plan + DP proof"],
  ["6", "Hindi, offline sync, metrics page, polish, fallback video", "7-minute demo rehearsed 10 times"],
], [0.6, 3.6, 2.4]));
c.push(H2("19.3 36-hour finale plan"));
c.push(...T(["Hours", "Focus", "Judge round readiness"], [
  ["0-4", "Environment up, seeded data verified, fix anything broken since rehearsal, incorporate mentor feedback", "Round 1: pitch + traceability matrix + live core loop"],
  ["4-14", "Tier 2 features: resource planner, buddy nudge, anonymous chat, wearable stub", "Show progress vs Round 1 feedback"],
  ["14-20", "Hardening: security tests, fairness report, edge cases, crisis flow polish", "Round 2: deep dive on AI + privacy"],
  ["20-30", "UX polish, multilingual, kiosk mode, performance, final metrics", "Round 3 prep"],
  ["30-36", "Freeze, rehearsal, backup video, deck final", "Final evaluation: 7-minute demo + Q&A"],
], [0.8, 3.4, 2.4]));

// 20 Demo
c.push(H1("20. Finale Demo Script (7 minutes)"));
c.push(P("**Scenario:** P-104, 3rd Battalion. 6 night duties in 10 days and 4 more planned next week, 31-day continuous deployment, leave cancelled, transferred 30 days ago to a post 1,450 km from home, open leave request for a family surgery. HRMS load rises but confidence is only 40% because individual evidence is stale (last check-in 9 days ago, last readiness test 27 days ago)."));
c.push(...T(["Time", "What judges see", "Proof point"], [
  ["0:00-0:40", "Problem, 'welfare not surveillance' promise, traceability matrix", "Every PS line covered"],
  ["0:40-1:40", "P-104 gives consent, 10-sec check-in in Hindi, 90-sec readiness test", "Low burden, voluntary, multilingual"],
  ["1:40-2:15", "Privacy Gateway payload: pseudonymous derived features only", "No raw data, no public LLM"],
  ["2:15-3:15", "Baseline chart + change-point; confidence rises 40% to 97%; all four evidence domains agree; T1 alert reaches welfare officer", "Personal baseline + adaptive evidence"],
  ["3:15-4:00", "T1 alert pushes to welfare officer phone; SHAP factors + counterfactual 'what would help'", "Automated, explainable, actionable"],
  ["4:00-4:50", "Commander sees DP unit forecast hotspot; tries individual view: 403 logged; planner runs optimizer", "Workload balancing with no disclosure"],
  ["4:50-5:30", "Welfare officer schedules counselling + resolves leave need; follow-up shows recovery", "Closed loop"],
  ["5:30-6:10", "P-104 opens My Data Mirror: sees officer's access and purpose. Crisis button demo (T0 lane).", "Trust + safety"],
  ["6:10-7:00", "Metrics page (lead time, PR-AUC, fairness), architecture, validation roadmap", "Honest, deployable"],
], [0.9, 3.7, 2]));

// 21 Q&A
c.push(H1("21. Judge Q&A Defence Sheet"));
const qa = [
  ["Is this surveillance of soldiers?", "No. Voluntary modalities, no GPS/mic/messages, welfare-only purpose binding, commanders see only DP aggregates, and personnel see every access in My Data Mirror."],
  ["What is your accuracy?", "On simulated data we report PR-AUC, calibration and lead time vs baselines. We do not claim clinical accuracy; real validation needs a governed study (Section 23)."],
  ["Where do labels come from in reality?", "Welfare officer case outcomes, validated periodic wellbeing scores and counsellor-confirmed support needs, collected under ethics approval."],
  ["What if someone is suicidal?", "Crisis Safe-Route: no scoring, immediate human contact, Tele-MANAS 14416, counsellor with 30-min SLA."],
  ["What about false positives and stigma?", "Confidence gating, multi-domain agreement, pseudonymous queue, supportive language, human review, no adverse action allowed."],
  ["What if personnel lie on self-reports?", "We do not rely on one source. Objective and self signals are fused; discordance leads to a confidential support offer, not a penalty. Anti-gaming quality flags lower confidence."],
  ["Why not use ChatGPT/LLM?", "Personnel data cannot go to public APIs. Prediction uses explainable ML on-prem. An optional local LLM only answers welfare policy questions."],
  ["New recruit has no history?", "Cold-start shrinkage to cohort baseline, shifting to personal baseline as data grows."],
  ["Can a commander misuse the data?", "ABAC with purpose, k>=10 + differential privacy, 403 + alert on violation, audit visible to personnel."],
  ["No smartphone at forward posts?", "Kiosk mode with PIN, offline sync, and HRMS-only risk with low confidence flag."],
  ["How is it integrated with existing HRMS?", "Adapter pattern (REST/CSV/SFTP), canonical schema, field allow-list, mTLS."],
  ["Is it legal under DPDP?", "Consent, purpose limitation, minimization, rights portal, breach runbook mapped in Section 14.2."],
  ["How does it reduce workload?", "Roster optimizer produces feasible plans under coverage, skill and rest constraints with fairness; commander approves."],
  ["How is it different from other teams?", "Personal baseline + adaptive evidence, 4 calibrated dimensions, counterfactual actions, crisis route, My Data Mirror, DP commander view, closed-loop recovery."],
  ["What will it cost to deploy?", "Open-source stack, no licence fees. Models are lightweight tree models: nightly inference for 1 lakh personnel runs on standard CPU servers, no GPU. Main cost is existing force data-centre capacity and training of welfare staff."],
  ["What if HRMS data is incomplete or not digitized?", "Adapter accepts CSV batch uploads; missing domains lower confidence rather than breaking the model; self-report and readiness evidence still work."],
  ["Who is accountable if the AI misses someone?", "The AI only prioritizes; welfare officers keep all existing channels. Every decision is human-owned and audited. Metrics track recall and missed cases for review."],
  ["How will it scale?", "Stateless API, per-unit partitioning, batch nightly inference + event-driven updates; tested on 300 synthetic, designed for 1 lakh+ personnel per force."],
];
c.push(...T(["Question", "Answer"], qa, [2, 4.6]));

// 22 Market
c.push(H1("22. Market, Scalability and Adoption"));
c.push(...T(["Segment", "Fit", "Adaptation"], [
  ["CAPFs (CRPF, BSF, CISF, ITBP, SSB, AR, NSG)", "Primary target", "Unit/battalion hierarchy config"],
  ["Indian Armed Forces", "High", "Air-gapped deployment, service-specific duty types"],
  ["State Police", "High (shift-heavy)", "State HRMS adapters, regional languages"],
  ["NDRF / SDRF / Fire / Emergency services", "High (trauma exposure)", "Incident exposure weighting"],
  ["High-stress Government workforces (Railways, health workers)", "Medium", "Duty type templates"],
  ["Corporate HR wellness", "Medium", "SaaS tenant, HRIS connectors"],
  ["International security forces", "Long term", "Localization, compliance packs"],
], [2.4, 1.6, 2.6]));
c.push(P("**Adoption path:** pilot in one battalion (6 months) with ethics approval, then formation, then force-wide. Multi-tenant architecture with configurable policies per force. Open-source core with indigenous IP; cost dominated by on-prem hardware already available in force data centres."));

// 23 Risks and roadmap
c.push(H1("23. Risks, Mitigations and Validation Roadmap"));
c.push(...T(["Risk", "Mitigation"], [
  ["False positives and stigma", "Confidence gating, human review, supportive language, no punitive use"],
  ["Weak real-world labels", "Synthetic demo; governed pilot with DIPR / force psychologists for validation"],
  ["Data exposure", "On-prem, minimization, encryption, DP, audit"],
  ["Low engagement", "20-second interaction, personal benefit, adaptive requests only when useful"],
  ["Alert fatigue", "Tiering, digest, dedup, capacity-aware ranking"],
  ["Overbuilding at finale", "Tier discipline: Tier 1 demo-grade, Tier 2 show, Tier 3 slides"],
  ["Roster conflicts with mission", "Hard constraints, advisory only, command approval"],
], [2, 4.6]));
c.push(H2("23.1 Post-SIH roadmap (Tier 3)"));
[
  "Governed 6-month pilot with ethics approval and data protection impact assessment.",
  "Federated learning across units so raw data never centralizes.",
  "On-prem multilingual LLM assistant for welfare policy and family scheme lookup.",
  "Contextual bandits to personalize interventions based on measured effectiveness.",
  "Integration with force hospitals and counselling cells for referral workflows.",
].forEach(t => c.push(B(t)));

// 24 Acceptance
c.push(H1("24. Release Acceptance Criteria"));
c.push(...T(["Category", "Criterion"], [
  ["End to end", "P-104 flows from HRMS event to alert, review, intervention, follow-up and recovery with no manual DB edits"],
  ["PS coverage", "Every row of Section 2 demonstrable live or on metrics page"],
  ["4 risk dimensions", "Each shows band, probability, confidence, top 3 factors and caution text"],
  ["Adaptive confidence", "Visible 40% to 97% confidence change after optional check"],
  ["Alerts", "T1 push notification + simulated SLA escalation + T0 crisis lane"],
  ["Role separation", "Personnel, welfare, counsellor, commander, planner, admin logins expose different data; 403 logged"],
  ["Privacy proof", "DB contains derived metrics only; DP aggregate with suppression; My Data Mirror entry"],
  ["Roster", "At least one feasible plan passes coverage, skill, rest constraints with projected strain drop"],
  ["Metrics", "Metrics page: lead time, PR-AUC, calibration, fairness, security tests, limitations"],
  ["Resilience", "Seeded offline data, recorded fallback video, operator runbook"],
], [1.5, 5.1]));
c.push(...callout("Final recommendation",
  "Build Tier 1 to demo-grade perfection, show 2-3 Tier 2 features, keep Tier 3 on slides. A credible, safe, explainable closed loop that ticks every PS line will beat a broad but shallow 'AI stress detector'."));

// ---------------------------------------------------------------- DOC
const doc = new Document({
  creator: "Team SAHARA", title: "SAHARA PRD v2.0",
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: FONT, color: NAVY }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0,
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: TEAL, space: 4 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 25, bold: true, font: FONT, color: TEAL }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [
    { reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
    { reference: "num", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
  ] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: "SAHARA PRD v2.0  |  SIH Grand Finale", font: FONT, size: 16, color: "888888" })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: ["Page ", PageNumber.CURRENT], font: FONT, size: 16, color: "888888" })] })] }) },
    children: c,
  }],
});
Packer.toBuffer(doc).then(b => { fs.writeFileSync(process.argv[2], b); console.log("written", b.length); });
