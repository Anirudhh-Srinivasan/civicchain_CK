import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  Activity,
  BadgeCheck,
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
  calculateContractorCredibility,
  contractorCredibilityThreshold,
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

const emptyContractorProfile = {
  businessName: "",
  registrationNumber: "",
  yearsExperience: "0",
  completedProjects: "0",
  insured: false,
  declarationAccepted: false,
};

const departments = [
  "Municipal Administration",
  "Public Works",
  "Water and Sewerage",
  "Urban Development",
  "Audit and Oversight",
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { publicKey, connected } = useWallet();
  const [role, setRole] = useState("citizen");
  const [id, setId] = useState(() => getSavedCitizenId() || "");
  const [department, setDepartment] = useState("");
  const [contractorProfile, setContractorProfile] = useState(emptyContractorProfile);
  const [error, setError] = useState("");
  const selected = roles[role];
  const audit = getLoginAudit();

  useEffect(() => {
    if (role !== "contractor") return;
    setId(connected && publicKey ? publicKey.toBase58() : "");
    setError("");
  }, [connected, publicKey, role]);

  const credibilityScore = useMemo(
    () => calculateContractorCredibility(contractorProfile, publicKey?.toBase58() || ""),
    [contractorProfile, publicKey],
  );

  const examples = useMemo(
    () => Object.entries(roles).map(([key, item]) => ({ key, ...item, icon: roleIcons[key] })),
    [],
  );

  const handleGenerateCitizenId = () => {
    const newId = generateCitizenId();
    saveCitizenId(newId);
    setId(newId);
    setError("");
  };

  const chooseRole = (nextRole) => {
    setRole(nextRole);
    if (nextRole === "citizen") setId(getSavedCitizenId() || "");
    if (nextRole === "contractor") setId(publicKey?.toBase58() || "");
    if (nextRole === "government") setId("");
    setError("");
  };

  const submit = (event) => {
    event.preventDefault();
    const loginId = role === "contractor" ? (publicKey?.toBase58() || "") : id;
    const options = { department, contractorProfile };
    const validation = validateLogin(role, loginId, options);
    if (validation) {
      setError(validation);
      return;
    }
    try {
      const session = saveSession(role, loginId, options);
      navigate(roles[session.role].path, { replace: true });
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(145deg,#07111f_0%,#0b1426_48%,#111827_100%)] px-4 py-5 lg:py-6">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-[1180px] content-center items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_18rem]">
        <section className="flex flex-col justify-between gap-7 overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] p-5 sm:p-6 lg:min-h-[640px] lg:p-7">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-cyan text-navy">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-black tracking-wide">CivicChain</p>
              <p className="text-sm text-slate-400">Role based civic grievance access</p>
            </div>
          </div>

          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm font-bold text-success">
              <Activity className="h-4 w-4" />
              Devnet services online
            </div>
            <h1 className="mt-5 break-words text-3xl font-black leading-[1.15] text-white sm:text-4xl md:text-5xl">
              Civic operations console
            </h1>
            <p className="mt-5 text-base text-slate-300 sm:text-lg">
              Open the citizen, contractor, or government workspace with identity checks matched to each role.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <SecurityMetric icon={LockKeyhole} label="Access mode" value="Role locked" />
            <SecurityMetric icon={Clock3} label="Session" value="8 hours" />
            <SecurityMetric icon={CheckCircle2} label="Audit" value="Local trail" />
          </div>
        </section>

        <Card className="p-4 lg:p-5">
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan">Authentication</p>
              <h2 className="mt-2 text-3xl font-black">Login</h2>
              <p className="mt-2 text-sm text-slate-400">Choose the workspace for this session.</p>
            </div>

            <div className="grid auto-rows-fr gap-2">
              {examples.map(({ key, label, icon: Icon, description, capabilities }) => (
                <button
                  key={key}
                  type="button"
                  className={`min-h-[96px] rounded-lg border p-3 text-left transition ${
                    role === key
                      ? "border-cyan bg-cyan/15 text-cyan"
                      : "border-white/10 bg-navy/50 text-slate-300 hover:border-white/25"
                  }`}
                  onClick={() => chooseRole(key)}
                >
                  <span className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-black">{label}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-slate-400">{description}</span>
                      <span className="mt-2 flex flex-wrap gap-2">
                        {capabilities.map((item) => (
                          <span key={item} className="rounded-md border border-white/10 px-2 py-1 text-[11px] font-bold text-slate-300">
                            {item}
                          </span>
                        ))}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {role === "citizen" && (
              <CitizenLogin id={id} setId={setId} onGenerate={handleGenerateCitizenId} clearError={() => setError("")} />
            )}

            {role === "contractor" && (
              <ContractorLogin
                connected={connected}
                publicKey={publicKey}
                profile={contractorProfile}
                setProfile={setContractorProfile}
                score={credibilityScore}
              />
            )}

            {role === "government" && (
              <GovernmentLogin
                id={id}
                setId={setId}
                department={department}
                setDepartment={setDepartment}
                clearError={() => setError("")}
              />
            )}

            {error && <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-bold text-danger">{error}</p>}

            <button className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan px-5 py-3 font-black text-navy transition hover:brightness-110">
              <LogIn className="h-4 w-4" />
              Enter {selected.label} Portal
            </button>
          </form>
        </Card>

        <aside className="space-y-5 lg:col-start-2 xl:col-start-auto">
          <Card className="p-5">
            <h2 className="text-lg font-black">Session Controls</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <PolicyRow label="Role isolation" value="Enabled" />
              <PolicyRow label="Expiry window" value="8 hours" />
              <PolicyRow label="Identity" value={identityLabel(role)} />
              <PolicyRow label="Backend guard" value="Demo mode" />
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
    </main>
  );
}

function CitizenLogin({ id, setId, onGenerate, clearError }) {
  return (
    <div className="space-y-3">
      <Field label="Citizen ID">
        <div className="flex gap-2">
          <input
            className={inputClass}
            value={id}
            placeholder="CTZ-AB12CD"
            autoComplete="off"
            onChange={(event) => {
              setId(event.target.value.toUpperCase());
              clearError();
            }}
          />
          <button
            type="button"
            title="Generate Citizen ID"
            onClick={onGenerate}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-navy/50 px-3 text-sm font-bold text-slate-200 transition hover:border-cyan/40 hover:text-cyan"
          >
            <RefreshCw className="h-4 w-4" />
            Generate
          </button>
        </div>
      </Field>
      <div className="rounded-lg border border-white/10 bg-navy/50 p-3 text-sm text-slate-300">
        <p className="font-bold text-white">No wallet needed</p>
        <p className="mt-1">Your generated ID reconnects you to submitted complaints.</p>
      </div>
    </div>
  );
}

function ContractorLogin({ connected, publicKey, profile, setProfile, score }) {
  const update = (key, value) => setProfile((current) => ({ ...current, [key]: value }));
  const passed = score >= contractorCredibilityThreshold;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-navy/50 p-3">
        <div>
          <p className="text-sm font-bold text-white">Contractor wallet</p>
          <p className="mt-1 max-w-[16rem] truncate text-xs text-slate-400">{publicKey?.toBase58() || "Not connected"}</p>
        </div>
        <WalletMultiButton />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Registered name">
          <input className={inputClass} value={profile.businessName} onChange={(event) => update("businessName", event.target.value)} />
        </Field>
        <Field label="Registration / licence no.">
          <input className={inputClass} value={profile.registrationNumber} onChange={(event) => update("registrationNumber", event.target.value.toUpperCase())} />
        </Field>
        <Field label="Years of experience">
          <input className={inputClass} min="0" max="50" type="number" value={profile.yearsExperience} onChange={(event) => update("yearsExperience", event.target.value)} />
        </Field>
        <Field label="Completed public projects">
          <input className={inputClass} min="0" max="999" type="number" value={profile.completedProjects} onChange={(event) => update("completedProjects", event.target.value)} />
        </Field>
      </div>
      <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
        <input className="mt-1 h-4 w-4 accent-cyan" type="checkbox" checked={profile.insured} onChange={(event) => update("insured", event.target.checked)} />
        Active liability insurance
      </label>
      <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
        <input className="mt-1 h-4 w-4 accent-cyan" type="checkbox" checked={profile.declarationAccepted} onChange={(event) => update("declarationAccepted", event.target.checked)} />
        I confirm that the registration and project history are accurate.
      </label>
      <div className={`rounded-lg border p-4 ${passed ? "border-success/30 bg-success/10" : "border-white/10 bg-navy/50"}`}>
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2 text-sm font-black text-white"><BadgeCheck className="h-4 w-4 text-cyan" /> Credibility score</span>
          <span className={`text-xl font-black ${passed ? "text-success" : "text-cyan"}`}>{score}/100</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full transition-all ${passed ? "bg-success" : "bg-cyan"}`} style={{ width: `${score}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-400">Pre-screening threshold: {contractorCredibilityThreshold}. {connected ? "Wallet identity confirmed." : "Connect a wallet to add identity points."}</p>
      </div>
    </div>
  );
}

function GovernmentLogin({ id, setId, department, setDepartment, clearError }) {
  return (
    <div className="space-y-3">
      <Field label="Government Officer ID">
        <input
          className={inputClass}
          value={id}
          placeholder="GOV-CHENNAI-01"
          autoComplete="username"
          onChange={(event) => {
            setId(event.target.value.toUpperCase());
            clearError();
          }}
        />
      </Field>
      <Field label="Department">
        <select
          className={inputClass}
          value={department}
          onChange={(event) => {
            setDepartment(event.target.value);
            clearError();
          }}
        >
          <option value="">Select department</option>
          {departments.map((item) => <option key={item}>{item}</option>)}
        </select>
      </Field>
      <div className="rounded-lg border border-cyan/25 bg-cyan/10 p-3 text-sm text-slate-300">
        <p className="font-bold text-white">Official credential access</p>
        <p className="mt-1">Government oversight uses an officer ID and department, separate from the service wallet used for payouts.</p>
      </div>
    </div>
  );
}

function identityLabel(role) {
  if (role === "contractor") return "Wallet + screening";
  if (role === "government") return "Officer credential";
  return "Citizen ID";
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
      <span className="text-right font-black text-cyan">{value}</span>
    </div>
  );
}
