import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useParams } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AlertTriangle, Camera, Clock3, FileText, Home, Map, MapPin, Send } from "lucide-react";
import ComplaintCard from "../components/ComplaintCard";
import ComplaintMap from "../components/ComplaintMap";
import LocationPicker from "../components/LocationPicker";
import PortalNav from "../components/PortalNav";
import SessionBanner from "../components/SessionBanner";
import ContractorRating, { Reputation } from "../components/ContractorRating";
import UserIdentity from "../components/UserIdentity";
import { Card, EmptyState, ErrorState, Field, LoadingState, StatusBadge, inputClass } from "../components/ui";
import { createComplaint, getComplaint, getComplaints, reportProblem } from "../services/api";
import { getSession, isDemoMode } from "../services/auth";
import { geocodeAddress } from "../services/geo";

const LOCATION_RESOLUTION_ERROR = "We couldn't locate that address. Double-check it or enter coordinates as latitude, longitude.";
const APPROXIMATE_LOCATION_NOTE = "We found an approximate location for this address — you can adjust precision by entering coordinates directly if needed.";

const links = [
  { to: "/citizen", label: "Report", icon: Home },
  { to: "/citizen/my-complaints", label: "My Complaints", icon: FileText },
  { to: "/citizen/map", label: "Map", icon: Map },
];

export default function CitizenPortal() {
  return (
    <div className="page-enter">
      <SessionBanner role="citizen" />
      <div className="mb-6 flex justify-end">
        <WalletMultiButton />
      </div>
      <PortalNav links={links} />
      <Routes>
        <Route index element={<CitizenHome />} />
        <Route path="my-complaints" element={<CitizenComplaints />} />
        <Route path="map" element={<CitizenMap />} />
        <Route path="complaints/:id" element={<CitizenDetail />} />
      </Routes>
    </div>
  );
}

function CitizenHome() {
  const session = getSession();
  const [form, setForm] = useState({ title: "", description: "", location: "", category: "pothole", otherCategory: "", latitude: null, longitude: null });
  const [bidMinutes, setBidMinutes] = useState("30");
  const [photoFile, setPhotoFile] = useState(null);
  const [state, setState] = useState({ loading: false, error: "", saved: null, approximate: false });

  const submit = async (event) => {
    event.preventDefault();
    setState({ loading: true, error: "", saved: null, approximate: false });
    try {
      const coordinates = Number.isFinite(form.latitude) && Number.isFinite(form.longitude)
        ? { ok: true, latitude: form.latitude, longitude: form.longitude, source: "map" }
        : await geocodeAddress(form.location);
      if (!coordinates.ok) {
        setState({ loading: false, error: LOCATION_RESOLUTION_ERROR, saved: null, approximate: false });
        return;
      }
      const durationMinutes = Math.max(1, Number(bidMinutes) || 30);
      const bidDeadline = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
      const saved = await createComplaint({
        ...form,
        category: form.category === "other" ? form.otherCategory.trim() : form.category,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        citizen_pubkey: session?.id || null,
        bid_deadline: bidDeadline,
        photo: photoFile,
      });
      setForm({ title: "", description: "", location: "", category: "pothole", otherCategory: "", latitude: null, longitude: null });
      setBidMinutes("30");
      setPhotoFile(null);
      setState({ loading: false, error: "", saved, approximate: coordinates.approximate === true });
    } catch (error) {
      setState({ loading: false, error: error.message, saved: null, approximate: false });
    }
  };

  return (
    <Card className="mx-auto max-w-3xl p-6">
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan">Citizen Portal</p>
          <div className="mt-2 flex items-center gap-3">
            <Send className="h-5 w-5 text-cyan" />
            <h1 className="text-2xl font-black">Submit Complaint</h1>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Report a civic issue and track it from My Complaints.
          </p>
        </div>
        <Field label="Title">
          <input className={inputClass} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Description">
          <textarea className={inputClass} required rows="4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="Address / Landmark">
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-cyan" />
            <input
              className={`${inputClass} pl-10`}
              required
              placeholder="Example: 12 Main Road, near Anna Nagar Tower, Chennai"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value, latitude: null, longitude: null })}
            />
          </div>
        </Field>
        <Field label="Pinpoint on map">
          <LocationPicker
            latitude={form.latitude}
            longitude={form.longitude}
            onSelect={({ latitude, longitude }) => setForm({
              ...form,
              latitude,
              longitude,
              location: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
            })}
          />
        </Field>
        <Field label="Category">
          <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="pothole">Pothole</option>
            <option value="flooding">Flooding</option>
            <option value="garbage">Garbage</option>
            <option value="streetlight">Streetlight</option>
            <option value="water leak">Water leak</option>
            <option value="other">Other</option>
          </select>
        </Field>
        {form.category === "other" && (
          <Field label="Describe issue type">
            <input
              className={inputClass}
              maxLength="100"
              placeholder="Example: damaged public bench"
              required
              value={form.otherCategory}
              onChange={(e) => setForm({ ...form, otherCategory: e.target.value })}
            />
          </Field>
        )}
        <Field label="Contractor bidding window">
          <div className="relative">
            <Clock3 className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-cyan" />
            <input
              className={`${inputClass} pl-10`}
              min="1"
              max="43200"
              step="1"
              type="number"
              value={bidMinutes}
              onChange={(e) => setBidMinutes(e.target.value)}
              placeholder="Enter minutes"
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">Enter any custom duration in minutes. Minimum is 1 minute.</p>
        </Field>
        <Field label="Photo Upload">
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-white/20 bg-navy/70 px-4 py-4 text-sm text-slate-300">
            <span className="inline-flex items-center gap-2">
              <Camera className="h-4 w-4 text-cyan" />
              {photoFile?.name || "Choose issue photo"}
            </span>
            <input className="hidden" type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
          </label>
        </Field>
        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        {state.saved && <p className="text-sm text-success">Complaint #{state.saved.id} submitted.</p>}
        {state.saved && state.approximate && <p className="text-sm text-amber-300">{APPROXIMATE_LOCATION_NOTE}</p>}
        <button className="w-full rounded-lg bg-cyan px-5 py-3 font-black text-navy disabled:opacity-60" disabled={state.loading}>
          {state.loading ? "Submitting..." : "Submit Complaint"}
        </button>
      </form>
    </Card>
  );
}

