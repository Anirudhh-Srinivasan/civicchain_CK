import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  Activity,
  Building2,
  CheckCircle2,
  Clock3,
  HardHat,
  Landmark,
  LockKeyhole,
  LogIn,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  generateCitizenId,
  getLoginAudit,
  getSavedCitizenId,
  roles,
  saveCitizenId,
  saveSession,
  validateLogin,
} from "../services/auth";
import { Card, Field, inputClass } from "../components/ui";


const roleIcons = {
  citizen: Building2,
  contractor: HardHat,
  government: Landmark,
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { publicKey, connected } = useWallet();
  const [role, setRole] = useState("citizen");
  const [id, setId] = useState(() => getSavedCitizenId() || "");
  const [error, setError] = useState("");
  const selected = roles[role];
  const audit = getLoginAudit();

  const demoModeEnabled = import.meta.env.VITE_ENABLE_DEMO_SEED === "true";

  useEffect(() => {
    if (role === "citizen") return; // citizens use a generated ID, not a wallet
    if (!demoModeEnabled && connected && publicKey) {
      setId(publicKey.toBase58());
      setError("");
    } else if (!demoModeEnabled && !connected) {
      setId("");
    }
  }, [connected, publicKey, demoModeEnabled, role]);

  const handleGenerateCitizenId = () => {
    const newId = generateCitizenId();
    saveCitizenId(newId);
    setId(newId);
    setError("");
  };

  const examples = useMemo(
    () => Object.entries(roles).map(([key, item]) => ({ key, ...item, icon: roleIcons[key] })),
    [],
  );

  const submit = (event) => {
    event.preventDefault();
    const loginId = role === "citizen" || demoModeEnabled
      ? id
      : (publicKey ? publicKey.toBase58() : "");
    const validation = validateLogin(role, loginId);
    if (validation) {
      setError(validation);
      return;
    }
    try {
      const session = saveSession(role, loginId);
      navigate(roles[session.role].path, { replace: true });
    } catch (error) {
      setError(error.message);
    }
  };


  return (
    <main className="min-h-screen bg-[linear-gradient(145deg,#07111f_0%,#0b1426_48%,#111827_100%)] px-4 py-6">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl gap-6 lg:grid-cols-[0.88fr_1.12fr]">
        <section className="flex flex-col justify-between gap-8 rounded-lg border border-white/10 bg-white/[0.035] p-6 lg:p-8">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-cyan text-navy">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xl font-black tracking-wide">CivicChain</p>
              <p className="text-sm text-slate-400">Role based civic grievance access</p>
            </div>
          </div>

          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm font-bold text-success">
              <Activity className="h-4 w-4" />
              Devnet services online
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight text-white md:text-6xl">
              Civic operations console
            </h1>
            <p className="mt-5 text-lg text-slate-300">
              Sign in with a role-scoped ID to open the complaint, contractor, or oversight workspace with matching permissions.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <SecurityMetric icon={LockKeyhole} label="Access mode" value="Role locked" />
            <SecurityMetric icon={Clock3} label="Session" value="8 hours" />
            <SecurityMetric icon={CheckCircle2} label="Audit" value="Local trail" />
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1fr_0.72fr]">
          <Card className="p-6 lg:p-7">
            <form className="space-y-6" onSubmit={submit}>
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan">Authentication</p>
                <h2 className="mt-2 text-3xl font-black">Login</h2>
                <p className="mt-2 text-sm text-slate-400">Select the exact role you need for this session.</p>
              </div>

              <div className="grid gap-3">
                {examples.map(({ key, label, icon: Icon, description, capabilities }) => (
                  <button
                    key={key}
                    type="button"
                    className={`rounded-lg border p-4 text-left transition ${
                      role === key
                        ? "border-cyan bg-cyan/15 text-cyan"
                        : "border-white/10 bg-navy/50 text-slate-300 hover:border-white/25"
                    }`}
                    onClick={() => {
                      setRole(key);
                      setError("");
                    }}
                  >
                    <span className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/10">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-black">{label}</span>
                        <span className="mt-1 block text-sm text-slate-400">{description}</span>
                        <span className="mt-3 flex flex-wrap gap-2">
                          {capabilities.map((item) => (
                            <span key={item} className="rounded-md border border-white/10 px-2 py-1 text-xs font-bold text-slate-300">
                              {item}
                            </span>
                          ))}
                        </span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              {role === "citizen" ? (
                <div className="space-y-4">
                  <Field label="Citizen ID">
                    <input
                      className={inputClass}
                      value={id}
                      placeholder="CTZ-AB12CD"
                      autoComplete="off"
                      onChange={(event) => {
                        setId(event.target.value.toUpperCase());
                        setError("");
                      }}
                    />
                  </Field>

                  <button
                    type="button"
                    onClick={handleGenerateCitizenId}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-navy/50 px-4 py-3 text-sm font-bold text-slate-200 transition hover:border-cyan/40 hover:text-cyan"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Generate a new Citizen ID
                  </button>

                  <div className="rounded-lg border border-white/10 bg-navy/50 p-4 text-sm text-slate-300">
                    <p className="font-bold text-white">No wallet needed</p>
                    <p className="mt-1">
                      New here? Click "Generate a new Citizen ID" — save it somewhere safe. Use the same
                      ID next time to see your past complaints and file new ones.
                    </p>
                  </div>
                </div>
              ) : demoModeEnabled ? (
                <>
                  <Field label={selected.idLabel}>
                    <input
                      className={inputClass}
                      value={id}
                      placeholder={selected.placeholder}
                      autoComplete="username"
                      onChange={(event) => {
                        setId(event.target.value);
                        setError("");
                      }}
                    />
                  </Field>

                  <div className="rounded-lg border border-white/10 bg-navy/50 p-4 text-sm text-slate-300">
                    <p className="font-bold text-white">ID policy</p>
                    <p className="mt-1">{selected.hint}</p>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-white/10 bg-navy/50 p-4 text-sm text-slate-300">
                    <p className="font-bold text-white">Wallet Connection Required</p>
                    <p className="mt-1">Connect your Solana wallet to log in to this workspace.</p>
                  </div>
                  <div className="flex justify-center">
                    <WalletMultiButton />
                  </div>
                  {connected && publicKey && (
                    <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-center text-sm font-bold text-success truncate">
                      Connected: {publicKey.toBase58()}
                    </div>
                  )}
                </div>
              )}


              {error && <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-bold text-danger">{error}</p>}

              <button className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan px-5 py-3 font-black text-navy transition hover:brightness-110">
                <LogIn className="h-4 w-4" />
                Enter {selected.label} Portal
              </button>
            </form>
          </Card>

          <aside className="space-y-6">
            <Card className="p-5">
              <h2 className="text-lg font-black">Session Controls</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <PolicyRow label="Role isolation" value="Enabled" />
                <PolicyRow label="Expiry window" value="8 hours" />
                <PolicyRow
                  label="Wallet optional"
                  value={role === "citizen" ? "Not required" : demoModeEnabled ? "Fallback ID active" : "Required"}
                />
                <PolicyRow label="Backend guard" value={demoModeEnabled ? "Demo mode" : "Production"} />
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="text-lg font-black">Recent Access</h2>
              <div className="mt-4 space-y-3">
                {audit.length ? (
                  audit.map((item) => (
                    <div key={`${item.role}-${item.id}-${item.at}`} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-sm font-black capitalize text-white">{item.role}</p>
                      <p className="truncate text-xs text-slate-400">{item.id}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">No recent local sign-ins on this browser.</p>
                )}
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}

function SecurityMetric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-navy/50 p-4">
      <Icon className="h-4 w-4 text-cyan" />
      <p className="mt-3 text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}

function PolicyRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3 last:border-b-0 last:pb-0">
      <span>{label}</span>
      <span className="font-black text-cyan">{value}</span>
    </div>
  );
}
