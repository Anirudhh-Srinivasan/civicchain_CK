import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { LocateFixed, Loader2, MapPin, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { coordinatesFor, reverseGeocode, searchAddresses } from "../services/geo";
import { inputClass, StatusBadge } from "./ui";

const defaultCenter = [13.045, 80.235];

const selectedMarker = L.divIcon({
  className: "location-pin-shell",
  html: '<span class="location-pin"><span></span></span>',
  iconSize: [30, 40],
  iconAnchor: [15, 38],
  popupAnchor: [0, -36],
});

const complaintColors = {
  Open: "#00D4FF",
  Assigned: "#FBBF24",
  Completed: "#60A5FA",
  Verified: "#00FF88",
  Failed: "#FF4444",
};

function complaintMarker(status) {
  const color = complaintColors[status] || complaintColors.Open;
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:16px;height:16px;border-radius:50%;background:${color};box-shadow:0 0 14px ${color};border:2px solid white"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function MapController({ position, onPick }) {
  const map = useMap();

  useEffect(() => {
    if (position) map.flyTo(position, 16, { duration: 0.8 });
  }, [map, position]);

  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

export default function LocationPicker({
  value,
  latitude,
  longitude,
  onChange,
  complaints = [],
  detailBase = "/citizen/complaints",
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const skipNextSearch = useRef(false);
  const position = useMemo(() => {
    const hasCoordinates = latitude !== null && latitude !== undefined && latitude !== "" &&
      longitude !== null && longitude !== undefined && longitude !== "";
    const lat = Number(latitude);
    const lng = Number(longitude);
    return hasCoordinates && Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }, [latitude, longitude]);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return undefined;
    }
    if (value.trim().length < 3) {
      setSuggestions([]);
      setStatus("idle");
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("searching");
      setMessage("");
      try {
        const results = await searchAddresses(value, { signal: controller.signal });
        setSuggestions(results);
        setStatus("idle");
        if (!results.length) setMessage("No matching place found. Try a nearby landmark or select the map.");
      } catch (error) {
        if (error.name !== "AbortError") {
          setStatus("idle");
          setMessage("Place search is temporarily unavailable. You can still select the map.");
        }
      }
    }, 550);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const select = (result) => {
    skipNextSearch.current = true;
    setSuggestions([]);
    setMessage("");
    onChange({
      location: result.displayName,
      latitude: result.latitude,
      longitude: result.longitude,
    });
  };

  const pickCoordinates = async (lat, lng) => {
    setStatus("locating");
    setSuggestions([]);
    setMessage("");
    const location = await reverseGeocode(lat, lng);
    skipNextSearch.current = true;
    onChange({ location, latitude: lat, longitude: lng });
    setStatus("idle");
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage("Location access is not supported in this browser.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => pickCoordinates(coords.latitude, coords.longitude),
      () => {
        setStatus("idle");
        setMessage("Location permission was not available. Search or select the map instead.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="space-y-3">
      <div className="relative z-[500]">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-cyan" />
        <input
          className={`${inputClass} pl-10 pr-12`}
          required
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls="location-results"
          autoComplete="off"
          placeholder="Search a place, road, or landmark"
          value={value}
          onChange={(event) => {
            onChange({ location: event.target.value, latitude: null, longitude: null });
            setMessage("");
          }}
        />
        <button
          type="button"
          title="Use current location"
          aria-label="Use current location"
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-cyan"
          onClick={useCurrentLocation}
        >
          {status === "locating" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
        </button>
        {suggestions.length > 0 && (
          <div id="location-results" role="listbox" className="absolute left-0 right-0 top-[calc(100%+0.35rem)] overflow-hidden rounded-lg border border-white/15 bg-panel shadow-2xl">
            {suggestions.map((result) => (
              <button
                key={`${result.latitude}-${result.longitude}-${result.displayName}`}
                type="button"
                role="option"
                className="flex w-full items-start gap-3 border-b border-white/10 px-4 py-3 text-left text-sm text-slate-200 transition last:border-b-0 hover:bg-cyan/10"
                onClick={() => select(result)}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                <span className="line-clamp-2">{result.displayName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative overflow-hidden rounded-lg border border-white/10">
        <MapContainer center={position || defaultCenter} zoom={position ? 16 : 11} scrollWheelZoom className="h-[320px]">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController position={position} onPick={pickCoordinates} />
          {position && (
            <Marker
              position={position}
              icon={selectedMarker}
              draggable
              eventHandlers={{
                dragend(event) {
                  const point = event.target.getLatLng();
                  pickCoordinates(point.lat, point.lng);
                },
              }}
            >
              <Popup>{value || "Selected complaint location"}</Popup>
            </Marker>
          )}
          {complaints.map((complaint) => (
            <Marker
              key={complaint.id}
              position={coordinatesFor(complaint.location, complaint.id, complaint.latitude, complaint.longitude)}
              icon={complaintMarker(complaint.status)}
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
        <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-md bg-navy/85 px-3 py-2 text-xs font-semibold text-slate-200 shadow-lg">
          Select the map or drag the red pin
        </div>
      </div>

      <div className="min-h-5 text-xs">
        {status === "searching" && <span className="inline-flex items-center gap-2 text-cyan"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding places...</span>}
        {message && <span className="text-slate-400">{message}</span>}
        {position && status !== "searching" && !message && (
          <span className="font-semibold text-success">Pin selected at {position[0].toFixed(5)}, {position[1].toFixed(5)}</span>
        )}
      </div>
    </div>
  );
}