function CitizenComplaints() {
  const session = getSession();
  const { data, loading, error } = useComplaints();
  const wallet = session?.id;
  const visible = useMemo(() => {
    if (!wallet) return data;
    const owned = data.filter((item) => !item.citizen_pubkey || item.citizen_pubkey === wallet);
    if (!isDemoMode()) return owned;
    const otherDemo = data.filter((item) => item.citizen_pubkey && item.citizen_pubkey !== wallet);
    return [...owned, ...otherDemo];
  }, [data, wallet]);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!visible.length) return <EmptyState title="No complaints yet" text="Submitted complaints appear here after the backend saves them." />;
  return <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{visible.map((item) => <ComplaintCard key={item.id} complaint={item} />)}</div>;
}

function CitizenMap() {
  const { data, loading, error } = useComplaints();
  if (loading) return <LoadingState label="Loading Chennai map" />;
  if (error) return <ErrorState message={error} />;
  return <ComplaintMap complaints={data} detailBase="/citizen/complaints" />;
}

function CitizenDetail() {
  const { id } = useParams();
  const { complaint, loading, error, refresh } = useComplaint(id);
  const session = getSession();
  const [reason, setReason] = useState("");
  const [disputeState, setDisputeState] = useState({ loading: false, error: "" });
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  const ownsComplaint = complaint.citizen_pubkey === session?.id;
  const canReview = ownsComplaint && ["Completed", "Verified"].includes(complaint.status);
  const canDispute = canReview && !complaint.payment_released && complaint.review_deadline
    && Date.now() < new Date(complaint.review_deadline).getTime();

  const submitDispute = async (event) => {
    event.preventDefault();
    setDisputeState({ loading: true, error: "" });
    try {
      await reportProblem(complaint.id, { citizen_id: session.id, reason });
      setReason("");
      setDisputeState({ loading: false, error: "" });
      await refresh();
    } catch (submitError) {
      setDisputeState({ loading: false, error: submitError.message });
    }
  };

  return (
    <div className="space-y-6">
      <DetailView complaint={complaint} back="/citizen/my-complaints" />
      {canReview && (
        <Card className="p-6">
          <h2 className="text-xl font-black">Rate the Contractor</h2>
          <p className="mt-2 text-sm text-slate-400">One rating is allowed for this completed job.</p>
          <div className="mt-5">
            <ContractorRating complaint={complaint} citizenId={session.id} onSaved={refresh} />
          </div>
        </Card>
      )}
      {canDispute && (
        <Card className="border-danger/30 p-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-danger" />
            <h2 className="text-xl font-black">Report a Problem</h2>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Report unsatisfactory work before {formatDateTime(complaint.review_deadline)}. This blocks payment for Government review.
          </p>
          <form className="mt-4 space-y-4" onSubmit={submitDispute}>
            <Field label="What is still wrong?">
              <textarea className={inputClass} required maxLength="500" rows="4" value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
            {disputeState.error && <p className="text-sm font-bold text-danger">{disputeState.error}</p>}
            <button className="rounded-lg bg-danger px-5 py-3 font-black text-white disabled:opacity-60" disabled={disputeState.loading}>
              {disputeState.loading ? "Reporting..." : "Report a Problem"}
            </button>
          </form>
        </Card>
      )}
      {complaint.status === "Disputed" && (
        <Card className="border-danger/40 bg-danger/10 p-6">
          <h2 className="text-xl font-black text-danger">Problem reported</h2>
          <p className="mt-2 text-slate-300">{complaint.dispute_reason}</p>
          <p className="mt-2 text-sm text-slate-500">Payment is blocked pending Government review.</p>
        </Card>
      )}
    </div>
  );
}

