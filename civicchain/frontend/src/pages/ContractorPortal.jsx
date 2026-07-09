import { useMemo, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { BriefcaseBusiness, CheckCircle2, LayoutDashboard, Upload } from "lucide-react";
import ComplaintCard from "../components/ComplaintCard";
import PortalNav from "../components/PortalNav";
import SessionBanner from "../components/SessionBanner";
import { Card, EmptyState, ErrorState, Field, LoadingState, inputClass } from "../components/ui";
import { placeBid, submitProof } from "../services/api";
import { getSession } from "../services/auth";
import { useComplaints } from "./CitizenPortal";

const links = [
  { to: "/contractor", label: "Dashboard", icon: LayoutDashboard },
  { to: "/contractor/bids", label: "Active Bids", icon: BriefcaseBusiness },
  { to: "/contractor/proof", label: "Upload Proof", icon: Upload },
];

export default function ContractorPortal() {
  return (
    <div className="page-enter">
      <SessionBanner role="contractor" />
      <div className="mb-6 flex justify-end">
        <WalletMultiButton />
      </div>
      <PortalNav links={links} />
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="bids" element={<ActiveBids />} />
        <Route path="proof" element={<ProofUpload />} />
      </Routes>
    </div>
  );
}

function Dashboard() {
  const { data, loading, error, refresh } = useComplaints();
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState("");
  const open = data.filter((item) => item.status === "Open");
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!open.length) return <EmptyState title="No open work orders" text="New citizen complaints will appear here for bidding." />;
  return (
    <>
      {notice && <div className="mb-4 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm font-bold text-success">{notice}</div>}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {open.map((item) => (
          <ComplaintCard
            key={item.id}
            complaint={item}
            detailBase="/citizen/complaints"
            action={
              <button className="rounded-lg bg-cyan px-4 py-2 text-sm font-black text-navy" onClick={() => setSelected(item)}>
                Place Bid
              </button>
            }
          />
        ))}
      </div>
      {selected && (
        <BidModal
          complaint={selected}
          onClose={() => setSelected(null)}
          onSaved={async (bid) => {
            setNotice(`Bid submitted for ${bid.title}.`);
            setSelected(null);
            await refresh();
          }}
        />
      )}
    </>
  );
}

function BidModal({ complaint, onClose, onSaved }) {
  const { publicKey } = useWallet();
  const session = getSession();
  const [amount, setAmount] = useState(complaint.estimated_fund.toFixed(2));
  const [state, setState] = useState({ loading: false, error: "" });
  const submit = async () => {
    setState({ loading: true, error: "" });
    try {
      const bid = await placeBid(complaint.id, {
        amount: Number(amount),
        contractor_pubkey: publicKey?.toBase58() || session?.id || "DemoContractorWallet",
      });
      setState({ loading: false, error: "" });
      onSaved(bid);
    } catch (error) {
      setState({ loading: false, error: error.message });
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <Card className="w-full max-w-md p-6">
        <h2 className="text-xl font-black">Place Bid</h2>
        <p className="mt-2 text-sm text-slate-400">{complaint.title}</p>
        <Field label="Bid amount in SOL">
          <input className={inputClass} min="0.01" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {state.error && <p className="mt-3 text-sm text-danger">{state.error}</p>}
        <div className="mt-5 flex gap-3">
          <button className="rounded-lg bg-cyan px-4 py-2 font-black text-navy disabled:opacity-60" disabled={state.loading} onClick={submit}>
            {state.loading ? "Submitting..." : "Submit Bid"}
          </button>
          <button className="rounded-lg border border-white/10 px-4 py-2 font-bold text-white" onClick={onClose}>
            Cancel
          </button>
        </div>
      </Card>
    </div>
  );
}

function ActiveBids() {
  const { data, loading, error } = useComplaints();
  const bids = data.filter((item) => ["Assigned", "Completed", "Verified"].includes(item.status));
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!bids.length) return <EmptyState title="No active bids" text="Bids placed from the dashboard are tracked here during the demo." />;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {bids.map((bid) => (
        <Card key={`${bid.id}-${bid.bid_amount}`} className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase text-cyan">{bid.category}</p>
              <h2 className="text-xl font-black">{bid.title}</h2>
              <p className="mt-2 text-sm text-slate-400">{bid.location}</p>
            </div>
            <p className="text-2xl font-black text-success">{bid.bid_amount.toFixed(2)} SOL</p>
          </div>
          <Tracker current={trackerStep(bid.status, bid.payment_released)} />
        </Card>
      ))}
    </div>
  );
}

