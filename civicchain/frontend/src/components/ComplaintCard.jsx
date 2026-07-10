import { Link } from "react-router-dom";
import { Clock3, MapPin, Wallet } from "lucide-react";
import { Card, StatusBadge } from "./ui";

export default function ComplaintCard({ complaint, detailBase = "/citizen/complaints", action }) {
  return (
    <Card className="overflow-hidden">
      <img className="h-44 w-full object-cover" src={complaint.photo_url} alt="" loading="lazy" />
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-cyan">{complaint.category}</p>
            <h3 className="mt-1 text-lg font-black text-white">{complaint.title}</h3>
          </div>
          <StatusBadge status={complaint.status} />
        </div>
        <p className="line-clamp-2 text-sm text-slate-400">{complaint.description}</p>
        <div className="flex flex-wrap gap-3 text-sm text-slate-300">
          <span className="inline-flex items-center gap-2">
            <MapPin className="h-4 w-4 text-cyan" />
            {complaint.location}
          </span>
          <span className="inline-flex items-center gap-2">
            <Wallet className="h-4 w-4 text-success" />
            {complaint.lowest_bid ? `${complaint.lowest_bid.amount.toFixed(2)} SOL lowest` : `${complaint.estimated_fund.toFixed(2)} SOL`}
          </span>
          <span className="inline-flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-cyan" />
            {complaint.bid_count || 0} bid{complaint.bid_count === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-white hover:border-cyan"
            to={`${detailBase}/${complaint.id}`}
          >
            Details
          </Link>
          {action}
        </div>
      </div>
    </Card>
  );
}
