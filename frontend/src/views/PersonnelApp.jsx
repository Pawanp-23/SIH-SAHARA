import { Eye, HeartPulse, LifeBuoy, Phone, ShieldCheck, Timer, Zap } from "lucide-react";
import { useRef, useState } from "react";
import { api, USERS } from "../api/client";
import { ErrorBanner, Loading, useAsync } from "../components/ui";
import { pct, shortDate } from "../lib/format";

const AS = { as: USERS.personnel };
const T = {
  en: { hello: "Namaste", checkin: "10-second check-in", energy: "Energy", sleep: "Sleep", workload: "Workload",
        submit: "Submit check-in", test: "Readiness check (optional)", help: "I need help now", mirror: "My Data Mirror",
        trend: "My energy, last 30 days", consent: "My privacy choices" },
  hi: { hello: "नमस्ते", checkin: "10 सेकंड चेक-इन", energy: "ऊर्जा", sleep: "नींद", workload: "कार्यभार",
        submit: "चेक-इन भेजें", test: "तत्परता जाँच (वैकल्पिक)", help: "मुझे अभी मदद चाहिए", mirror: "मेरा डेटा दर्पण",
        trend: "मेरी ऊर्जा, पिछले 30 दिन", consent: "मेरी गोपनीयता पसंद" },
};
const CONSENT_LABEL = { checkin: "Daily check-in", readiness: "Readiness test", camera_ppg: "Camera heart-rate",
                        wearable: "Wearable sleep/HRV", hrms_prediction: "Use duty data for welfare prediction" };

export default function PersonnelApp() {
  const ov = useAsync(() => api("/v1/me/overview", AS), []);
  const log = useAsync(() => api("/v1/me/access-log", AS), []);
  const [lang, setLang] = useState("hi");
  const [msg, setMsg] = useState(null);
  const [crisis, setCrisis] = useState(null);
  const t = T[lang];

  const refresh = () => { ov.reload(); log.reload(); };
  const onCrisis = async () => {
    try { setCrisis(await api("/v1/crisis", { ...AS, method: "POST", body: { trigger: "help_button" } })); }
    catch (e) { setMsg({ error: e }); }
  };

  return (
    <div className="flex gap-6 justify-center items-start">
      <div className="w-[390px] rounded-[2.2rem] bg-navy-900 p-3 shadow-xl">
        <div className="rounded-[1.7rem] bg-slate-50 overflow-hidden h-[780px] flex flex-col">
          <div className="bg-navy-700 text-white px-5 pt-5 pb-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-[12px] text-navy-100">{t.hello},</div>
                <div className="font-semibold">P-104 · {ov.data?.unit}</div>
              </div>
              <button className="text-[11px] rounded-full bg-white/15 px-2.5 py-1" onClick={() => setLang(lang === "en" ? "hi" : "en")}>
                {lang === "en" ? "हिंदी" : "English"}
              </button>
            </div>
            {ov.data && <p className="text-[12.5px] text-navy-100 mt-2 leading-snug">{ov.data.summary}</p>}
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {ov.loading && !ov.data && <Loading />}
            <ErrorBanner error={ov.error} onRetry={ov.reload} />
            {crisis && <CrisisScreen c={crisis} onClose={() => setCrisis(null)} />}
            {ov.data?.evidence_request && (
              <div className="rounded-xl bg-saffron-50 ring-1 ring-saffron-500/30 p-3 text-[12.5px] text-slate-700">
                <b className="text-saffron-600">Optional:</b> {ov.data.evidence_request.message}
              </div>
            )}
            {msg?.text && <div className="rounded-xl bg-india-50 ring-1 ring-india-600/20 p-3 text-[12.5px] text-india-700">{msg.text}</div>}
            <ErrorBanner error={msg?.error} />
            <CheckIn t={t} onDone={(r) => { setMsg({ text: `Check-in saved. ${confText(r)}` }); refresh(); }} onError={(e) => setMsg({ error: e })} />
            <ReadinessTest t={t} onDone={(r) => { setMsg({ text: `Only summary features were sent (${r.stored_fields.join(", ")}). ${confText(r)}` }); refresh(); }}
                           onError={(e) => setMsg({ error: e })} />
            {ov.data && <Trend t={t} rows={ov.data.checkins} />}
            <Mirror t={t} state={log} />
            {ov.data && <Consents t={t} consents={ov.data.consents} onChange={refresh} />}
          </div>
          <div className="p-3 bg-white border-t border-slate-200">
            <button className="w-full rounded-xl bg-red-600 text-white py-2.5 text-[14px] font-semibold flex items-center justify-center gap-2" onClick={onCrisis}>
              <LifeBuoy className="size-4" /> {t.help}
            </button>
          </div>
        </div>
      </div>
      <aside className="w-[300px] card p-4 text-[12.5px] text-slate-600 space-y-2">
        <h3 className="card-title">What this app does</h3>
        <p>Voluntary, low-burden evidence: a 10-second check-in and an optional readiness check when the system is unsure.</p>
        <p>Reaction time and heart rate are computed on the phone. The server receives only summary numbers: no taps, no camera frames, no location, no messages.</p>
        <p>Every access to this person's data by staff appears in <b>My Data Mirror</b>.</p>
        <p>The help button bypasses all scoring and connects to a human counsellor and Tele-MANAS 14416.</p>
      </aside>
    </div>
  );
}

