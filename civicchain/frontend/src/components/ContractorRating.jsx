import { useState } from "react";
import { Field, inputClass } from "./ui";
import { rateContractor } from "../services/api";

export function Reputation({ identity }) {
  if (!identity?.ratings_count) return <span className="text-xs text-slate-500">No ratings yet</span>;
  return (
    <span className="text-sm font-bold text-amber-200">
      {identity.average_rating?.toFixed(1)} ★ ({identity.ratings_count} rating{identity.ratings_count === 1 ? "" : "s"})
    </span>
  );
}

export default function ContractorRating({ complaint, citizenId, onSaved }) {
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [state, setState] = useState({ loading: false, error: "" });

  if (complaint.rating) {
    return (
      <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4">
        <p className="font-black text-amber-200">{complaint.rating.rating} ★ — Rating submitted</p>
        {complaint.rating.review && <p className="mt-2 text-sm text-slate-300">{complaint.rating.review}</p>}
      </div>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    setState({ loading: true, error: "" });
    try {
      const updated = await rateContractor(complaint.id, {
        citizen_id: citizenId,
        rating: Number(rating),
        review,
      });
      setState({ loading: false, error: "" });
      onSaved(updated);
    } catch (error) {
      setState({ loading: false, error: error.message });
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <Field label="Rating">
        <select className={inputClass} value={rating} onChange={(event) => setRating(event.target.value)}>
          {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} star{value === 1 ? "" : "s"}</option>)}
        </select>
      </Field>
      <Field label="Optional review">
        <textarea className={inputClass} maxLength="500" rows="3" value={review} onChange={(event) => setReview(event.target.value)} />
      </Field>
      {state.error && <p className="text-sm font-bold text-danger">{state.error}</p>}
      <button className="rounded-lg bg-amber-300 px-5 py-2 font-black text-navy disabled:opacity-60" disabled={state.loading}>
        {state.loading ? "Submitting..." : "Submit rating"}
      </button>
    </form>
  );
}
