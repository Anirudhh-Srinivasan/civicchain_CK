import { useEffect, useMemo, useState } from "react";
import { Route, Routes, useParams } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { BriefcaseBusiness, CheckCircle2, Clock3, LayoutDashboard, Upload } from "lucide-react";
import ComplaintCard from "../components/ComplaintCard";
import PortalNav from "../components/PortalNav";
import SessionBanner from "../components/SessionBanner";
import { Card, EmptyState, ErrorState, Field, LoadingState, inputClass } from "../components/ui";
import { placeBid, submitProof } from "../services/api";
import { getSession } from "../services/auth";
import { DetailView, useComplaint, useComplaints } from "./CitizenPortal";

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
        <Route path="complaints/:id" element={<ContractorDetail />} />
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
            detailBase="/contractor/complaints"
            action={
              <div className="flex flex-wrap items-center justify-end gap-3">
                <BidCountdown deadline={item.bid_deadline} />
                <button className="rounded-lg bg-cyan px-4 py-2 text-sm font-black text-navy disabled:opacity-50" disabled={item.bidding_closed} onClick={() => setSelected(item)}>
                  {item.bidding_closed ? "Closed" : "Place Bid"}
                </button>
              </div>
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

function ContractorDetail() {
  const { id } = useParams();
  const { complaint, loading, error } = useComplaint(id);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  return <DetailView complaint={complaint} back="/contractor" />;
}

function BidModal({ complaint, onClose, onSaved }) {
  const { publicKey } = useWallet();
  const session = getSession();
  const suggested = complaint.lowest_bid?.amount || complaint.estimated_fund || 0.25;
  const [amount, setAmount] = useState(Math.max(0.01, suggested - 0.01).toFixed(2));
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
        <div className="mt-4 grid gap-3 rounded-lg border border-white/10 bg-navy/60 p-4 text-sm text-slate-300">
          <span className="inline-flex items-center gap-2">
            <BriefcaseBusiness className="h-4 w-4 text-cyan" />
            {complaint.bid_count || 0} contractor bid{complaint.bid_count === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            Current lowest: {complaint.lowest_bid ? `${complaint.lowest_bid.amount.toFixed(2)} SOL` : "none"}
          </span>
          <span className="inline-flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-cyan" />
            {complaint.bid_deadline ? `Deadline: ${formatDateTime(complaint.bid_deadline)}` : "No deadline set"}
          </span>
        </div>
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
  const { publicKey } = useWallet();
  const session = getSession();
  const myId = publicKey?.toBase58() || session?.id || null;
  const { data, loading, error } = useComplaints();
  const bids = data.filter((item) => {
    if (!myId) return false;
    const placedByMe = (item.bids || []).some((bid) => bid.contractor_pubkey === myId);
    const wonByMe = item.contractor_pubkey === myId;
    return placedByMe || wonByMe;
  });
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!bids.length) return <EmptyState title="No active bids" text="Bids you place from the dashboard will be tracked here." />;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {bids.map((bid) => {
        const myBid = (bid.bids || []).find((b) => b.contractor_pubkey === myId);
        const displayAmount = bid.contractor_pubkey === myId
          ? (bid.bid_amount || bid.lowest_bid?.amount || myBid?.amount || 0)
          : (myBid?.amount || 0);
        return (
          <Card key={`${bid.id}-${displayAmount}`} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase text-cyan">{bid.category}</p>
                <h2 className="text-xl font-black">{bid.title}</h2>
                <p className="mt-2 text-sm text-slate-400">{bid.location}</p>
              </div>
              <p className="text-2xl font-black text-success">{displayAmount.toFixed(2)} SOL</p>
            </div>
            <p className="mt-3 text-sm text-slate-400">
              {bid.status === "Open"
                ? "Your bid is in. Lowest bid is assigned automatically when time expires."
                : bid.contractor_pubkey === myId
                  ? "Awarded to you."
                  : "Awarded to another contractor."}
            </p>
            <Tracker current={trackerStep(bid.status, bid.payment_released)} />
          </Card>
        );
      })}
    </div>
  );
}

function formatDateTime(value) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function BidCountdown({ deadline }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!deadline) return <span className="text-xs font-bold text-slate-400">No time limit</span>;
  const remaining = Math.max(0, new Date(deadline).getTime() - now);
  if (remaining === 0) return <span className="text-xs font-black text-danger">Bidding closed</span>;
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return (
    <span className="inline-flex items-center gap-1 text-xs font-black text-cyan">
      <Clock3 className="h-3.5 w-3.5" />
      {minutes}:{String(seconds).padStart(2, "0")} left
    </span>
  );
}

function ProofUpload() {
  const { publicKey } = useWallet();
  const session = getSession();
  const myId = publicKey?.toBase58() || session?.id || null;
  const { data, loading, error, refresh } = useComplaints();
  const jobs = useMemo(
    () => data.filter((item) => ["Assigned", "Completed"].includes(item.status) && item.contractor_pubkey === myId),
    [data, myId]
  );
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
  if (!jobs.length) {
    return (
      <EmptyState
        title="No accepted jobs yet"
        text="Once one of your bids is accepted, it will appear here for proof upload."
      />
    );
  }
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
  if (paymentReleased) return 4;
  return { Open: 1, Assigned: 2, Completed: 2, Verified: 3 }[status] ?? 1;
}

function Tracker({ current }) {
  const steps = ["Bid Placed", "Accepted", "AI Verified", "Payment Released"];
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-4">
      {steps.map((step, index) => (
        <div key={step} className={`rounded-lg border p-3 text-sm ${index < current ? "border-success/40 bg-success/10 text-success" : "border-white/10 text-slate-500"}`}>
          <CheckCircle2 className="mb-2 h-4 w-4" />
          {step}
        </div>
      ))}
    </div>
  );
}
