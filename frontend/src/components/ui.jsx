import { AlertTriangle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BAND_STYLE } from "../lib/format";

// Loads data with loading/error state; `reload` re-runs the loader.
export function useAsync(loader, deps) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      setState({ loading: false, error: null, data: await loader() });
    } catch (e) {
      console.error(e);
      setState({ loading: false, error: e, data: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

export function Loading({ label = "Loading" }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500 p-6">
      <Loader2 className="size-4 animate-spin" /> {label}…
    </div>
  );
}

export function ErrorBanner({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <AlertTriangle className="size-4 mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="font-medium">{error.status === 403 ? "Access denied" : "Something went wrong"}</div>
        <div>{error.message}</div>
        {error.requestId && <div className="text-xs text-red-600 mt-0.5">Request ID {error.requestId}</div>}
      </div>
      {onRetry && <button className="btn" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function BandBadge({ band, className = "" }) {
  const s = BAND_STYLE[band] || BAND_STYLE.Low;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${s.bg} ${s.text} ${s.ring} ${className}`}>
      {band}
    </span>
  );
}

export function Card({ title, icon: Icon, right, children, className = "" }) {
  return (
    <section className={`card p-4 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="card-title flex items-center gap-1.5">
            {Icon && <Icon className="size-4 text-navy-600" />} {title}
          </h3>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone = "text-slate-900" }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[12px] text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold tracking-tight ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
