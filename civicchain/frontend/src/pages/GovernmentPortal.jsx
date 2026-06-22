import { useMemo, useState } from "react";
import { Link, Route, Routes, useParams } from "react-router-dom";
import { BarChart3, Coins, FileSearch, Map, Table2 } from "lucide-react";
import ComplaintMap from "../components/ComplaintMap";
import PortalNav from "../components/PortalNav";
import { Card, EmptyState, ErrorState, LoadingState, StatusBadge, inputClass } from "../components/ui";
import { DetailView, useComplaint, useComplaints } from "./CitizenPortal";

const links = [
  { to: "/government", label: "Overview", icon: BarChart3 },
  { to: "/government/table", label: "Complaints", icon: Table2 },
  { to: "/government/map", label: "Map", icon: Map },
  { to: "/government/funds", label: "Funds", icon: Coins },
];

export default function GovernmentPortal() {
  return (
    <div className="page-enter">
      <PortalNav links={links} />
      <Routes>
        <Route index element={<Overview />} />
        <Route path="table" element={<ComplaintsTable />} />
        <Route path="map" element={<GovMap />} />
        <Route path="funds" element={<Funds />} />
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
  const released = data.filter((item) => item.payment_released || item.status === "Verified").reduce((sum, item) => sum + item.estimated_fund, 0);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total complaints" value={data.length} />
        <Stat label="Resolved this month" value={resolved} tone="success" />
        <Stat label="Pending" value={pending} tone="cyan" />
        <Stat label="Funds released" value={`${released.toFixed(2)} SOL`} tone="success" />
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
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-widest text-slate-400">
            <tr>
              <th className="px-4 py-3">Complaint</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">AI</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, compact ? 6 : filtered.length).map((item) => (
              <tr key={item.id} className="border-t border-white/10">
                <td className="px-4 py-4 font-bold text-white">{item.title}</td>
                <td className="px-4 py-4 text-slate-300">{item.category}</td>
                <td className="px-4 py-4 text-slate-300">{item.location}</td>
                <td className="px-4 py-4"><StatusBadge status={item.status} /></td>
                <td className="px-4 py-4 text-cyan">{item.ai_confidence ? `${Math.round(item.ai_confidence * 100)}%` : "Pending"}</td>
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
  const locked = data.filter((item) => item.status !== "Verified").reduce((sum, item) => sum + item.estimated_fund, 0);
  const released = data.filter((item) => item.status === "Verified").reduce((sum, item) => sum + item.estimated_fund, 0);
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Stat label="Total SOL locked in escrow" value={`${locked.toFixed(2)} SOL`} tone="cyan" />
      <Stat label="Total SOL released" value={`${released.toFixed(2)} SOL`} tone="success" />
    </div>
  );
}

function GovDetail() {
  const { id } = useParams();
  const { complaint, loading, error } = useComplaint(id);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  return (
    <div className="space-y-6">
      <DetailView complaint={complaint} back="/government/table" />
      <Card className="p-6">
        <h2 className="text-xl font-black">Full Timeline</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {["Submitted", "Bid", "Accepted", "Verified", "Paid"].map((step, index) => (
            <div key={step} className={`rounded-lg border p-3 text-sm ${index <= timelineIndex(complaint.status) ? "border-success/40 bg-success/10 text-success" : "border-white/10 text-slate-500"}`}>
              {step}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function timelineIndex(status) {
  return { Open: 0, Assigned: 2, Completed: 3, Verified: 4 }[status] ?? 0;
}