export function DetailView({ complaint, back }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1fr]">
      <Card className="overflow-hidden">
        <img className="h-72 w-full object-cover" src={complaint.photo_url} alt="" />
        <div className="space-y-4 p-6">
          <Link className="text-sm font-bold text-cyan" to={back}>Back</Link>
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl font-black">{complaint.title}</h1>
            <StatusBadge status={complaint.status} />
          </div>
          <p className="text-slate-300">{complaint.description}</p>
          <p className="text-sm text-slate-400">{complaint.location}</p>
        </div>
      </Card>
      <div className="space-y-5">
        <Card className="p-6">
          <h2 className="text-xl font-black">Contractor Bids</h2>
          <p className="mt-3 text-3xl font-black text-success">{complaint.lowest_bid ? `${complaint.lowest_bid.amount.toFixed(2)} SOL` : "No bid yet"}</p>
          <p className="mt-2 text-sm text-slate-400">
            {complaint.contractor_pubkey
              ? <><UserIdentity identity={complaint.contractor} walletAddress={complaint.contractor_pubkey} /> · <Reputation identity={complaint.contractor} /></>
              : `${complaint.bid_count || 0} bid${complaint.bid_count === 1 ? "" : "s"} received`}
          </p>
          <p className="mt-2 text-xs font-bold uppercase tracking-widest text-cyan">
            Bid window {complaint.bidding_closed ? "closed" : "open"}{complaint.bid_deadline ? ` until ${formatDateTime(complaint.bid_deadline)}` : ""}
          </p>
          <BidList bids={complaint.bids || []} />
        </Card>
        <Card className="p-6">
          <h2 className="text-xl font-black">AI Verification</h2>
          <p className="mt-3 text-3xl font-black text-cyan">{verificationLabel(complaint)}</p>
          <p className="mt-2 text-sm text-slate-300">{complaint.ai_reasoning || "Proof images have not been verified yet."}</p>
        </Card>
      </div>
    </div>
  );
}

function BidList({ bids }) {
  if (!bids.length) {
    return <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-400">Waiting for contractors to place bids.</p>;
  }
  return (
    <div className="mt-4 space-y-2">
      {[...bids].sort((a, b) => a.amount - b.amount).map((bid, index) => (
        <div key={`${bid.contractor_pubkey}-${bid.created_at || index}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm">
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <UserIdentity className="block truncate text-slate-300" identity={bid.contractor} walletAddress={bid.contractor_pubkey} />
              {index === 0 && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-black uppercase text-success">Lowest</span>}
            </span>
            <Reputation identity={bid.contractor} />
          </span>
          <span className="shrink-0 font-black text-success">{bid.amount.toFixed(2)} SOL</span>
        </div>
      ))}
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

function verificationLabel(complaint) {
  if (complaint.ai_confidence) return `${Math.round(complaint.ai_confidence * 100)}%`;
  if (complaint.verification_status === "queued") return "Queued";
  if (complaint.verification_status === "rejected") return "Review";
  return "Pending";
}

export function useComplaints() {
  const [state, setState] = useState({ data: [], loading: true, error: "" });
  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const data = await getComplaints();
      setState({ data, loading: false, error: "" });
      return data;
    } catch (error) {
      setState({ data: [], loading: false, error: error.message });
      return [];
    }
  }, []);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => refresh({ silent: true }), 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return { ...state, refresh };
}

export function useComplaint(id) {
  const [state, setState] = useState({ complaint: null, loading: true, error: "" });
  const refresh = useCallback(() => getComplaint(id)
    .then((complaint) => {
      setState({ complaint, loading: false, error: "" });
      return complaint;
    })
    .catch((error) => {
      setState({ complaint: null, loading: false, error: error.message });
      return null;
    }), [id]);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return { ...state, refresh };
}
