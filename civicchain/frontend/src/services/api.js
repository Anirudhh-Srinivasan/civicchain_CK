import axios from "axios";
import { isDemoMode } from "./auth";

const defaultApiUrl = import.meta.env.DEV
  ? "http://localhost:8000"
  : "https://civicchain-backend-production.up.railway.app";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || defaultApiUrl,
  timeout: 12000,
});

const statusCycle = ["Open", "Assigned", "Completed", "Verified"];
const categoryCycle = ["pothole", "flooding", "garbage", "streetlight", "water leak"];
const localKey = "civicchain:complaints";
const apiOrigin = api.defaults.baseURL.replace(/\/$/, "");

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
  } catch {
    return [];
  }
  return [];
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
  const demoSeed = isDemoMode();
  const bids = Array.isArray(item.bids)
    ? item.bids.map((bid) => ({
        ...bid,
        amount: Number(bid.amount),
      })).filter((bid) => Number.isFinite(bid.amount))
    : [];
  const lowestBid = item.lowest_bid || bids.reduce((best, bid) => (!best || bid.amount < best.amount ? bid : best), null);

  return {
    ...item,
    status,
    category,
    estimated_fund:
      item.estimated_fund !== undefined && item.estimated_fund !== null
        ? Number(item.estimated_fund)
        : (demoSeed ? 0.35 + (index % 5) * 0.12 : 0.0),
    latitude:
      item.latitude === null || item.latitude === undefined || item.latitude === ""
        ? null
        : Number(item.latitude),
    longitude:
      item.longitude === null || item.longitude === undefined || item.longitude === ""
        ? null
        : Number(item.longitude),
    photo_url: resolvePhotoUrl(item.photo_url || imageForCategory(category)),
    ai_confidence:
      item.ai_confidence === null || item.ai_confidence === undefined
        ? status === "Verified" && demoSeed
          ? 0.91
          : null
        : Number(item.ai_confidence),
    ai_reasoning:
      item.ai_reasoning ||
      (status === "Verified" && demoSeed
        ? "Visual evidence indicates the reported civic issue has been resolved."
        : null),
    ai_source: item.ai_source || (status === "Verified" && demoSeed ? "groq" : null),
    verification_status:
      item.verification_status || (status === "Verified" && demoSeed ? "approved" : status === "Completed" && demoSeed ? "queued" : null),
    verification_checked_at: item.verification_checked_at || null,
    proof_hash: item.proof_hash || null,
    bid_amount:
      item.bid_amount === null || item.bid_amount === undefined
        ? status === "Open" || !demoSeed
          ? null
          : 0.28 + (index % 4) * 0.1
        : Number(item.bid_amount),
    contractor_pubkey:
      item.contractor_pubkey ||
      (status === "Open" || !demoSeed ? null : "DemoContractorWallet9x8"),
    bid_deadline: item.bid_deadline || null,
    bids,
    bid_count: item.bid_count ?? bids.length,
    lowest_bid: lowestBid
      ? {
          ...lowestBid,
          amount: Number(lowestBid.amount),
        }
      : null,
    bidding_closed: Boolean(item.bidding_closed || (item.bid_deadline && Date.now() > new Date(item.bid_deadline).getTime())),
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
    const photoFile = payload.photo || payload.photo_file;
    let data;
    if (photoFile) {
      const form = new FormData();
      appendFormValue(form, "title", payload.title);
      appendFormValue(form, "description", payload.description);
      appendFormValue(form, "location", payload.location);
      appendFormValue(form, "category", payload.category);
      appendFormValue(form, "citizen_pubkey", payload.citizen_pubkey);
      appendFormValue(form, "latitude", payload.latitude);
      appendFormValue(form, "longitude", payload.longitude);
      appendFormValue(form, "bid_deadline", payload.bid_deadline);
      form.append("photo", photoFile);
      ({ data } = await api.post("/complaint-upload", form));
    } else {
      ({ data } = await api.post("/complaint", payload));
    }
    return normalizeComplaint(data);
  } catch (error) {
    if (!isNetworkError(error)) throw new Error(apiMessage(error));
    const items = readLocalComplaints();
    const photoFile = payload.photo || payload.photo_file;
    const saved = normalizeComplaint({
      ...payload,
      photo_url: photoFile ? URL.createObjectURL(photoFile) : payload.photo_url,
      id: Math.max(0, ...items.map((item) => Number(item.id) || 0)) + 1,
      complaint_pubkey: `local:${crypto.randomUUID?.() || Date.now()}`,
      status: "Open",
      estimated_fund: 0.35,
      bid_deadline: payload.bid_deadline,
      bids: [],
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
    const complaint = normalizeComplaint(data);
    const submittedBid = {
      amount: Number(payload.amount),
      contractor_pubkey: payload.contractor_pubkey || "DemoContractorWallet",
      created_at: new Date().toISOString(),
    };
    const bids = complaint.bids?.length ? complaint.bids : [submittedBid];
    const lowest = bids.reduce((best, bid) => (!best || bid.amount < best.amount ? bid : best), null);
    return {
      ...complaint,
      status: "Open",
      contractor_pubkey: null,
      bids,
      bid_count: bids.length,
      lowest_bid: lowest,
    };
  } catch (error) {
    if (!isNetworkError(error)) throw new Error(apiMessage(error));
    return updateLocalComplaint(id, (item) => ({
      ...item,
      bid_amount: Number(payload.amount),
      estimated_fund: item.estimated_fund || Number(payload.amount),
      bids: [
        ...(item.bids || []).filter((bid) => bid.contractor_pubkey !== payload.contractor_pubkey),
        {
          amount: Number(payload.amount),
          contractor_pubkey: payload.contractor_pubkey || "DemoContractorWallet",
          created_at: new Date().toISOString(),
        },
      ],
    }));
  }
}

export async function acceptLowestBid(id, payload = {}) {
  try {
    const { data } = await api.post(`/complaints/${id}/accept-lowest-bid`, payload);
    return normalizeComplaint(data);
  } catch (error) {
    if (!isNetworkError(error)) throw new Error(apiMessage(error));
    return updateLocalComplaint(id, (item) => {
      const bids = item.bids || [];
      const lowest = bids.reduce((best, bid) => (!best || bid.amount < best.amount ? bid : best), null);
      if (!lowest) throw new Error("No contractor bids are available");
      return {
        ...item,
        status: "Assigned",
        bid_amount: Number(lowest.amount),
        estimated_fund: Number(lowest.amount),
        contractor_pubkey: lowest.contractor_pubkey,
      };
    });
  }
}

export async function submitProof(id, payload) {
  try {
    const beforeFile = payload.before_image || payload.beforeImage || payload.before;
    const afterFile = payload.after_image || payload.afterImage || payload.after;
    let data;

    if (beforeFile && afterFile) {
      const form = new FormData();
      form.append("before_image", beforeFile);
      form.append("after_image", afterFile);
      appendFormValue(form, "complaint_text", payload.complaint_text);
      appendFormValue(form, "proof_text", payload.proof_text);
      appendFormValue(
        form,
        "proof_hash",
        payload.proof_hash || (await createProofHash(id, payload, beforeFile, afterFile)),
      );
      appendFormValue(form, "complaint_pubkey", payload.complaint_pubkey);
      appendFormValue(form, "bid_pubkey", payload.bid_pubkey);
      appendFormValue(form, "escrow_pubkey", payload.escrow_pubkey);
      appendFormValue(form, "contractor_pubkey", payload.contractor_pubkey);
      ({ data } = await api.post(`/complaints/${id}/verify-proof`, form));
    } else {
      const {
        before_image,
        after_image,
        beforeImage,
        afterImage,
        before,
        after,
        ...jsonPayload
      } = payload;
      ({ data } = await api.post("/verify", {
        complaint_id: Number(id),
        ...jsonPayload,
        before_image_name: beforeFile?.name,
        after_image_name: afterFile?.name,
      }));
    }

    return {
      complaint: data.complaint ? normalizeComplaint(data.complaint) : null,
      verification: data,
    };
  } catch (error) {
    if (!isNetworkError(error)) throw new Error(apiMessage(error));
    const updated = updateLocalComplaint(id, (item) => ({
      ...item,
      status: "Completed",
      ai_confidence: null,
      ai_reasoning: "Proof was saved locally, but AI verification needs the backend.",
      verification_status: "queued",
    }));
    return {
      complaint: updated,
      verification: {
        verdict: "rejected",
        approved: false,
        requires_human_review: true,
        confidence: 0,
        ai_result: {
          reasoning: updated.ai_reasoning,
        },
      },
    };
  }
}

function appendFormValue(form, key, value) {
  if (value === null || value === undefined) return;
  const normalized = String(value).trim();
  if (normalized) form.append(key, normalized);
}

async function createProofHash(id, payload, beforeFile, afterFile) {
  const fallback = `${id}:${beforeFile.name}:${beforeFile.size}:${afterFile.name}:${afterFile.size}:${payload.proof_text || ""}`;
  if (typeof crypto === "undefined" || !crypto.subtle) return fallback;

  const encoder = new TextEncoder();
  const metadata = encoder.encode(
    JSON.stringify({
      id,
      proof_text: payload.proof_text || "",
      before: {
        name: beforeFile.name,
        size: beforeFile.size,
        lastModified: beforeFile.lastModified,
      },
      after: {
        name: afterFile.name,
        size: afterFile.size,
        lastModified: afterFile.lastModified,
      },
    }),
  );
  const beforeBytes = new Uint8Array(await beforeFile.arrayBuffer());
  const afterBytes = new Uint8Array(await afterFile.arrayBuffer());
  const combined = new Uint8Array(metadata.length + beforeBytes.length + afterBytes.length);
  combined.set(metadata, 0);
  combined.set(beforeBytes, metadata.length);
  combined.set(afterBytes, metadata.length + beforeBytes.length);
  const digest = await crypto.subtle.digest("SHA-256", combined);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function resolvePhotoUrl(url) {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:") || url.startsWith("data:")) return url;
  return `${apiOrigin}${url.startsWith("/") ? url : `/${url}`}`;
}
export function imageForCategory(category) {
  const encoded = encodeURIComponent(`Chennai civic ${category}`);
  return `https://source.unsplash.com/900x600/?${encoded}`;
}

