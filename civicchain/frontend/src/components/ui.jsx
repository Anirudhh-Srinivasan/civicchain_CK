import { AlertCircle, Loader2 } from "lucide-react";

export function Card({ children, className = "" }) {
  return (
    <div className={`rounded-lg border border-white/10 bg-white/[0.055] shadow-glow ${className}`}>
      {children}
    </div>
  );
}

export function StatusBadge({ status }) {
  const styles = {
    Open: "border-cyan/40 bg-cyan/10 text-cyan",
    Assigned: "border-amber-300/40 bg-amber-300/10 text-amber-200",
    Completed: "border-blue-300/40 bg-blue-300/10 text-blue-200",
    Verified: "border-success/40 bg-success/10 text-success",
    Disputed: "border-danger/50 bg-danger/15 text-danger",
    Failed: "border-danger/40 bg-danger/10 text-danger",
  };
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${styles[status] || styles.Open}`}>
      {status}
    </span>
  );
}

export function LoadingState({ label = "Loading data" }) {
  return (
    <Card className="flex items-center gap-3 p-6 text-slate-300">
      <Loader2 className="h-5 w-5 animate-spin text-cyan" />
      {label}
    </Card>
  );
}

export function ErrorState({ message }) {
  return (
    <Card className="flex items-center gap-3 border-danger/30 p-6 text-danger">
      <AlertCircle className="h-5 w-5" />
      {message || "Something went wrong."}
    </Card>
  );
}

export function EmptyState({ title, text }) {
  return (
    <Card className="p-8 text-center">
      <p className="text-lg font-bold text-white">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{text}</p>
    </Card>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-300">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-white/10 bg-navy/80 px-3 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan focus:ring-2 focus:ring-cyan/15";
