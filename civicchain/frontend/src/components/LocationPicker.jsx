import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";

const icon = L.divIcon({
  className: "",
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#00d4ff;border:3px solid white;box-shadow:0 1px 8px #000"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function ClickSelector({ onSelect }) {
  useMapEvents({
    click(event) {
      const { lat, lng } = event.latlng;
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        onSelect({ latitude: lat, longitude: lng });
      }
    },
  });
  return null;
}

export default function LocationPicker({ latitude, longitude, onSelect }) {
  const selected = Number.isFinite(latitude) && Number.isFinite(longitude);
  return (
    <div>
      <MapContainer
        center={selected ? [latitude, longitude] : [13.045, 80.235]}
        zoom={selected ? 16 : 11}
        scrollWheelZoom
        className="h-[280px] sm:h-[340px]"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickSelector onSelect={onSelect} />
        {selected && <Marker position={[latitude, longitude]} icon={icon} />}
      </MapContainer>
      <p className="mt-2 text-xs text-slate-400">
        {selected
          ? `Selected: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
          : "Click or tap the map to pinpoint the issue location."}
      </p>
    </div>
  );
}
