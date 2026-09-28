import { FlaskConical, Scale, Timer } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, USERS } from "../api/client";
import { Card, ErrorBanner, Loading, useAsync } from "../components/ui";
import { pct } from "../lib/format";

export default function MetricsView() {
  const m = useAsync(() => api("/v1/metrics", { as: USERS.welfare }), []);
  if (m.loading && !m.data) return <Loading label="Loading model metrics" />;
  if (m.error) return <ErrorBanner error={m.error} onRetry={m.reload} />;
  const d = m.data;
  const dims = Object.entries(d.dimensions);
  const chart = dims.map(([, v]) => ({ name: v.label, "SAHARA (all evidence)": v.pr_auc, "HRMS data only": v.baseline_hrms_only_pr_auc }));

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-4 py-2 text-[12.5px] text-amber-900">
        <b>Simulation only.</b> {d.data}. Held-out test set of {d.n_persons.test} personnel never seen in training. These numbers
        show the pipeline works; real accuracy needs a governed pilot with force data.
      </div>
      <div className="grid grid-cols-[1.2fr_1fr] gap-4">
        <Card title="Per-dimension model quality (held-out personnel)" icon={FlaskConical}>
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-left text-[11px] muted">
              <th className="py-1.5 font-medium">Dimension</th><th className="font-medium">Horizon</th><th className="font-medium">AUROC</th>
              <th className="font-medium">PR-AUC</th><th className="font-medium">Calibration error</th><th className="font-medium">Precision @High</th><th className="font-medium">Rule AUROC</th></tr></thead>
            <tbody>
              {dims.map(([k, v]) => (
                <tr key={k} className="border-t border-slate-100">
                  <td className="py-2 font-medium text-slate-800">{v.label}</td><td>{v.horizon_days} d</td>
                  <td className="tabular-nums font-semibold">{v.auroc.toFixed(2)}</td><td className="tabular-nums">{v.pr_auc.toFixed(2)}</td>
                  <td className="tabular-nums">{v.ece.toFixed(3)}</td><td className="tabular-nums">{pct(v.precision_at_high)}</td>
                  <td className="tabular-nums muted">{v.baseline_rule_auroc.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] muted mt-2">Rule = night duties + duty hours threshold. Probabilities are isotonic-calibrated.</p>
        </Card>
        <Card title="Value of voluntary evidence (PR-AUC)" icon={Scale}>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} />
                <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v) => v.toFixed(2)} />
                <Legend iconSize={8} formatter={(v) => <span className="text-[11px] text-slate-600">{v}</span>} />
                <Bar isAnimationActive={false} dataKey="SAHARA (all evidence)" fill="#1f3a5f" radius={[4, 4, 0, 0]} />
                <Bar isAnimationActive={false} dataKey="HRMS data only" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <div className="grid grid-cols-[1fr_1.2fr] gap-4">
        <Card title="Early warning (burnout onsets, equal alert budget)" icon={Timer}>
          <ul className="text-[12.5px] space-y-1.5">
            <li className="flex justify-between"><span className="muted">Burnout onsets in test set</span><b>{d.lead_time.onsets}</b></li>
            <li className="flex justify-between"><span className="muted">Detected by SAHARA (Moderate+)</span><b>{d.lead_time.model_detected} · median {d.lead_time.model_median_lead_days} days early</b></li>
            <li className="flex justify-between"><span className="muted">Detected by duty-load rule (same alert rate)</span><b>{d.lead_time.rule_detected} · median {d.lead_time.rule_median_lead_days} days early</b></li>
          </ul>
          <p className="text-[11px] muted mt-2">Honest comparison: at the same alert budget both warn early; SAHARA's gain is precision (fewer false alarms) and four separate dimensions.</p>
        </Card>
        <Card title="Fairness audit · burnout alerts by duty type" icon={Scale}>
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-left text-[11px] muted"><th className="py-1 font-medium">Cohort</th><th className="font-medium">Rows</th><th className="font-medium">Recall</th><th className="font-medium">False-alert rate</th></tr></thead>
            <tbody>
              {Object.entries(d.fairness.duty_type || {}).map(([k, v]) => (
                <tr key={k} className="border-t border-slate-100"><td className="py-1.5">{k}</td><td className="muted">{v.n}</td>
                  <td className="tabular-nums">{pct(v.recall)}</td><td className="tabular-nums">{pct(v.false_alert_rate, 1)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] muted mt-2">Cohorts are used for auditing only, never as model inputs.</p>
        </Card>
      </div>
    </div>
  );
}