function ProofUpload() {
  const { data, loading, error, refresh } = useComplaints();
  const jobs = useMemo(() => data.filter((item) => ["Assigned", "Completed"].includes(item.status)), [data]);
  const [selectedId, setSelectedId] = useState("");
  const [files, setFiles] = useState({ before: null, after: null });
  const [proofText, setProofText] = useState("");
  const [state, setState] = useState({ loading: false, error: "", saved: "", verdict: null });
  const accepted = jobs.find((job) => String(job.id) === String(selectedId)) || jobs[0];
  const currentId = selectedId || accepted?.id || "";
  const saveProof = async () => {
    if (!currentId) return;
    setState({ loading: true, error: "", saved: "", verdict: null });
    try {
      const result = await submitProof(currentId, {
        complaint_text: accepted?.description,
        before_image: files.before,
        after_image: files.after,
        proof_text: proofText,
        complaint_pubkey: accepted?.complaint_pubkey,
        contractor_pubkey: accepted?.contractor_pubkey,
      });
      setFiles({ before: null, after: null });
      setProofText("");
      setState({
        loading: false,
        error: "",
        saved: `${result.verification.approved ? "AI approved" : "AI held for review"} proof for ${result.complaint?.title || accepted?.title}.`,
        verdict: result.verification,
      });
      await refresh();
    } catch (error) {
      setState({ loading: false, error: error.message, saved: "", verdict: null });
    }
  };
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  return (
    <Card className="mx-auto max-w-3xl p-6">
      <h2 className="text-2xl font-black">Upload Work Proof</h2>
      <p className="mt-2 text-sm text-slate-400">{accepted ? accepted.title : "Select an accepted job before uploading proof."}</p>
      {jobs.length > 0 && (
        <Field label="Accepted job">
          <select className={inputClass} value={currentId} onChange={(event) => setSelectedId(event.target.value)}>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>{job.title}</option>
            ))}
          </select>
        </Field>
      )}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Before photo">
          <input className={inputClass} type="file" accept="image/png,image/jpeg" onChange={(event) => setFiles({ ...files, before: event.target.files?.[0] || null })} />
        </Field>
        <Field label="After photo">
          <input className={inputClass} type="file" accept="image/png,image/jpeg" onChange={(event) => setFiles({ ...files, after: event.target.files?.[0] || null })} />
        </Field>
      </div>
      <Field label="Proof note">
        <textarea
          className={inputClass}
          rows="4"
          placeholder="Describe the completed repair or resolution."
          value={proofText}
          onChange={(event) => setProofText(event.target.value)}
        />
      </Field>
      {state.error && <p className="mt-4 text-sm text-danger">{state.error}</p>}
      {state.saved && <p className="mt-4 text-sm text-success">{state.saved}</p>}
      {state.verdict && (
        <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          <p className="font-black text-white">Verdict: {state.verdict.verdict}</p>
          <p>Confidence: {Math.round((state.verdict.confidence || 0) * 100)}%</p>
          {state.verdict.ai_source && <p>Source: {state.verdict.ai_source}</p>}
          {state.verdict.ai_result?.reasoning && <p className="mt-2">{state.verdict.ai_result.reasoning}</p>}
        </div>
      )}
      <button className="mt-6 rounded-lg bg-success px-5 py-3 font-black text-navy disabled:opacity-60" disabled={!accepted || state.loading || !files.before || !files.after} onClick={saveProof}>
        {state.loading ? "Verifying..." : "Submit Proof"}
      </button>
      <Tracker current={accepted ? trackerStep(accepted.status, accepted.payment_released) : 1} />
    </Card>
  );
}

function trackerStep(status, paymentReleased = false) {
  if (paymentReleased) return 5;
  return { Open: 1, Assigned: 2, Completed: 3, Verified: 4 }[status] ?? 1;
}

function Tracker({ current }) {
  const steps = ["Bid Placed", "Accepted", "Work Done", "AI Verified", "Payment Released"];
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-5">
      {steps.map((step, index) => (
        <div key={step} className={`rounded-lg border p-3 text-sm ${index < current ? "border-success/40 bg-success/10 text-success" : "border-white/10 text-slate-500"}`}>
          <CheckCircle2 className="mb-2 h-4 w-4" />
          {step}
        </div>
      ))}
    </div>
  );
}
