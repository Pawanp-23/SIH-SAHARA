import {
  Activity, AlertOctagon, CalendarClock, CheckCircle2, Eye, KeyRound, Lightbulb, ListChecks, Moon, ShieldAlert, Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api, USERS } from "../api/client";
import { BandBadge, Card, ErrorBanner, Loading, useAsync } from "../components/ui";
import { BAND_STYLE, DIM_COLORS, DIM_SHORT, TIER_STYLE, pct, shortDate, timeAgo } from "../lib/format";

const AS = { as: USERS.welfare, purpose: "welfare" };

export default function WelfareConsole() {
  const queue = useAsync(() => api("/v1/welfare/queue", AS), []);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!selected && queue.data?.items?.length) {
      const demo = queue.data.items.find((i) => i.person_id === "P-104");
      setSelected((demo || queue.data.items[0]).person_id);
    }
  }, [queue.data, selected]);

  return (
    <div className="grid grid-cols-[300px_1fr] gap-4 items-start">
      <Queue state={queue} selected={selected} onSelect={setSelected} />
      {selected ? <CaseView key={selected} pid={selected} onChanged={queue.reload} /> : !queue.loading && (
        <Card><p className="text-sm muted">No open alerts for your unit.</p></Card>
      )}
    </div>
  );
}

function Queue({ state, selected, onSelect }) {
  const { data, loading, error, reload } = state;
  return (
    <section className="card overflow-hidden sticky top-0">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h3 className="card-title flex items-center gap-1.5"><ListChecks className="size-4 text-navy-600" /> Priority queue</h3>
          <span className="text-[11px] muted">{data?.battalion}</span>
        </div>
        {data && (
          <div className="flex gap-1.5 mt-2.5 text-[11px] font-medium">
            <span className="rounded-md bg-red-600 text-white px-2 py-0.5">T0 {data.counts.T0}</span>
            <span className="rounded-md bg-red-50 text-red-700 px-2 py-0.5">T1 {data.counts.T1}</span>
            <span className="rounded-md bg-amber-50 text-amber-700 px-2 py-0.5">T2 {data.counts.T2}</span>
            <span className="rounded-md bg-slate-100 text-slate-600 px-2 py-0.5 ml-auto">{data.escalated} escalated</span>
          </div>
        )}
      </div>
      {loading && !data && <Loading label="Loading queue" />}
      <div className="p-2"><ErrorBanner error={error} onRetry={reload} /></div>
      <ul className="max-h-[calc(100vh-190px)] overflow-auto px-2 pb-2 space-y-1">
        {data?.items.map((i) => (
          <li key={i.alert_id}>
            <button onClick={() => onSelect(i.person_id)}
                    className={`w-full text-left rounded-lg px-3 py-2 transition border ${
                      selected === i.person_id ? "bg-navy-50 border-navy-100" : "border-transparent hover:bg-slate-50"}`}>
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-px text-[10.5px] font-semibold ${TIER_STYLE[i.tier].cls}`}>{i.tier}</span>
                <span className="font-semibold text-[13px] text-slate-800">{i.person_id}</span>
                <span className="text-[11px] muted">{i.unit}</span>
                <span className="ml-auto text-[12px] font-semibold tabular-nums text-slate-700">{pct(i.priority)}</span>
              </div>
              <div className="flex items-center justify-between mt-1 text-[11px]">
                <span className="text-slate-600">{i.top_dimension}</span>
                <span className={i.status === "escalated" ? "text-red-600 font-medium" : "muted"}>
                  {i.status === "escalated" ? "SLA missed, escalated" : timeAgo(i.created_at)}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ConfidenceRing({ value }) {
  const r = 26, c = 2 * Math.PI * r;
  const tone = value >= 0.7 ? "#2e8b3e" : value >= 0.5 ? "#d97706" : "#94a3b8";
  return (
    <svg viewBox="0 0 64 64" className="size-16">
      <circle cx="32" cy="32" r={r} fill="none" stroke="#e2e8f0" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={tone} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="36" textAnchor="middle" className="fill-slate-800 text-[14px] font-semibold">{Math.round(value * 100)}%</text>
    </svg>
  );
}

function CaseView({ pid, onChanged }) {
  const c = useAsync(() => api(`/v1/welfare/cases/${pid}`, AS), [pid]);
  const [roster, setRoster] = useState(null);
  const [reveal, setReveal] = useState(false);
  const [toast, setToast] = useState(null);

  if (c.loading && !c.data) return <Card><Loading label={`Loading case ${pid}`} /></Card>;
  if (c.error) return <ErrorBanner error={c.error} onRetry={c.reload} />;
  const d = c.data;
  const top = d.top_dimension;

  const act = async (action_type, rationale) => {
    try {
      await api(`/v1/welfare/cases/${pid}/actions`, { ...AS, method: "POST", body: { action_type, rationale, followup_days: 3 } });
      setToast(`Recorded: ${rationale}. Follow-up in 3 days.`);
      c.reload(); onChanged();
    } catch (e) { setToast(e.message); }
  };
  const planRoster = async () => {
    setRoster({ loading: true });
    try { setRoster({ data: await api(`/v1/welfare/cases/${pid}/roster-preview`, { ...AS, method: "POST" }) }); }
    catch (e) { setRoster({ error: e }); }
  };

  return (
    <div className="space-y-3 min-w-0">
      <CaseHeader d={d} onReveal={() => setReveal(true)} />
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(d.dimensions).map(([k, v]) => <RiskTile key={k} k={k} v={v} isTop={k === top} />)}
      </div>
      <div className="grid grid-cols-[1fr_300px] gap-3">
        <TrendCard d={d} />
        <EvidenceCard d={d} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <FactorsCard factors={d.factors[top]} dim={top} />
        <HelpCard items={d.what_would_help} onPlan={planRoster} />
        <ActionsCard d={d} onAct={act} />
      </div>
      {roster && <RosterPanel state={roster} onClose={() => setRoster(null)} />}
      <p className="text-[11px] muted px-1">{d.caution} Model {d.model_version}.</p>
      {reveal && <RevealDialog pid={pid} onClose={() => setReveal(false)} />}
      {toast && (
        <div className="fixed bottom-5 right-5 card px-4 py-3 text-sm flex items-center gap-2 shadow-lg">
          <CheckCircle2 className="size-4 text-india-600" /> {toast}
          <button className="ml-3 text-xs muted" onClick={() => setToast(null)}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

function CaseHeader({ d, onReveal }) {
  const o = d.operational;
  const facts = [
    [`${o.night_7} nights`, "last 7 days"], [`${o.deployed_continuous} days`, "continuous deployment"],
    [`${o.days_since_home_leave} days`, "since home leave"], [`${o.leave_cancelled_90}`, "leave cancelled (90d)"],
    [`${o.days_since_transfer} days`, "since transfer"], [`${o.open_needs}`, "open welfare need"],
  ];
  const tier = d.alerts.find((a) => a.status !== "closed");
  return (
    <section className="card px-4 py-3 flex items-center gap-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-navy-800">Case {d.person_id}</h2>
          {tier && <span className={`rounded px-1.5 py-px text-[11px] font-semibold ${TIER_STYLE[tier.tier].cls}`}>{tier.tier} · {TIER_STYLE[tier.tier].label}</span>}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">Pseudonymous</span>
        </div>
        <div className="text-[12px] muted mt-0.5">
          {d.profile.unit} · {d.profile.rank_band} · {d.profile.duty_type} · model date {shortDate(d.date)}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {facts.map(([v, l]) => (
            <span key={l} className="rounded-md bg-slate-50 ring-1 ring-slate-200 px-2 py-0.5 text-[11px]">
              <b className="text-slate-800">{v}</b> <span className="muted">{l}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="text-right">
          <div className="text-[11px] muted">Model confidence</div>
          <div className="text-[11px] text-slate-600 whitespace-nowrap">coverage {pct(d.confidence.coverage)} · agreement {pct(d.confidence.agreement)}</div>
          <button className="btn mt-1.5 !text-[12px] whitespace-nowrap" onClick={onReveal}><KeyRound className="size-3.5" /> Break-glass reveal</button>
        </div>
        <ConfidenceRing value={d.confidence.value} />
      </div>
    </section>
  );
}

function RiskTile({ k, v, isTop }) {
  const s = BAND_STYLE[v.band];
  return (
    <div className={`card px-4 py-3 ${isTop ? "ring-2 ring-offset-0 " + s.ring : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-slate-600">{v.label}</span>
        <BandBadge band={v.band} />
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className={`text-2xl font-semibold tabular-nums ${s.text}`}>{pct(v.probability)}</span>
        <span className="text-[11px] muted">next {v.horizon_days} days</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 mt-2 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: pct(v.probability), background: DIM_COLORS[k] }} />
      </div>
    </div>
  );
}

function TrendCard({ d }) {
  const data = d.trend.map((t) => ({ ...t, label: shortDate(t.date) }));
  const cp = d.change_point ? shortDate(d.change_point) : null;
  return (
    <Card title="Risk trajectory vs personal history (180 days)" icon={Activity}
          right={cp && <span className="text-[11px] rounded-md bg-red-50 text-red-700 px-2 py-0.5">Change-point detected {cp}</span>}>
      <div className="h-[230px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="#eef2f7" vertical={false} />
            <ReferenceArea y1={0.6} y2={1} fill="#fee2e2" fillOpacity={0.45} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} interval={29} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
            <YAxis domain={[0, 1]} tickFormatter={(v) => `${v * 100}%`} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v, n) => [pct(v), DIM_SHORT[n]]} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend formatter={(v) => <span className="text-[11px] text-slate-600">{DIM_SHORT[v]}</span>} iconSize={8} wrapperStyle={{ paddingTop: 4 }} />
            {cp && <ReferenceLine x={cp} stroke="#dc2626" strokeDasharray="4 3" />}
            <Area isAnimationActive={false} type="monotone" dataKey="burnout" stroke="none" fill={DIM_COLORS.burnout} fillOpacity={0.06} legendType="none" />
            {Object.keys(DIM_COLORS).map((k) => (
              <Line key={k} isAnimationActive={false} type="monotone" dataKey={k} stroke={DIM_COLORS[k]} dot={false}
                    strokeWidth={k === d.top_dimension ? 2.4 : 1.4} strokeOpacity={k === d.top_dimension ? 1 : 0.7} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

const DOMAIN_LABEL = { operational: "Operational (HRMS)", cognitive: "Cognitive readiness", physiological: "Physiological", self_report: "Self-report" };

function EvidenceCard({ d }) {
  return (
    <Card title="Evidence agreement" icon={Eye}>
      <ul className="space-y-2.5">
        {Object.entries(d.evidence).map(([k, e]) => {
          const stale = e.freshness < 0.35;
          const tone = stale ? "bg-slate-100 text-slate-500" : e.elevated ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700";
          return (
            <li key={k}>
              <div className="flex items-center justify-between text-[12px]">
                <span className="font-medium text-slate-700">{DOMAIN_LABEL[k]}</span>
                <span className={`rounded px-1.5 py-px text-[10.5px] font-medium ${tone}`}>
                  {stale ? "Stale" : e.elevated ? "Elevated" : "Normal"}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-navy-600 rounded-full" style={{ width: pct(e.freshness) }} />
                </div>
                <span className="text-[10.5px] muted w-16 text-right">{e.age_days === 0 ? "today" : `${e.age_days} d ago`}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11.5px] text-slate-600 leading-snug">
        {d.confidence.next_best_evidence
          ? <>Confidence limited by stale evidence. <b>Suggested:</b> {d.confidence.next_best_evidence} (optional for personnel).</>
          : <>All four evidence domains are fresh. Anomaly score {d.anomaly.toFixed(2)}.</>}
      </div>
    </Card>
  );
}

function FactorsCard({ factors, dim }) {
  const max = Math.max(...factors.map((f) => f.impact), 0.01);
  return (
    <Card title={`Top factors · ${DIM_SHORT[dim]}`} icon={Sparkles} right={<span className="text-[10.5px] muted">SHAP</span>}>
      <ul className="space-y-3">
        {factors.map((f) => (
          <li key={f.feature}>
            <div className="flex justify-between text-[12px]">
              <span className="text-slate-700">{f.label}</span>
              <span className="font-semibold tabular-nums text-slate-800">{f.value ?? "n/a"}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 mt-1 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-saffron-500 to-red-600" style={{ width: `${(f.impact / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[10.5px] muted mt-3">Contributors to the estimate, not medical causes.</p>
    </Card>
  );
}

function HelpCard({ items, onPlan }) {
  return (
    <Card title="What would help" icon={Lightbulb} right={<span className="text-[10.5px] muted">Counterfactual AI</span>}>
      {!items.length && <p className="text-[12px] muted">No action needed at current risk.</p>}
      <ul className="space-y-2">
        {items.slice(0, 2).map((h, i) => (
          <li key={i} className="rounded-lg bg-saffron-50 ring-1 ring-saffron-500/20 px-3 py-2">
            <div className="text-[12px] font-medium text-slate-800">{h.actions.join(" + ")}</div>
            <div className="flex items-center gap-1.5 mt-1 text-[11.5px]">
              <BandBadge band={h.from_band} /> <span className="tabular-nums">{pct(h.from)}</span>
              <span className="muted">→</span>
              <BandBadge band={h.to_band} /> <span className="tabular-nums font-semibold">{pct(h.to)}</span>
            </div>
          </li>
        ))}
      </ul>
      <button className="btn btn-saffron w-full justify-center mt-3" onClick={onPlan}><Moon className="size-3.5" /> Plan fair roster (OR-Tools)</button>
    </Card>
  );
}

function ActionsCard({ d, onAct }) {
  const need = d.needs.find((n) => n.status === "open");
  const last = d.actions[0];
  return (
    <Card title="Human decision" icon={ShieldAlert}>
      {need && (
        <div className={`rounded-lg px-3 py-2 mb-2.5 text-[11.5px] ${need.age_days > need.sla_days ? "bg-red-50 ring-1 ring-red-200" : "bg-slate-50"}`}>
          <div className="font-medium text-slate-800 flex items-center gap-1"><CalendarClock className="size-3.5" /> Open welfare need · {need.category.replace("_", " ")}</div>
          <div className="text-slate-600 mt-0.5">{need.description || "Raised by personnel"}</div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <button className="btn btn-primary justify-center" onClick={() => onAct("offer_support", "Confidential support offered")}>Offer support</button>
        <button className="btn justify-center" onClick={() => onAct("counselling_referral", "Counselling referral")}>Counselling</button>
        <button className="btn justify-center whitespace-nowrap" onClick={() => onAct("recovery_window", "Recovery window requested")}>Recovery window</button>
        <button className="btn justify-center" onClick={() => onAct("resolve_need", "Leave request escalated to branch")}>Resolve need</button>
      </div>
      <div className="text-[11px] muted mt-2.5 flex items-center gap-1">
        <AlertOctagon className="size-3.5" />
        {last ? <>Last: {last.rationale} ({timeAgo(last.created_at)})</> : <>No action yet · every decision is audited</>}
      </div>
    </Card>
  );
}

function RosterPanel({ state, onClose }) {
  const r = state.data;
  return (
    <Card title="Fair roster plan (advisory)" icon={Moon} right={<button className="text-[12px] muted" onClick={onClose}>Close</button>}>
      {state.loading && <Loading label="Solving with OR-Tools CP-SAT" />}
      <ErrorBanner error={state.error} />
      {r && r.person && (
        <div className="grid grid-cols-[1fr_280px] gap-4">
          <div>
            {[["Current plan", r.person.plan], ["Optimized", r.person.optimized]].map(([label, row]) => (
              <div key={label} className="flex items-center gap-2 mb-2">
                <span className="w-24 text-[12px] text-slate-600">{label}</span>
                {row.map((n, i) => (
                  <div key={i} className={`flex-1 rounded-md h-9 grid place-items-center text-[10.5px] ${n ? "bg-navy-700 text-white" : "bg-slate-100 text-slate-400"}`}>
                    {n ? <Moon className="size-3.5" /> : shortDate(r.dates[i])}
                  </div>
                ))}
              </div>
            ))}
            <p className="text-[11px] muted">{r.note}</p>
          </div>
          <ul className="text-[12px] space-y-1">
            <li className="flex justify-between"><span className="muted">P-104 nights next 7 days</span><b>{r.person.plan_nights} → {r.person.optimized_nights}</b></li>
            <li className="flex justify-between"><span className="muted">Projected burnout (P-104)</span><b>{pct(r.person.projected_before)} → {pct(r.person.projected_after)}</b></li>
            <li className="flex justify-between"><span className="muted">Rest-rule violations</span><b>{r.summary.plan_rule_violations} → 0</b></li>
            <li className="flex justify-between"><span className="muted">Company high-risk (projected)</span><b>{r.summary.high_risk_before} → {r.summary.high_risk_after}</b></li>
            <li className="flex justify-between"><span className="muted">Coverage, QRT skills, leave</span><b className="text-india-700">All kept</b></li>
          </ul>
        </div>
      )}
    </Card>
  );
}

function RevealDialog({ pid, onClose }) {
  const [form, setForm] = useState({ justification: "", approver: "" });
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const submit = async () => {
    try { setErr(null); setRes(await api(`/v1/welfare/cases/${pid}/reveal`, { ...AS, method: "POST", body: form })); }
    catch (e) { setErr(e); }
  };
  return (
    <div className="fixed inset-0 bg-navy-900/40 grid place-items-center z-50" onClick={onClose}>
      <div className="card p-5 w-[420px]" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-navy-800 flex items-center gap-2"><KeyRound className="size-4" /> Break-glass identity reveal</h3>
        <p className="text-[12px] muted mt-1">Only for urgent welfare need. Requires a named approver, lasts 30 minutes, and {pid} will see this access in My Data Mirror.</p>
        {!res ? (
          <div className="space-y-2 mt-3">
            <textarea className="w-full rounded-lg border border-slate-300 p-2 text-sm" rows={3} placeholder="Justification (min 10 characters)"
                      value={form.justification} onChange={(e) => setForm({ ...form, justification: e.target.value })} />
            <input className="w-full rounded-lg border border-slate-300 p-2 text-sm" placeholder="Approving officer"
                   value={form.approver} onChange={(e) => setForm({ ...form, approver: e.target.value })} />
            <ErrorBanner error={err} />
            <div className="flex justify-end gap-2"><button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={submit}>Reveal and log</button></div>
          </div>
        ) : (
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
            <div><b>{res.display_name}</b></div><div className="muted">Service no. {res.service_no} · valid {res.valid_for_minutes} min</div>
            <button className="btn mt-3" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
