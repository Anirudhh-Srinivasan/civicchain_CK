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

export function coordinatesFor(location = "", id = 0) {
  const match = Object.entries(chennaiLocations).find(([name]) =>
    location.toLowerCase().includes(name.toLowerCase()),
  );
  if (match) return match[1];
  return [13.0827 + (id % 5) * 0.012, 80.2707 - (id % 4) * 0.016];
}
