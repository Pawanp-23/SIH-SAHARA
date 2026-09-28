export const pct = (v, d = 0) => (v == null ? "n/a" : `${(v * 100).toFixed(d)}%`);

export const BAND_STYLE = {
  High: { text: "text-red-700", bg: "bg-red-50", ring: "ring-red-200", bar: "#dc2626" },
  Moderate: { text: "text-amber-700", bg: "bg-amber-50", ring: "ring-amber-200", bar: "#d97706" },
  Low: { text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200", bar: "#059669" },
};

export const TIER_STYLE = {
  T0: { label: "Crisis", cls: "bg-red-600 text-white" },
  T1: { label: "High", cls: "bg-red-50 text-red-700 ring-1 ring-red-200" },
  T2: { label: "Moderate", cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  T3: { label: "Evidence", cls: "bg-slate-100 text-slate-600" },
};

export const DIM_COLORS = {
  acute_stress: "#e06c14",
  burnout: "#dc2626",
  emotional_fatigue: "#7c3aed",
  welfare_concern: "#0f766e",
};

export const DIM_SHORT = {
  acute_stress: "Acute stress",
  burnout: "Burnout",
  emotional_fatigue: "Emotional fatigue",
  welfare_concern: "Welfare concern",
};

export const shortDate = (iso) =>
  new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export const timeAgo = (iso) => {
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
  if (h < 48) return `${Math.round(h)} h ago`;
  return `${Math.round(h / 24)} d ago`;
};
