import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  timeout: 12000,
});

const statusCycle = ["Open", "Assigned", "Completed", "Verified"];
const categoryCycle = ["pothole", "flooding", "garbage", "streetlight", "water leak"];

export function normalizeComplaint(item, index = 0) {
  const status = item.status || statusCycle[index % statusCycle.length];
  const category = item.category || categoryCycle[index % categoryCycle.length];
  return {
    ...item,
    status,
    category,
    estimated_fund: Number(item.estimated_fund || 0) || 0.35 + (index % 5) * 0.12,
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
  const { data } = await api.get("/complaints");
  return data.map(normalizeComplaint);
}

export async function getComplaint(id) {
  const { data } = await api.get(`/complaints/${id}`);
  return normalizeComplaint(data);
}

export async function createComplaint(payload) {
  const { data } = await api.post("/complaint", payload);
  return normalizeComplaint(data);
}

export async function verifyComplaint(payload) {
  const { data } = await api.post("/verify", payload);
  return data;
}

export function imageForCategory(category) {
  const encoded = encodeURIComponent(`Chennai civic ${category}`);
  return `https://source.unsplash.com/900x600/?${encoded}`;
}
