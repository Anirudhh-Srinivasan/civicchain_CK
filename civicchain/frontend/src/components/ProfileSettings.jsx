import { useEffect, useState } from "react";
import { Card, Field, inputClass } from "./ui";
import { getSession, updateSessionProfile } from "../services/auth";
import { getUserProfile, saveUsername } from "../services/api";
import { Reputation } from "./ContractorRating";

export default function ProfileSettings({ role }) {
  const initial = getSession();
  const [session, setSession] = useState(initial);
  const [username, setUsername] = useState(initial?.username || "");
  const [state, setState] = useState({ loading: false, error: "", saved: "" });
  const [profile, setProfile] = useState(null);
  const [yearsExperience, setYearsExperience] = useState("0");
  const [pastProjectReferences, setPastProjectReferences] = useState("");

  useEffect(() => {
    if (initial?.id) getUserProfile(initial.id).then((loaded) => {
      setProfile(loaded);
      setYearsExperience(String(loaded?.years_experience || 0));
      setPastProjectReferences(loaded?.past_project_references || "");
    }).catch(() => {});
  }, [initial?.id]);

  const submit = async (event) => {
    event.preventDefault();
    setState({ loading: true, error: "", saved: "" });
    try {
      const profile = await saveUsername(session.id, username, role, {
        years_experience: Number(yearsExperience),
        past_project_references: pastProjectReferences,
      });
      setProfile(profile);
      setSession(updateSessionProfile(profile));
      setUsername(profile.username);
      setState({ loading: false, error: "", saved: "Username updated." });
    } catch (error) {
      setState({ loading: false, error: error.message, saved: "" });
    }
  };

  return (
    <Card className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-black">Profile & Settings</h1>
      <p className="mt-2 text-sm text-slate-400">Change your public name without changing your wallet identity.</p>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <Field label="Username">
          <input className={inputClass} minLength="3" maxLength="24" pattern="[A-Za-z0-9_-]+" required value={username} onChange={(event) => setUsername(event.target.value)} />
        </Field>
        <Field label="Wallet address">
          <input className={`${inputClass} text-slate-400`} readOnly value={session?.id || ""} />
        </Field>
        {role === "contractor" && (
          <>
            <Field label="Years of experience">
              <input className={inputClass} type="number" min="0" max="80" required value={yearsExperience} onChange={(event) => setYearsExperience(event.target.value)} />
            </Field>
            <Field label="Past project references">
              <textarea className={inputClass} rows="5" maxLength="4000" placeholder="One project name, description, or link per line" value={pastProjectReferences} onChange={(event) => setPastProjectReferences(event.target.value)} />
            </Field>
          </>
        )}
        {role === "contractor" && (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
            <p className="font-bold text-white">Contractor reputation</p>
            <p className="mt-2"><Reputation identity={profile} /></p>
            <p className="mt-2 font-bold text-cyan">Credibility score: {profile?.credibility_score?.toFixed?.(1) || "0.0"}/100</p>
          </div>
        )}
        {state.error && <p className="text-sm font-bold text-danger">{state.error}</p>}
        {state.saved && <p className="text-sm font-bold text-success">{state.saved}</p>}
        <button className="rounded-lg bg-cyan px-5 py-3 font-black text-navy disabled:opacity-60" disabled={state.loading}>
          {state.loading ? "Saving..." : "Update username"}
        </button>
      </form>
    </Card>
  );
}
