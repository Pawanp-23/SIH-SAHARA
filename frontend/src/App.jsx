import { BarChart3, FlaskConical, HeartHandshake, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import AuditView from "./views/AuditView";
import CommanderView from "./views/CommanderView";
import MetricsView from "./views/MetricsView";
import PersonnelApp from "./views/PersonnelApp";
import WelfareConsole from "./views/WelfareConsole";

const VIEWS = [
  { id: "welfare", label: "Welfare Console", role: "Welfare Officer · 3 Bn", icon: HeartHandshake, el: WelfareConsole },
  { id: "commander", label: "Command Readiness", role: "Commandant · 3 Bn", icon: BarChart3, el: CommanderView },
  { id: "personnel", label: "Personnel App", role: "Personnel P-104", icon: Smartphone, el: PersonnelApp },
  { id: "audit", label: "Audit & Privacy", role: "Auditor", icon: ShieldCheck, el: AuditView },
  { id: "metrics", label: "Model Metrics", role: "Welfare Officer · 3 Bn", icon: FlaskConical, el: MetricsView },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-5 pt-5 pb-6">
      <div className="grid grid-cols-2 gap-0.5 size-8 rounded-lg overflow-hidden">
        <span className="bg-saffron-500" /><span className="bg-white/90" />
        <span className="bg-white/90" /><span className="bg-india-600" />
      </div>
      <div>
        <div className="text-white font-bold tracking-wide leading-none">SAHARA</div>
        <div className="text-[10.5px] text-navy-100/70 mt-1 leading-none">सहारा · Welfare Intelligence</div>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState(() => location.hash.slice(1) || "welfare");
  useEffect(() => {
    const onHash = () => setView(location.hash.slice(1) || "welfare");
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  const current = VIEWS.find((v) => v.id === view) || VIEWS[0];
  const View = current.el;

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 bg-navy-900 flex flex-col">
        <Logo />
        <nav className="flex-1 px-3 space-y-0.5">
          {VIEWS.map((v) => (
            <a key={v.id} href={`#${v.id}`}
               className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition ${
                 v.id === current.id ? "bg-white/10 text-white" : "text-navy-100/70 hover:bg-white/5 hover:text-white"}`}>
              <v.icon className="size-4" /> {v.label}
            </a>
          ))}
        </nav>
        <div className="m-3 rounded-lg bg-white/5 p-3 text-[11px] text-navy-100/70 leading-relaxed">
          <div className="text-white/90 font-medium mb-1">SIH26186 · Prototype</div>
          All personnel data is synthetic. Outputs are non-diagnostic and always reviewed by a human.
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 shrink-0 bg-white border-b border-slate-200 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-semibold text-navy-800">{current.label}</h1>
            <span className="text-[11px] rounded-full bg-india-50 text-india-700 px-2 py-0.5 font-medium ring-1 ring-india-600/20">
              On-premises · Privacy Gateway active
            </span>
          </div>
          <div className="flex items-center gap-3 text-[12px] text-slate-500">
            <span>25 Sep 2026</span>
            <span className="h-5 w-px bg-slate-200" />
            <span className="flex items-center gap-2">
              <span className="size-7 rounded-full bg-navy-700 text-white grid place-items-center text-[11px] font-semibold">
                {current.role.split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </span>
              <span className="text-slate-700 font-medium">{current.role}</span>
            </span>
          </div>
        </header>
        <main className="flex-1 p-5 overflow-auto">
          <View />
        </main>
      </div>
    </div>
  );
}
