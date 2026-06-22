import { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useParams } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { Camera, FileText, Home, Map, Send } from "lucide-react";
import ComplaintCard from "../components/ComplaintCard";
import ComplaintMap from "../components/ComplaintMap";
import PortalNav from "../components/PortalNav";
import { Card, EmptyState, ErrorState, Field, LoadingState, StatusBadge, inputClass } from "../components/ui";
import { createComplaint, getComplaint, getComplaints, imageForCategory } from "../services/api";

const links = [
  { to: "/citizen", label: "Report", icon: Home },
  { to: "/citizen/my-complaints", label: "My Complaints", icon: FileText },
  { to: "/citizen/map", label: "Map", icon: Map },
];

export default function CitizenPortal() {
  return (
    <div className="page-enter">
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
  const { publicKey } = useWallet();
  const [form, setForm] = useState({ title: "", description: "", location: "", category: "pothole" });
  const [photoName, setPhotoName] = useState("");
  const [state, setState] = useState({ loading: false, error: "", saved: null });

  const submit = async (event) => {
    event.preventDefault();
    setState({ loading: true, error: "", saved: null });
    try {
      const saved = await createComplaint({
        ...form,
        citizen_pubkey: publicKey?.toBase58() || null,
        photo_url: imageForCategory(form.category),
      });
      setForm({ title: "", description: "", location: "", category: "pothole" });
      setPhotoName("");
      setState({ loading: false, error: "", saved });
    } catch (error) {
      setState({ loading: false, error: error.message, saved: null });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
      <section className="rounded-lg border border-cyan/20 bg-cyan/10 p-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan">Citizen Portal</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight text-white md:text-6xl">
          Report civic issues, get them fixed on-chain
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-slate-300">
          Submit verified local complaints, track contractor progress, and see escrow payments released transparently on Solana.
        </p>
        <div className="mt-8">
          <WalletMultiButton />
        </div>
      </section>
      <Card className="p-6">
        <form className="space-y-4" onSubmit={submit}>
          <div className="flex items-center gap-3">
            <Send className="h-5 w-5 text-cyan" />
            <h2 className="text-xl font-black">Submit Complaint</h2>
          </div>
          <Field label="Title">
            <input className={inputClass} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Description">
            <textarea className={inputClass} required rows="4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Location">
              <input className={inputClass} required placeholder="Anna Nagar, Chennai" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </Field>
            <Field label="Category">
              <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="pothole">Pothole</option>
                <option value="flooding">Flooding</option>
                <option value="garbage">Garbage</option>
                <option value="streetlight">Streetlight</option>
                <option value="water leak">Water leak</option>
              </select>
            </Field>
          </div>
          <Field label="Photo Upload">
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-white/20 bg-navy/70 px-4 py-4 text-sm text-slate-300">
              <span className="inline-flex items-center gap-2">
                <Camera className="h-4 w-4 text-cyan" />
                {photoName || "Choose issue photo"}
              </span>
              <input className="hidden" type="file" accept="image/*" onChange={(e) => setPhotoName(e.target.files?.[0]?.name || "")} />
            </label>
          </Field>
          {state.error && <p className="text-sm text-danger">{state.error}</p>}
          {state.saved && <p className="text-sm text-success">Complaint #{state.saved.id} submitted.</p>}
          <button className="w-full rounded-lg bg-cyan px-5 py-3 font-black text-navy disabled:opacity-60" disabled={state.loading}>
            {state.loading ? "Submitting..." : "Submit Complaint"}
          </button>
        </form>
      </Card>
    </div>
  );
}

function CitizenComplaints() {
  const { publicKey } = useWallet();
  const { data, loading, error } = useComplaints();
  const wallet = publicKey?.toBase58();
  const visible = useMemo(
    () => (wallet ? data.filter((item) => !item.citizen_pubkey || item.citizen_pubkey === wallet) : data),
    [data, wallet],
  );
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
  const { complaint, loading, error } = useComplaint(id);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  return <DetailView complaint={complaint} back="/citizen/my-complaints" />;
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
          <h2 className="text-xl font-black">Current Bid</h2>
          <p className="mt-3 text-3xl font-black text-success">{complaint.bid_amount ? `${complaint.bid_amount.toFixed(2)} SOL` : "No bid yet"}</p>
          <p className="mt-2 text-sm text-slate-400">{complaint.contractor_pubkey || "Waiting for contractor assignment"}</p>
        </Card>
        <Card className="p-6">
          <h2 className="text-xl font-black">AI Verification</h2>
          <p className="mt-3 text-3xl font-black text-cyan">{complaint.ai_confidence ? `${Math.round(complaint.ai_confidence * 100)}%` : "Pending"}</p>
          <p className="mt-2 text-sm text-slate-300">{complaint.ai_reasoning || "Proof images have not been verified yet."}</p>
        </Card>
      </div>
    </div>
  );
}

export function useComplaints() {
  const [state, setState] = useState({ data: [], loading: true, error: "" });
  useEffect(() => {
    getComplaints()
      .then((data) => setState({ data, loading: false, error: "" }))
      .catch((error) => setState({ data: [], loading: false, error: error.message }));
  }, []);
  return state;
}

export function useComplaint(id) {
  const [state, setState] = useState({ complaint: null, loading: true, error: "" });
  useEffect(() => {
    getComplaint(id)
      .then((complaint) => setState({ complaint, loading: false, error: "" }))
      .catch((error) => setState({ complaint: null, loading: false, error: error.message }));
  }, [id]);
  return state;
}
