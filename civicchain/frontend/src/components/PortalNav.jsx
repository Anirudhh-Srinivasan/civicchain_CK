import { NavLink } from "react-router-dom";

export default function PortalNav({ links }) {
  return (
    <div className="mb-6 flex gap-2 overflow-x-auto">
      {links.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            `inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold transition ${
              isActive
                ? "border-cyan bg-cyan/15 text-cyan"
                : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25"
            }`
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </div>
  );
}
