import { useMemo, useState } from "react";
import { Link, Route, Routes, useParams } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AlertTriangle, BarChart3, Clock3, Coins, FileSearch, Map, Settings, Table2 } from "lucide-react";
import ComplaintMap from "../components/ComplaintMap";
import PortalNav from "../components/PortalNav";
import SessionBanner from "../components/SessionBanner";
import ProfileSettings from "../components/ProfileSettings";
import UserIdentity from "../components/UserIdentity";
import { Reputation } from "../components/ContractorRating";
import { Card, EmptyState, ErrorState, LoadingState, StatusBadge, inputClass } from "../components/ui";
import { DetailView, useComplaint, useComplaints } from "./CitizenPortal";
import { getSession } from "../services/auth";
import { releasePayment, resolveDispute } from "../services/api";

const links = [
  { to: "/government", label: "Overview", icon: BarChart3 },
  { to: "/government/table", label: "Complaints", icon: Table2 },
  { to: "/government/map", label: "Map", icon: Map },
  { to: "/government/funds", label: "Funds", icon: Coins },
  { to: "/government/profile", label: "Profile", icon: Settings },
];

export default function GovernmentPortal() {
  return (
    <div className="page-enter">
      <SessionBanner role="government" />
      <div className="mb-6 flex justify-end">
        <WalletMultiButton />
      </div>
      <PortalNav links={links} />
      <Routes>
        <Route index element={<Overview />} />
        <Route path="table" element={<ComplaintsTable />} />
        <Route path="map" element={<GovMap />} />
        <Route path="funds" element={<Funds />} />
        <Route path="profile" element={<ProfileSettings role="government" />} />
        <Route path="complaints/:id" element={<GovDetail />} />
      </Routes>
    </div>
  );
}

