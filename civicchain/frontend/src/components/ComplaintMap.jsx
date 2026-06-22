import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { Link } from "react-router-dom";
import { coordinatesFor } from "../services/geo";
import { StatusBadge } from "./ui";

const colors = {
  Open: "#00D4FF",
  Assigned: "#FBBF24",
  Completed: "#60A5FA",
  Verified: "#00FF88",
  Failed: "#FF4444",
};

function marker(status) {
  const color = colors[status] || colors.Open;
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:18px;height:18px;border-radius:50%;background:${color};box-shadow:0 0 18px ${color};border:2px solid white"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function ComplaintMap({ complaints, detailBase = "/government/complaints" }) {
  return (
    <MapContainer center={[13.045, 80.235]} zoom={11} scrollWheelZoom className="h-[420px]">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {complaints.map((complaint) => (
        <Marker
          key={complaint.id}
          position={coordinatesFor(complaint.location, complaint.id)}
          icon={marker(complaint.status)}
        >
          <Popup>
            <div className="space-y-2 text-slate-900">
              <strong>{complaint.title}</strong>
              <div>{complaint.location}</div>
              <StatusBadge status={complaint.status} />
              <Link className="block font-semibold text-blue-700" to={`${detailBase}/${complaint.id}`}>
                View details
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
