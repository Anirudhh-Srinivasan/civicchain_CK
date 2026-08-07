import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { getSession, roles, sessionDisplayName } from "../services/auth";

const copy = {
  citizen: "Your submissions are tagged to this citizen ID and can be tracked from My Complaints.",
  contractor: "Bids and proof uploads are recorded against this contractor ID for the current session.",
  government: "Oversight views are scoped to inspection and audit workflows for this officer session.",
};

export default function SessionBanner({ role }) {
  const [session, setSession] = useState(getSession);
  useEffect(() => {
    const refreshSession = () => setSession(getSession());
    window.addEventListener("civicchain:session-updated", refreshSession);
    return () => window.removeEventListener("civicchain:session-updated", refreshSession);
  }, []);
  if (!session) return null;
  const label = roles[role]?.label || role;

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-cyan/15 text-cyan">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-cyan">{label} Workspace</p>
          <p className="mt-1 text-sm text-slate-300">{copy[role]}</p>
        </div>
      </div>
      <div className="rounded-lg border border-white/10 bg-navy/50 px-3 py-2 text-sm">
        <p className="text-xs text-slate-500">Active ID</p>
        <p title={session.id} className="max-w-[18rem] truncate font-black text-white">{sessionDisplayName(session)}</p>
      </div>
    </div>
  );
}
