import { CloudSun, Lock, Moon, Users } from "lucide-react";
import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, USERS } from "../api/client";
import { Card, ErrorBanner, Loading, Stat, useAsync } from "../components/ui";
import { DIM_SHORT, pct, shortDate } from "../lib/format";

const AS = { as: USERS.commander };
const BN = "3 Bn";
const LINE_COLORS = ["#1f3a5f", "#e06c14", "#2e8b3e", "#7c3aed", "#0f766e"];

function heat(v) {
  if (v == null) return "bg-slate-100 text-slate-400";
  if (v >= 0.3) return "bg-red-100 text-red-800";
  if (v >= 0.15) return "bg-amber-100 text-amber-800";
  return "bg-emerald-50 text-emerald-800";
}

export default function CommanderView() {
  const ov = useAsync(() => api(`/v1/commander/units/${encodeURIComponent(BN)}/overview`, AS), []);
  const fc = useAsync(() => api(`/v1/commander/units/${encodeURIComponent(BN)}/forecast`, AS), []);
  const [denied, setDenied] = useState(null);

  const tryIndividual = async () => {
    try { await api("/v1/welfare/cases/P-104", { ...AS, purpose: "welfare" }); setDenied("Unexpectedly allowed"); }
    catch (e) { setDenied(e.message); }
  };

  if (ov.loading && !ov.data) return <Loading label="Loading unit readiness" />;
  if (ov.error) return <ErrorBanner error={ov.error} onRetry={ov.reload} />;
  const o = ov.data;
  const visible = o.units.filter((u) => !u.suppressed);
  const worst = visible[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Battalion strength" value={o.strength} sub={`${o.units.length} sub-units`} />
        <Stat label="Hotspot (burnout, high share)" value={worst ? pct(worst.high_share.burnout) : "n/a"} sub={worst?.company} tone="text-red-700" />
        <Stat label="Leave overdue (75+ days)" value={pct(Math.max(...visible.map((u) => u.leave_overdue_share || 0)))} sub="worst sub-unit" tone="text-amber-700" />
        <Stat label="Forecast alerts" value={o.hotspots.length} sub="sub-units projected over 20% high risk" tone="text-navy-700" />
      </div>

      <div className="grid grid-cols-[1.15fr_1fr] gap-4">
        <Card title="Sub-unit readiness (differentially private)" icon={Users}
              right={<span className="text-[11px] muted flex items-center gap-1"><Lock className="size-3" /> ε = 1.0 · min group {o.min_group_size}</span>}>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] muted">
                <th className="py-1.5 font-medium">Sub-unit</th><th className="font-medium">n</th>
                {Object.keys(DIM_SHORT).map((k) => <th key={k} className="font-medium">{DIM_SHORT[k]}</th>)}
                <th className="font-medium">Nights/7d</th><th className="font-medium">Duty h</th>
              </tr>
            </thead>
            <tbody>
              {o.units.map((u) => (
                <tr key={u.company} className="border-t border-slate-100">
                  <td className="py-2 font-medium text-slate-800">{u.company}</td>
                  <td className="muted">{u.n}</td>
                  {u.suppressed ? (
                    <td colSpan={6} className="text-[11.5px] text-slate-500 italic">Suppressed: group smaller than {o.min_group_size} (protects individuals)</td>
                  ) : (
                    <>
                      {Object.keys(DIM_SHORT).map((k) => (
                        <td key={k}><span className={`rounded px-1.5 py-0.5 text-[11.5px] font-medium tabular-nums ${heat(u.high_share[k])}`}>{pct(u.high_share[k])}</span></td>
                      ))}
                      <td className="tabular-nums">{u.avg_night_7}</td>
                      <td className="tabular-nums">{u.avg_duty_hours}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] muted mt-3">{o.privacy} Values show the share of personnel at High risk; no names or individual scores.</p>
        </Card>

        <Card title="Welfare weather forecast · next 14 days" icon={CloudSun}
              right={<span className="text-[11px] muted">Share projected High burnout</span>}>
          {fc.loading && !fc.data && <Loading />}
          <ErrorBanner error={fc.error} onRetry={fc.reload} />
          {fc.data && <ForecastChart series={fc.data.series} />}
          {o.hotspots.map((h) => (
            <div key={h.unit} className="mt-2 rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-1.5 text-[12px] text-amber-900">{h.reason}</div>
          ))}
        </Card>
      </div>

      <div className="grid grid-cols-[1.15fr_1fr] gap-4">
        <RosterCard units={visible.map((u) => u.company)} />
        <Card title="Privacy guard test" icon={Lock}>
          <p className="text-[12.5px] text-slate-600">Commanders see only aggregates. Try opening an individual welfare case with this commander account:</p>
          <button className="btn mt-3" onClick={tryIndividual}>Open case P-104 as commander</button>
          {denied && <div className="mt-3 rounded-lg bg-red-50 ring-1 ring-red-200 px-3 py-2 text-[12px] text-red-800"><b>403 Forbidden.</b> {denied}</div>}
        </Card>
      </div>
    </div>
  );
}

function ForecastChart({ series }) {
  const companies = Object.keys(series).filter((c) => series[c].points[0]?.burnout != null);
  const days = series[companies[0]]?.points.map((p) => p.date) || [];
  const data = days.map((d, i) => Object.fromEntries([["label", shortDate(d)], ...companies.map((c) => [c, series[c].points[i].burnout])]));
  return (
    <div className="h-[230px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="#eef2f7" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} interval={2} />
          <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(v) => pct(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Legend iconSize={8} formatter={(v) => <span className="text-[11px] text-slate-600">{v}</span>} />
          {companies.map((c, i) => <Line key={c} isAnimationActive={false} dataKey={c} stroke={LINE_COLORS[i % LINE_COLORS.length]} dot={false} strokeWidth={2} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function RosterCard({ units }) {
  const [company, setCompany] = useState("3 Bn C");
  const [state, setState] = useState(null);
  const run = async () => {
    setState({ loading: true });
    try { setState({ data: await api("/v1/roster/scenarios", { ...AS, method: "POST", body: { company } }) }); }
    catch (e) { setState({ error: e }); }
  };
  const s = state?.data?.summary;
  return (
    <Card title="Workload balancing · roster what-if" icon={Moon}
          right={<div className="flex gap-2">
            <select className="rounded-lg border border-slate-300 text-[12px] px-2" value={company} onChange={(e) => setCompany(e.target.value)}>
              {units.map((u) => <option key={u}>{u}</option>)}
            </select>
            <button className="btn btn-primary" onClick={run}>Optimize next 7 nights</button>
          </div>}>
      {!state && <p className="text-[12.5px] muted">Redistributes night duties to cut projected burnout while keeping coverage, QRT skills, leave and rest rules (max 3 nights / 7 days, max 2 in a row).</p>}
      {state?.loading && <Loading label="Solving with OR-Tools CP-SAT" />}
      <ErrorBanner error={state?.error} />
      {s && (
        <div className="grid grid-cols-4 gap-2 text-center">
          {[["Rule violations", s.plan_rule_violations, s.optimized_rule_violations],
            ["Max nights / person", s.plan_max_nights, s.optimized_max_nights],
            ["Projected high-risk", s.high_risk_before, s.high_risk_after],
            ["Avg projected burnout", pct(s.avg_projected_burnout_before), pct(s.avg_projected_burnout_after)]].map(([l, a, b]) => (
            <div key={l} className="rounded-lg bg-slate-50 py-2">
              <div className="text-[11px] muted">{l}</div>
              <div className="text-[15px] font-semibold text-slate-800 tabular-nums">{a} <span className="muted">→</span> <span className="text-india-700">{b}</span></div>
            </div>
          ))}
          <div className="col-span-4 text-[11px] muted text-left">{s.changes} duty swaps proposed · {state.data.note}</div>
        </div>
      )}
    </Card>
  );
}
