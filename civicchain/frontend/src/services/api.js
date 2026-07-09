import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  timeout: 12000,
});

const statusCycle = ["Open", "Assigned", "Completed", "Verified"];
const categoryCycle = ["pothole", "flooding", "garbage", "streetlight", "water leak"];
const localKey = "civicchain:complaints";

const demoComplaints = [
  ["Open", "pothole", "Deep pothole near Anna Nagar roundabout", "A large pothole is slowing traffic and causing two-wheelers to swerve during peak hours.", "Anna Nagar, Chennai", 0.42],
  ["Assigned", "flooding", "Storm water stagnation on T Nagar service lane", "Rainwater is blocking shop entrances near the bus stop.", "T Nagar, Chennai", 0.58],
  ["Completed", "garbage", "Overflowing garbage bins beside Velachery MRTS", "Waste is spilling onto the pavement near the station entrance.", "Velachery, Chennai", 0.31],
  ["Verified", "streetlight", "Streetlights restored on Adyar 2nd Avenue", "Three lights were repaired along a dark residential stretch.", "Adyar, Chennai", 0.27],
  ["Open", "water leak", "Water leak near Tambaram market road", "A damaged pipeline is leaking continuously and creating slippery conditions.", "Tambaram, Chennai", 0.49],
].map(([status, category, title, description, location, estimated_fund], index) => ({
  id: index + 1,
  complaint_pubkey: `local:${index + 1}`,
  citizen_pubkey: `CitizenDemoWallet${index + 1}`,
  title,
  description,
  location,
  category,
  status,
  estimated_fund,
  photo_url: imageForCategory(category),
  bid_amount: status === "Open" ? null : Number((estimated_fund * 0.86).toFixed(2)),
  contractor_pubkey: status === "Open" ? null : `ContractorDemoWallet${index + 1}`,
  ai_confidence: status === "Verified" ? 0.92 : null,
  ai_reasoning: status === "Verified" ? "Before and after imagery confirms the work was completed." : null,
  payment_released: status === "Verified",
  created_at: new Date().toISOString(),
}));

function isNetworkError(error) {
  return Boolean(error?.isAxiosError && !error.response);
}

function apiMessage(error) {
  return error?.response?.data?.detail || error?.message || "Request failed";
}

function readLocalComplaints() {
  try {
    const stored = window.localStorage.getItem(localKey);
    if (stored) return JSON.parse(stored).map(normalizeComplaint);
    window.localStorage.setItem(localKey, JSON.stringify(demoComplaints));
  } catch {
    return demoComplaints.map(normalizeComplaint);
  }
  return demoComplaints.map(normalizeComplaint);
}

function writeLocalComplaints(items) {
  try {
    window.localStorage.setItem(localKey, JSON.stringify(items));
  } catch {
    // Demo fallback should not fail the user flow when storage is unavailable.
  }
}

function updateLocalComplaint(id, updater) {
  const items = readLocalComplaints();
  const index = items.findIndex((item) => String(item.id) === String(id));
  if (index === -1) throw new Error("Complaint not found");
  items[index] = normalizeComplaint(updater(items[index]), index);
  writeLocalComplaints(items);
  return items[index];
}

export function normalizeComplaint(item, index = 0) {
  const status = item.status || statusCycle[index % statusCycle.length];
  const category = item.category || categoryCycle[index % categoryCycle.length];
  return {
    ...item,
    status,
    category,
    estimated_fund: Number(item.estimated_fund || 0) || 0.35 + (index % 5) * 0.12,
    latitude:
      item.latitude === null || item.latitude === undefined || item.latitude === ""
        ? null
        : Number(item.latitude),
    longitude:
      item.longitude === null || item.longitude === undefined || item.longitude === ""
        ? null
        : Number(item.longitude),
    photo_url: item.photo_url || imageForCategory(category),
    ai_confidence:
      item.ai_confidence === null || item.ai_confidence === undefined
        ? status === "Verified"
          ? 0.91
          : null
        : Number(item.ai_confidence),
    ai_reasoning:
      item.ai_reasoning ||
      (status === "Verified"
        ? "Visual evidence indicates the reported civic issue has been resolved."
        : null),
    bid_amount:
      item.bid_amount === null || item.bid_amount === undefined
        ? status === "Open"
          ? null
          : 0.28 + (index % 4) * 0.1
        : Number(item.bid_amount),
    contractor_pubkey: item.contractor_pubkey || (status === "Open" ? null : "DemoContractorWallet9x8"),
  };
}

export async function getComplaints() {
  try {
    const { data } = await api.get("/complaints");
    return data.map(normalizeComplaint);
  } catch (error) {
    if (isNetworkError(error)) return readLocalComplaints();
    throw new Error(apiMessage(error));
  }
}

export async function getComplaint(id) {
  try {
    const { data } = await api.get(`/complaints/${id}`);
    return normalizeComplaint(data);
  } catch (error) {
    if (isNetworkError(error)) {
      const item = readLocalComplaints().find((complaint) => String(complaint.id) === String(id));
      if (item) return item;
    }
    throw new Error(apiMessage(error));
  }
}

export async function createComplaint(payload) {
  try {
    const { data } = await api.post("/complaint", payload);
    return normalizeComplaint(data);
  } catch (error) {
    if (!isNetworkError(error)) throw new Error(apiMessage(error));
    const items = readLocalComplaints();
    const saved = normalizeComplaint({
      ...payload,
      id: Math.max(0, ...items.map((item) => Number(item.id) || 0)) + 1,
      complaint_pubkey: `local:${crypto.randomUUID?.() || Date.now()}`,
      status: "Open",
      estimated_fund: 0.35,
      created_at: new Date().toISOString(),
    });
    writeLocalComplaints([saved, ...items]);
    return saved;
  }
}

export async function verifyComplaint(payload) {
  const { data } = await api.post("/verify", payload);
  return data;
}

export async function placeBid(id, payload) {
  try {
    const { data } = await api.post(`/complaints/${id}/bid`, payload);
    return normalizeComplaint(data);
  } catch (error) {
    if (!isNetworkError(error)) throw new Error(apiMessage(error));
    return updateLocalComplaint(id, (item) => ({
      ...item,
      status: "Assigned",
      bid_amount: Number(payload.amount),
      estimated_fund: item.estimated_fund || Number(payload.amount),
      contractor_pubkey: payload.contractor_pubkey || "DemoContractorWallet",
    }));
  }
}

export async function submitProof(id, payload) {
  try {
    const { data } = await api.post("/verify", {
      complaint_id: Number(id),
      ...payload,
    });
    return {
      complaint: normalizeComplaint(data.complaint),
      verification: data,
    };
  } catch (error) {
    if (!isNetworkError(error)) throw new Error(apiMessage(error));
    const updated = updateLocalComplaint(id, (item) => ({
      ...item,
      status: payload.proof_text?.toLowerCase().includes("complete") || payload.proof_text?.toLowerCase().includes("fixed") ? "Verified" : "Completed",
      ai_confidence: 0.82,
      ai_reasoning: "Offline demo verification used local proof text because the backend was unavailable.",
    }));
    return {
      complaint: updated,
      verification: {
        verdict: updated.status === "Verified" ? "approved" : "rejected",
        approved: updated.status === "Verified",
        confidence: updated.ai_confidence,
      },
    };
  }
}

export function imageForCategory(category) {
  const encoded = encodeURIComponent(`Chennai civic ${category}`);
  return `https://source.unsplash.com/900x600/?${encoded}`;
}