const confText = (r) => (r.confidence_after != null ? `Model confidence ${pct(r.confidence_before)} → ${pct(r.confidence_after)} (demo view).` : "");

function Scale({ label, value, onChange }) {
  return (
    <div>
      <div className="text-[12px] text-slate-600 mb-1">{label}</div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onChange(n)}
                  className={`flex-1 rounded-lg py-1.5 text-[13px] font-semibold border ${value === n ? "bg-navy-700 text-white border-navy-700" : "bg-white border-slate-200 text-slate-600"}`}>{n}</button>
        ))}
      </div>
    </div>
  );
}

function CheckIn({ t, onDone, onError }) {
  const [v, setV] = useState({ energy: 2, sleep_quality: 2, workload_feel: 5 });
  const [weekly, setWeekly] = useState(true);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const body = { ...v, ...(weekly ? { who5_items: [2, 2, 1, 2, 2], burnout_items: [3, 3, 3, 2] } : {}) };
      onDone(await api("/v1/checkins", { ...AS, method: "POST", body }));
    } catch (e) { onError(e); } finally { setBusy(false); }
  };
  return (
    <section className="rounded-xl bg-white ring-1 ring-slate-200 p-3 space-y-2.5">
      <h4 className="text-[13px] font-semibold text-navy-800 flex items-center gap-1.5"><Zap className="size-4" /> {t.checkin}</h4>
      <Scale label={t.energy} value={v.energy} onChange={(n) => setV({ ...v, energy: n })} />
      <Scale label={t.sleep} value={v.sleep_quality} onChange={(n) => setV({ ...v, sleep_quality: n })} />
      <Scale label={t.workload} value={v.workload_feel} onChange={(n) => setV({ ...v, workload_feel: n })} />
      <label className="flex items-center gap-2 text-[11.5px] text-slate-600">
        <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} /> Include weekly WHO-5 + burnout pulse (prefilled for demo)
      </label>
      <button className="btn btn-primary w-full justify-center" disabled={busy} onClick={submit}>{t.submit}</button>
    </section>
  );
}

function ReadinessTest({ t, onDone, onError }) {
  const TRIALS = 8;
  const [phase, setPhase] = useState("idle");       // idle | wait | go | done
  const [results, setResults] = useState({ rts: [], falseStarts: 0 });
  const [hr, setHr] = useState(null);
  const timer = useRef(null);
  const shownAt = useRef(0);

  const next = () => {
    setPhase("wait");
    timer.current = setTimeout(() => { shownAt.current = performance.now(); setPhase("go"); }, 900 + Math.random() * 1800);
  };
  const tap = () => {
    if (phase === "wait") { clearTimeout(timer.current); setResults((r) => ({ ...r, falseStarts: r.falseStarts + 1 })); next(); return; }
    if (phase !== "go") return;
    const rt = performance.now() - shownAt.current;
    const rts = [...results.rts, rt];
    setResults({ ...results, rts });
    if (rts.length >= TRIALS) setPhase("done"); else next();
  };
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const submit = async () => {
    try {
      const body = { rt_median_ms: Math.round(median(results.rts)), lapses: results.rts.filter((x) => x > 500).length,
                     false_starts: results.falseStarts, trials: results.rts.length,
                     ...(hr ? { hr_bpm: hr.hr, hrv_ms: hr.hrv, signal_quality: 0.9 } : {}) };
      onDone(await api("/v1/readiness/summary", { ...AS, method: "POST", body }));
      setPhase("idle"); setResults({ rts: [], falseStarts: 0 }); setHr(null);
    } catch (e) { onError(e); }
  };

  return (
    <section className="rounded-xl bg-white ring-1 ring-slate-200 p-3 space-y-2">
      <h4 className="text-[13px] font-semibold text-navy-800 flex items-center gap-1.5"><Timer className="size-4" /> {t.test}</h4>
      {phase === "idle" && (
        <>
          <p className="text-[12px] text-slate-600">Tap the circle as soon as it turns green. {TRIALS} taps, about a minute.</p>
          <button className="btn w-full justify-center" onClick={next}>Start reaction test</button>
        </>
      )}
      {(phase === "wait" || phase === "go") && (
        <button onClick={tap} className={`w-full h-32 rounded-xl grid place-items-center text-white font-semibold transition ${phase === "go" ? "bg-india-600" : "bg-slate-400"}`}>
          {phase === "go" ? "TAP!" : `Wait… (${results.rts.length}/${TRIALS})`}
        </button>
      )}
      {phase === "done" && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <Metric label="Median" value={`${Math.round(median(results.rts))} ms`} />
            <Metric label="Lapses" value={results.rts.filter((x) => x > 500).length} />
            <Metric label="False starts" value={results.falseStarts} />
          </div>
          <button className="btn w-full justify-center" onClick={() => setHr({ hr: 82, hrv: 29 })} disabled={!!hr}>
            <HeartPulse className="size-4 text-red-600" /> {hr ? `Heart rate ${hr.hr} bpm · HRV ${hr.hrv} ms` : "Add camera heart-rate (simulated in web demo)"}
          </button>
          <button className="btn btn-primary w-full justify-center" onClick={submit}>Send summary only</button>
        </div>
      )}
    </section>
  );
}

