import { useMemo, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { BriefcaseBusiness, CheckCircle2, LayoutDashboard, Upload } from "lucide-react";
import ComplaintCard from "../components/ComplaintCard";
import PortalNav from "../components/PortalNav";
import { Card, EmptyState, ErrorState, Field, LoadingState, inputClass } from "../components/ui";
import { useComplaints } from "./CitizenPortal";

const links = [
  { to: "/contractor", label: "Dashboard", icon: LayoutDashboard },
  { to: "/contractor/bids", label: "Active Bids", icon: BriefcaseBusiness },
  { to: "/contractor/proof", label: "Upload Proof", icon: Upload },
];

export default function ContractorPortal() {
  const [bids, setBids] = useState([]);
  return (
    <div className="page-enter">
      <div className="mb-6 flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan">Contractor Portal</p>
          <h1 className="text-2xl font-black">Bid, execute, verify, get paid</h1>
        </div>
        <WalletMultiButton />
      </div>
      <PortalNav links={links} />
      <Routes>
        <Route index element={<Dashboard onBid={(bid) => setBids((items) => [bid, ...items])} />} />
        <Route path="bids" element={<ActiveBids bids={bids} />} />
        <Route path="proof" element={<ProofUpload bids={bids} />} />
      </Routes>
    </div>
  );
}

function Dashboard({ onBid }) {
  const { data, loading, error } = useComplaints();
  const [selected, setSelected] = useState(null);
  const open = data.filter((item) => item.status === "Open");
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!open.length) return <EmptyState title="No open work orders" text="New citizen complaints will appear here for bidding." />;
  return (
    <>
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
      {selected && <BidModal complaint={selected} onClose={() => setSelected(null)} onBid={onBid} />}
    </>
  );
}

function BidModal({ complaint, onClose, onBid }) {
  const [amount, setAmount] = useState(complaint.estimated_fund.toFixed(2));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <Card className="w-full max-w-md p-6">
        <h2 className="text-xl font-black">Place Bid</h2>
        <p className="mt-2 text-sm text-slate-400">{complaint.title}</p>
        <Field label="Bid amount in SOL">
          <input className={inputClass} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="mt-5 flex gap-3">
          <button className="rounded-lg bg-cyan px-4 py-2 font-black text-navy" onClick={() => { onBid({ ...complaint, bid_amount: Number(amount), status: "Assigned" }); onClose(); }}>
            Submit Bid
          </button>
          <button className="rounded-lg border border-white/10 px-4 py-2 font-bold text-white" onClick={onClose}>
            Cancel
          </button>
        </div>
      </Card>
    </div>
  );
}

function ActiveBids({ bids }) {
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
          <Tracker current={2} />
        </Card>
      ))}
    </div>
  );
}

function ProofUpload({ bids }) {
  const accepted = useMemo(() => bids[0], [bids]);
  return (
    <Card className="mx-auto max-w-3xl p-6">
      <h2 className="text-2xl font-black">Upload Work Proof</h2>
      <p className="mt-2 text-sm text-slate-400">{accepted ? accepted.title : "Select an accepted job before uploading proof."}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Before photo">
          <input className={inputClass} type="file" accept="image/*" />
        </Field>
        <Field label="After photo">
          <input className={inputClass} type="file" accept="image/*" />
        </Field>
      </div>
      <button className="mt-6 rounded-lg bg-success px-5 py-3 font-black text-navy">Submit Proof</button>
      <Tracker current={accepted ? 3 : 1} />
    </Card>
  );
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
