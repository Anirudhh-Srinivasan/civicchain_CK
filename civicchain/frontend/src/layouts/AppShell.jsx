import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Building2, Clock3, HardHat, Landmark, LogOut, ShieldCheck } from "lucide-react";
import { clearSession, getSession, roles } from "../services/auth";

const portals = [
  { to: "/citizen", label: "Citizen", icon: Building2 },
  { to: "/contractor", label: "Contractor", icon: HardHat },
  { to: "/government", label: "Government", icon: Landmark },
];

export default function AppShell() {
  const navigate = useNavigate();
  const session = getSession();
  const visiblePortals = session ? portals.filter((portal) => portal.to === `/${session.role}`) : portals;
  const roleLabel = session ? roles[session.role].label : "";
  const expiresAt = session
    ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(session.expiresAt))
    : "";
  const logout = () => {
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-cyan text-navy">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-black tracking-wide">CivicChain</p>
              <p className="text-xs text-slate-400">Civic grievance escrow console</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            {session && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-lg border border-cyan/30 bg-cyan/10 px-3 py-2 font-black text-cyan">{roleLabel}</span>
                <span className="max-w-[18rem] truncate rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 font-bold text-slate-200">
                  {session.id}
                </span>
                <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-slate-400">
                  <Clock3 className="h-4 w-4" />
                  Expires {expiresAt}
                </span>
              </div>
            )}
            <nav className="flex gap-2 overflow-x-auto">
              {visiblePortals.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${
                      isActive ? "bg-cyan text-navy" : "bg-white/5 text-slate-300 hover:bg-white/10"
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              ))}
              {session && (
                <button className="inline-flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/10" onClick={logout}>
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              )}
            </nav>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
