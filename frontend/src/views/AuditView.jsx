import { Ban, Link2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { api, USERS } from "../api/client";
import { Card, ErrorBanner, Loading, Stat, useAsync } from "../components/ui";

const AS = { as: USERS.auditor };

export default function AuditView() {
  const [filter, setFilter] = useState("");
  const events = useAsync(() => api(`/v1/audit?limit=200${filter ? `&outcome=${filter}` : ""}`, AS), [filter]);
  const chain = useAsync(() => api("/v1/audit/verify", AS), []);
  const [probe, setProbe] = useState(null);

  const runProbe = async () => {
    const tries = [
      ["Commander opens individual case", "cmdr.3bn", "welfare"],
      ["Disciplinary system requests welfare data", "discipline.client", "disciplinary"],
      ["Welfare officer with non-welfare purpose", "welfare.3bn", "promotion_review"],
    ];
    const out = [];
    for (const [label, as, purpose] of tries) {
      try { await api("/v1/welfare/cases/P-104", { as, purpose }); out.push({ label, ok: false, msg: "ALLOWED (unexpected)" }); }
      catch (e) { out.push({ label, ok: e.status === 403, msg: `${e.status} ${e.message}` }); }
    }
    setProbe(out);
    events.reload(); chain.reload();
  };

  const rows = events.data || [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Audit chain" value={chain.data ? (chain.data.valid ? "Intact" : "BROKEN") : "…"}
              sub={chain.data && `${chain.data.events_checked} events hash-verified`} tone={chain.data?.valid ? "text-india-700" : "text-red-700"} />
        <Stat label="Events shown" value={rows.length} />
        <Stat label="Denied attempts" value={rows.filter((e) => e.outcome === "denied").length} tone="text-red-700" />
        <Stat label="Identity reveals" value={rows.filter((e) => e.action.includes("reveal")).length} sub="break-glass, approver required" />
      </div>
      <div className="grid grid-cols-[1fr_340px] gap-4 items-start">
        <Card title="Append-only audit log" icon={Link2}
              right={<select className="rounded-lg border border-slate-300 text-[12px] px-2 py-1" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="">All events</option><option value="denied">Denied only</option><option value="allowed">Allowed only</option>
              </select>}>
          {events.loading && !events.data && <Loading />}
          <ErrorBanner error={events.error} onRetry={events.reload} />
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-white"><tr className="text-left text-[11px] muted">
                <th className="py-1.5 font-medium">Time</th><th className="font-medium">Actor</th><th className="font-medium">Action</th>
                <th className="font-medium">Purpose</th><th className="font-medium">Subject</th><th className="font-medium">Result</th><th className="font-medium">Hash</th></tr></thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className={`border-t border-slate-100 ${e.outcome === "denied" ? "bg-red-50/60" : ""}`}>
                    <td className="py-1.5 muted whitespace-nowrap">{new Date(e.ts).toLocaleTimeString("en-IN")}</td>
                    <td><span className="font-medium text-slate-700">{e.actor}</span> <span className="muted">({e.role})</span></td>
                    <td className="text-slate-700">{e.action}</td>
                    <td className="muted">{e.purpose}</td>
                    <td>{e.subject || "–"}</td>
                    <td>{e.outcome === "denied" ? <span className="text-red-700 font-medium">denied</span> : <span className="text-india-700">allowed</span>}</td>
                    <td className="font-mono text-[10.5px] muted">{e.hash}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Purpose-binding probe" icon={Ban}>
            <p className="text-[12.5px] text-slate-600">Welfare data is technically locked to welfare use. Run three misuse attempts against case P-104:</p>
            <button className="btn btn-primary mt-3" onClick={runProbe}>Run misuse attempts</button>
            {probe && (
              <ul className="mt-3 space-y-1.5">
                {probe.map((p) => (
                  <li key={p.label} className={`rounded-lg px-3 py-2 text-[12px] ${p.ok ? "bg-india-50 text-india-700" : "bg-red-50 text-red-800"}`}>
                    <b>{p.label}</b><div className="text-[11.5px]">{p.msg}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Controls in this prototype" icon={ShieldCheck}>
            <ul className="text-[12px] text-slate-600 space-y-1.5 list-disc pl-4">
              <li>Role + unit + purpose-of-use checks on every API call</li>
              <li>SHA-256 hash chain: editing any past row breaks verification</li>
              <li>Pseudonymous IDs; identity vault via break-glass only</li>
              <li>Commander views: differential privacy, groups under 10 suppressed</li>
              <li>Only derived features stored; no raw taps, frames, audio or GPS</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
