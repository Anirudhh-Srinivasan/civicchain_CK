import { NavLink, Outlet } from "react-router-dom";
import { Building2, HardHat, Landmark, ShieldCheck } from "lucide-react";

const portals = [
  { to: "/citizen", label: "Citizen", icon: Building2 },
  { to: "/contractor", label: "Contractor", icon: HardHat },
  { to: "/government", label: "Government", icon: Landmark },
];

export default function AppShell() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-cyan text-navy">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-black tracking-wide">CivicChain</p>
              <p className="text-xs text-slate-400">Solana civic grievance escrow</p>
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto">
            {portals.map(({ to, label, icon: Icon }) => (
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
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
