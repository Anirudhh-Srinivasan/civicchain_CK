import { useState } from "react";
import { Card, Field, inputClass } from "./ui";
import { saveUsername } from "../services/api";

export default function UsernameSetup({ walletAddress, role, onComplete, title = "Choose your username" }) {
  const [username, setUsername] = useState("");
  const [state, setState] = useState({ loading: false, error: "" });

  const submit = async (event) => {
    event.preventDefault();
    setState({ loading: true, error: "" });
    try {
      const profile = await saveUsername(walletAddress, username, role);
      setState({ loading: false, error: "" });
      onComplete(profile);
    } catch (error) {
      setState({ loading: false, error: error.message });
    }
  };

  return (
    <Card className="p-6">
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan">First-time setup</p>
          <h2 className="mt-2 text-2xl font-black">{title}</h2>
          <p className="mt-2 text-sm text-slate-400">
            This is your public display name. Your wallet remains the identity used for authorization and on-chain records.
          </p>
        </div>
        <Field label="Username">
          <input
            autoFocus
            className={inputClass}
            minLength="3"
            maxLength="24"
            pattern="[A-Za-z0-9_-]+"
            placeholder="roadworks_team"
            required
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setState((current) => ({ ...current, error: "" }));
            }}
          />
        </Field>
        <p className="text-xs text-slate-500">3–24 characters; letters, numbers, underscores, and hyphens only.</p>
        <p className="break-all text-xs text-slate-500">Wallet: {walletAddress}</p>
        {state.error && <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm font-bold text-danger">{state.error}</p>}
        <button className="w-full rounded-lg bg-cyan px-5 py-3 font-black text-navy disabled:opacity-60" disabled={state.loading}>
          {state.loading ? "Checking..." : "Save username"}
        </button>
      </form>
    </Card>
  );
}