function Overview() {
  const { data, loading, error } = useComplaints();
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  const resolved = data.filter((item) => item.status === "Verified").length;
  const pending = data.filter((item) => item.status !== "Verified").length;
  const disputed = data.filter((item) => item.status === "Disputed").length;
  const bidCount = data.reduce((sum, item) => sum + (item.bid_count || 0), 0);
  return (
    <div className="space-y-6">
      {disputed > 0 && (
        <Card className="flex items-center gap-3 border-danger/40 bg-danger/10 p-5 text-danger">
          <AlertTriangle className="h-6 w-6" />
          <span className="font-black">{disputed} disputed job{disputed === 1 ? "" : "s"} require review</span>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total complaints" value={data.length} />
        <Stat label="Resolved this month" value={resolved} tone="success" />
        <Stat label="Pending" value={pending} tone="cyan" />
        <Stat label="Contractor bids" value={bidCount} tone="cyan" />
      </div>
      <ComplaintsTable compact />
    </div>
  );
}

function Stat({ label, value, tone = "white" }) {
  const color = tone === "success" ? "text-success" : tone === "cyan" ? "text-cyan" : "text-white";
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-black ${color}`}>{value}</p>
    </Card>
  );
}

function ComplaintsTable({ compact = false }) {
  const { data, loading, error } = useComplaints();
  const [filters, setFilters] = useState({ status: "", category: "", location: "" });
  const filtered = useMemo(
    () =>
      data.filter(
        (item) =>
          (!filters.status || item.status === filters.status) &&
          (!filters.category || item.category === filters.category) &&
          (!filters.location || item.location.toLowerCase().includes(filters.location.toLowerCase())),
      ),
    [data, filters],
  );
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data.length) return <EmptyState title="No complaints indexed" text="Run the seed script or submit a complaint to populate the dashboard." />;
  return (
    <Card className="overflow-hidden">
      {!compact && (
        <div className="grid gap-3 border-b border-white/10 p-4 md:grid-cols-3">
          <select className={inputClass} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All statuses</option>
            <option>Open</option>
            <option>Assigned</option>
            <option>Completed</option>
            <option>Verified</option>
            <option>Disputed</option>
          </select>
          <select className={inputClass} value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
            <option value="">All categories</option>
            <option value="pothole">Pothole</option>
            <option value="flooding">Flooding</option>
            <option value="garbage">Garbage</option>
            <option value="streetlight">Streetlight</option>
            <option value="water leak">Water leak</option>
          </select>
          <input className={inputClass} placeholder="Filter by location" value={filters.location} onChange={(e) => setFilters({ ...filters, location: e.target.value })} />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-widest text-slate-400">
            <tr>
              <th className="px-4 py-3">Complaint</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Lowest bid</th>
              <th className="px-4 py-3">Bids</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, compact ? 6 : filtered.length).map((item) => (
              <tr key={item.id} className={`border-t border-white/10 ${item.status === "Disputed" ? "bg-danger/10" : ""}`}>
                <td className="px-4 py-4 font-bold text-white">{item.title}</td>
                <td className="px-4 py-4 text-slate-300">{item.category}</td>
                <td className="px-4 py-4 text-slate-300">{item.location}</td>
                <td className="px-4 py-4"><StatusBadge status={item.status} /></td>
                <td className="px-4 py-4 text-success">{item.lowest_bid ? `${item.lowest_bid.amount.toFixed(2)} SOL` : "None"}</td>
                <td className="px-4 py-4 text-cyan">{item.bid_count || 0}</td>
                <td className="px-4 py-4">
                  <Link className="inline-flex items-center gap-2 font-bold text-cyan" to={`/government/complaints/${item.id}`}>
                    <FileSearch className="h-4 w-4" /> View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function GovMap() {
  const { data, loading, error } = useComplaints();
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  return <ComplaintMap complaints={data} />;
}

function Funds() {
  const { data, loading, error } = useComplaints();
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  const locked = data.filter((item) => !item.payment_released).reduce((sum, item) => sum + item.estimated_fund, 0);
  const released = data.filter((item) => item.payment_released).reduce((sum, item) => sum + item.estimated_fund, 0);
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Stat label="Total SOL locked in escrow" value={`${locked.toFixed(2)} SOL`} tone="cyan" />
      <Stat label="Total SOL released" value={`${released.toFixed(2)} SOL`} tone="success" />
    </div>
  );
}

function GovDetail() {
  const { id } = useParams();
  const { complaint, loading, error, refresh } = useComplaint(id);
  const [paymentState, setPaymentState] = useState({ loading: false, error: "", saved: "" });
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  const current = complaint;
  const release = async () => {
    setPaymentState({ loading: true, error: "", saved: "" });
    try {
      await releasePayment(current.id, getSession()?.id);
      setPaymentState({ loading: false, error: "", saved: "Payment released." });
      await refresh();
    } catch (releaseError) {
      setPaymentState({ loading: false, error: releaseError.message, saved: "" });
    }
  };
  const resolve = async (resolution) => {
    setPaymentState({ loading: true, error: "", saved: "" });
    try {
      await resolveDispute(current.id, getSession()?.id, resolution);
      setPaymentState({
        loading: false,
        error: "",
        saved: resolution === "approve_payout"
          ? "Dispute resolved. Payment is now eligible."
          : "Job returned to the contractor for remediation.",
      });
      await refresh();
    } catch (resolveError) {
      setPaymentState({ loading: false, error: resolveError.message, saved: "" });
    }
  };
  return (
    <div className="space-y-6">
      <DetailView complaint={current} back="/government/table" />
      {current.status === "Disputed" && (
        <Card className="border-danger/40 bg-danger/10 p-6">
          <div className="flex items-center gap-2 text-danger">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="text-xl font-black">Citizen dispute</h2>
          </div>
          <p className="mt-3 text-slate-200">{current.dispute_reason}</p>
          <p className="mt-2 text-sm text-slate-400">Reported by {current.disputed_by} at {formatDateTime(current.disputed_at)}. Payment is blocked.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="rounded-lg bg-success px-4 py-2 font-black text-navy disabled:opacity-60" disabled={paymentState.loading} onClick={() => resolve("approve_payout")}>
              Approve for Payout
            </button>
            <button className="rounded-lg border border-danger/40 px-4 py-2 font-black text-danger disabled:opacity-60" disabled={paymentState.loading} onClick={() => resolve("return_for_remediation")}>
              Return for Remediation
            </button>
          </div>
        </Card>
      )}
      <Card className="p-6">
        <h2 className="text-xl font-black">Payment Review</h2>
        <p className="mt-2 text-sm text-slate-300">{current.payout_status}</p>
        {current.review_deadline && <p className="mt-2 text-xs text-slate-500">Citizen review deadline: {formatDateTime(current.review_deadline)}</p>}
        {paymentState.error && <p className="mt-3 text-sm font-bold text-danger">{paymentState.error}</p>}
        {paymentState.saved && <p className="mt-3 text-sm font-bold text-success">{paymentState.saved}</p>}
        {current.payout_eligible && (
          <button className="mt-4 rounded-lg bg-success px-5 py-3 font-black text-navy disabled:opacity-60" disabled={paymentState.loading} onClick={release}>
            {paymentState.loading ? "Releasing..." : "Release Eligible Payment"}
          </button>
        )}
      </Card>
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Automatic Bid Award</h2>
            <p className="mt-2 text-sm text-slate-400">
              Every contractor can bid until the citizen deadline. The lowest bid is assigned automatically when the window closes.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-cyan/30 bg-cyan/10 px-4 py-3 text-sm font-black text-cyan">
            <Clock3 className="h-4 w-4" />
            {current.status === "Open" ? "Waiting for deadline" : "Award finalized"}
          </div>
        </div>
        {current.lowest_bid ? (
          <div className="mt-5 rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
            <span>Lowest: {current.lowest_bid.amount.toFixed(2)} SOL from </span>
            <UserIdentity identity={current.lowest_bid.contractor} walletAddress={current.lowest_bid.contractor_pubkey} />
            <span className="ml-2"><Reputation identity={current.lowest_bid.contractor} /></span>
          </div>
        ) : (
          <p className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">No contractor bids yet.</p>
        )}
      </Card>
      <Card className="p-6">
        <h2 className="text-xl font-black">Full Timeline</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {["Submitted", "Bid", "Accepted", "Verified", "Paid"].map((step, index) => (
            <div key={step} className={`rounded-lg border p-3 text-sm ${index <= timelineIndex(current) ? "border-success/40 bg-success/10 text-success" : "border-white/10 text-slate-500"}`}>
              {step}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function aiLabel(item) {
  if (item.ai_confidence) return `${Math.round(item.ai_confidence * 100)}%`;
  if (item.verification_status === "queued") return "Queued";
  if (item.verification_status === "rejected") return "Review";
  return "Pending";
}

function timelineIndex(complaint) {
  if (complaint.payment_released) return 4;
  if (complaint.status === "Open" && (complaint.bids?.length || 0) > 0) return 1;
  return { Open: 0, Assigned: 2, Completed: 2, Verified: 3, Disputed: 2 }[complaint.status] ?? 0;
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
