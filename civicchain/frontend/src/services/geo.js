export const chennaiLocations = {
  "Anna Nagar": [13.0878, 80.2104],
  "T Nagar": [13.0418, 80.2341],
  Velachery: [12.9756, 80.2207],
  Adyar: [13.0067, 80.2578],
  Tambaram: [12.9249, 80.1000],
  Mylapore: [13.0339, 80.2697],
  Guindy: [13.0102, 80.2157],
  Porur: [13.0382, 80.1565],
  "OMR": [12.9121, 80.2279],
  Chromepet: [12.9516, 80.1462],
};

function validCoordinates(latitude, longitude) {
  return (
    Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
  );
}

function coordinateParts(location = "") {
  const match = String(location)
    .trim()
    .match(/^\(?\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:,|\s)\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*\)?$/);

  if (!match) return null;

  return { latitude: Number(match[1]), longitude: Number(match[2]) };
}

export function parseCoordinates(location = "") {
  const parts = coordinateParts(location);
  if (!parts) return null;

  const { latitude, longitude } = parts;
  if (!validCoordinates(latitude, longitude)) return null;

  return { latitude, longitude };
}

export function coordinatesFor(location = "", id = 0, latitude = null, longitude = null) {
  if (latitude !== null && latitude !== undefined && latitude !== ""
    && longitude !== null && longitude !== undefined && longitude !== "") {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (validCoordinates(lat, lng)) return [lat, lng];
  }

  const match = Object.entries(chennaiLocations).find(([name]) =>
    location.toLowerCase().includes(name.toLowerCase()),
  );
  if (match) return match[1];
  return [13.0827 + (id % 5) * 0.012, 80.2707 - (id % 4) * 0.016];
}

function normalizeSearchAddress(address) {
  const trimmed = address.trim();
  if (!trimmed) return "";
  return /chennai|tamil nadu|india/i.test(trimmed) ? trimmed : `${trimmed}, Chennai, India`;
}

const NOMINATIM_REQUEST_INTERVAL_MS = 1100;

function searchCandidates(address) {
  const components = String(address)
    .split(",")
    .map((component) => component.trim())
    .filter(Boolean);

  return components.map((_, index) => components.slice(index).join(", "));
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function searchNominatim(address) {
  const params = new URLSearchParams({
    q: normalizeSearchAddress(address),
    format: "jsonv2",
    limit: "1",
    countrycodes: "in",
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;

  const [result] = await response.json();
  const latitude = Number(result?.lat);
  const longitude = Number(result?.lon);
  if (!validCoordinates(latitude, longitude)) return null;

  return { latitude, longitude };
}

export async function geocodeAddress(address) {
  const suppliedCoordinates = coordinateParts(address);
  if (suppliedCoordinates && !validCoordinates(
    suppliedCoordinates.latitude,
    suppliedCoordinates.longitude,
  )) {
    return { ok: false, reason: "invalid_coordinates" };
  }

  const parsedCoordinates = parseCoordinates(address);
  if (parsedCoordinates) {
    return { ok: true, ...parsedCoordinates, source: "coordinates" };
  }

  const candidates = searchCandidates(address);
  if (!candidates.length) return { ok: false, reason: "empty" };

  for (let index = 0; index < candidates.length; index += 1) {
    if (index > 0) await wait(NOMINATIM_REQUEST_INTERVAL_MS);

    try {
      const result = await searchNominatim(candidates[index]);
      if (result) {
        return {
          ok: true,
          ...result,
          source: "nominatim",
          approximate: index > 0,
          matchedAddress: candidates[index],
        };
      }
    } catch {
      // A failed request should not prevent less-specific fallbacks from being tried.
    }
  }

  return { ok: false, reason: "not_found" };
}