const Metric = ({ label, value }) => (
  <div className="rounded-lg bg-slate-50 py-1.5"><div className="text-[10.5px] muted">{label}</div><div className="text-[13px] font-semibold">{value}</div></div>
);

function Trend({ t, rows }) {
  return (
    <section className="rounded-xl bg-white ring-1 ring-slate-200 p-3">
      <h4 className="text-[13px] font-semibold text-navy-800 mb-2">{t.trend}</h4>
      <div className="flex items-end gap-[3px] h-16">
        {rows.map((r) => (
          <div key={r.date} title={`${shortDate(r.date)}: ${r.energy ?? "no check-in"}`}
               className={`flex-1 rounded-sm ${r.energy == null ? "bg-slate-100 h-1" : r.energy <= 2 ? "bg-saffron-500" : "bg-navy-600"}`}
               style={r.energy != null ? { height: `${r.energy * 20}%` } : undefined} />
        ))}
      </div>
    </section>
  );
}

function Mirror({ t, state }) {
  return (
    <section className="rounded-xl bg-white ring-1 ring-slate-200 p-3">
      <h4 className="text-[13px] font-semibold text-navy-800 flex items-center gap-1.5 mb-2"><Eye className="size-4" /> {t.mirror}</h4>
      <ErrorBanner error={state.error} />
      {state.data?.length === 0 && <p className="text-[12px] muted">No one has accessed your data yet.</p>}
      <ul className="space-y-1.5 max-h-40 overflow-auto">
        {state.data?.slice(0, 8).map((e, i) => (
          <li key={i} className="text-[11.5px] flex justify-between gap-2">
            <span className={e.outcome === "denied" ? "text-red-700" : "text-slate-700"}>
              {e.actor_role.replace("_", " ")} · {e.action.replace(/_/g, " ")} {e.outcome === "denied" && "(blocked)"}
            </span>
            <span className="muted shrink-0">{new Date(e.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Consents({ t, consents, onChange }) {
  const toggle = async (modality, granted) => {
    try { await api("/v1/consents", { ...AS, method: "POST", body: { modality, granted } }); onChange(); }
    catch (e) { console.error(e); }
  };
  return (
    <section className="rounded-xl bg-white ring-1 ring-slate-200 p-3">
      <h4 className="text-[13px] font-semibold text-navy-800 flex items-center gap-1.5 mb-2"><ShieldCheck className="size-4" /> {t.consent}</h4>
      {Object.entries(CONSENT_LABEL).map(([k, label]) => (
        <label key={k} className="flex items-center justify-between py-1 text-[12px] text-slate-700">
          {label}
          <input type="checkbox" checked={!!consents[k]} onChange={(e) => toggle(k, e.target.checked)} />
        </label>
      ))}
    </section>
  );
}

function CrisisScreen({ c, onClose }) {
  return (
    <div className="rounded-xl bg-red-50 ring-1 ring-red-200 p-4 space-y-2">
      <div className="font-semibold text-red-800">You are not alone.</div>
      <p className="text-[12.5px] text-red-900">{c.message}</p>
      {c.helplines.map((h) => (
        <a key={h.phone} href={`tel:${h.phone}`} className="flex items-center gap-2 rounded-lg bg-white ring-1 ring-red-200 px-3 py-2 text-[13px]">
          <Phone className="size-4 text-red-600" /> <span className="flex-1">{h.name}</span> <b>{h.phone}</b>
        </a>
      ))}
      <button className="btn w-full justify-center" onClick={onClose}>Close</button>
    </div>
  );
}
