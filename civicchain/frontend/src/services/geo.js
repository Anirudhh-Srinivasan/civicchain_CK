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

export function coordinatesFor(location = "", id = 0, latitude = null, longitude = null) {
  const hasCoordinates = latitude !== null && latitude !== undefined && latitude !== "" &&
    longitude !== null && longitude !== undefined && longitude !== "";
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (hasCoordinates && Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];

  const match = Object.entries(chennaiLocations).find(([name]) =>
    location.toLowerCase().includes(name.toLowerCase()),
  );
  if (match) return match[1];
  return [13.0827 + (id % 5) * 0.012, 80.2707 - (id % 4) * 0.016];
}

function normalizeSearchAddress(address) {
  const trimmed = address.trim();
  if (!trimmed) return "";
  return /india/i.test(trimmed) ? trimmed : `${trimmed}, India`;
}

function localResults(search) {
  return Object.entries(chennaiLocations)
    .filter(([name]) => name.toLowerCase().includes(search.toLowerCase()))
    .map(([name, [latitude, longitude]]) => ({
      displayName: `${name}, Chennai, Tamil Nadu, India`,
      latitude,
      longitude,
      source: "local",
    }));
}

export async function searchAddresses(address, { signal, limit = 5 } = {}) {
  const search = normalizeSearchAddress(address);
  if (!search) return [];

  const known = localResults(address).slice(0, limit);

  const params = new URLSearchParams({
    q: search,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(limit),
    countrycodes: "in",
    "accept-language": "en",
  });

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return known;
    const remote = (await response.json())
      .map((result) => ({
        displayName: result.display_name,
        latitude: Number(result.lat),
        longitude: Number(result.lon),
        source: "nominatim",
      }))
      .filter((result) => Number.isFinite(result.latitude) && Number.isFinite(result.longitude));

    const unique = [...known, ...remote].filter(
      (result, index, results) =>
        results.findIndex(
          (candidate) =>
            Math.abs(candidate.latitude - result.latitude) < 0.00001 &&
            Math.abs(candidate.longitude - result.longitude) < 0.00001,
        ) === index,
    );
    return unique.slice(0, limit);
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return known;
  }
}

export async function geocodeAddress(address, options = {}) {
  const [result] = await searchAddresses(address, { ...options, limit: 1 });
  return result || null;
}

export async function reverseGeocode(latitude, longitude, { signal } = {}) {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: "jsonv2",
    zoom: "18",
    "accept-language": "en",
  });

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Location lookup failed");
    const result = await response.json();
    return result.display_name || `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`;
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`;
  }
}
