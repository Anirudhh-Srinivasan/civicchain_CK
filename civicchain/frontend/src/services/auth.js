const sessionKey = "civicchain:session";
const auditKey = "civicchain:login-audit";
const sessionDurationMs = 8 * 60 * 60 * 1000;

export const roles = {
  citizen: {
    label: "Citizen",
    path: "/citizen",
    idLabel: "Citizen ID",
    placeholder: "CitizenDemoWallet01",
    pattern: /^citizen[a-z0-9_-]{3,}$/i,
    hint: "Use an ID like CitizenDemoWallet01 or citizen-ward-12.",
    description: "Report local issues, track your complaints, and review contractor progress.",
    capabilities: ["Submit complaints", "Track status", "View civic map"],
  },
  contractor: {
    label: "Contractor",
    path: "/contractor",
    idLabel: "Contractor ID",
    placeholder: "ContractorDemoWallet01",
    pattern: /^contractor[a-z0-9_-]{3,}$/i,
    hint: "Use an ID like ContractorDemoWallet01 or contractor-zone-a.",
    description: "Bid on open work orders, submit proof, and follow payment progress.",
    capabilities: ["Place bids", "Upload proof", "Track payouts"],
  },
  government: {
    label: "Government",
    path: "/government",
    idLabel: "Government Officer ID",
    placeholder: "GOV-CHENNAI-01",
    pattern: /^(GOV|TN)-[A-Z0-9-]{4,}$/i,
    hint: "Use an official demo credential such as GOV-CHENNAI-01.",
    description: "Monitor grievance resolution, escrow movement, and public accountability.",
    capabilities: ["Review dashboards", "Inspect funds", "Audit timeline"],
  },
};

const citizenIdKey = "civicchain:citizen-id";
const citizenIdPattern = /^CTZ-[A-Z0-9]{6}$/;
const solanaPublicKeyPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const contractorCredibilityThreshold = 60;

export function calculateContractorCredibility(profile = {}, wallet = "") {
  let score = 0;
  if (solanaPublicKeyPattern.test(wallet.trim())) score += 30;
  if (/^[A-Z0-9][A-Z0-9/-]{5,}$/i.test((profile.registrationNumber || "").trim())) score += 25;
  score += Math.min(20, Math.max(0, Number(profile.yearsExperience) || 0) * 4);
  score += Math.min(15, Math.max(0, Number(profile.completedProjects) || 0) * 3);
  if (profile.insured) score += 10;
  return Math.round(score);
}

export function isDemoMode() {
  return import.meta.env.VITE_ENABLE_DEMO_SEED !== "false";
}

export function generateCitizenId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `CTZ-${code}`;
}

export function getSavedCitizenId() {
  try {
    return window.localStorage.getItem(citizenIdKey);
  } catch {
    return null;
  }
}

export function saveCitizenId(id) {
  window.localStorage.setItem(citizenIdKey, id);
}

function isExpired(session) {
  return !session.expiresAt || new Date(session.expiresAt).getTime() <= Date.now();
}

export function getSession() {
  try {
    const stored = window.localStorage.getItem(sessionKey);
    if (!stored) return null;
    const session = JSON.parse(stored);
    if (!roles[session.role] || !session.id) return null;
    if (session.role === "government" && !session.profile?.department) return null;
    if (session.role === "contractor" && Number(session.profile?.credibilityScore) < contractorCredibilityThreshold) return null;
    if (isExpired(session)) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function validateLogin(role, id, options = {}) {
  const selected = roles[role];
  const normalized = id.trim();
  if (!selected) return "Choose a valid role.";

  // Citizens use a generated ID instead of a wallet.
  if (role === "citizen") {
    if (!normalized) return "Enter your Citizen ID, or generate a new one below.";
    if (citizenIdPattern.test(normalized)) return "";
    const demoSeed = isDemoMode();
    if (demoSeed && selected.pattern.test(normalized)) return "";
    return "Enter a valid Citizen ID (e.g. CTZ-AB12CD), or generate a new one below.";
  }

  if (role === "government") {
    if (!normalized) return "Enter your Government Officer ID.";
    if (!selected.pattern.test(normalized)) return selected.hint;
    if (!options.department) return "Select the officer's department.";
    return "";
  }

  if (!normalized) return "Connect your Phantom wallet to continue.";
  if (!solanaPublicKeyPattern.test(normalized)) {
    return "A valid Phantom/Solana wallet is required.";
  }

  if (role === "contractor") {
    const profile = options.contractorProfile || {};
    if (!(profile.businessName || "").trim()) return "Enter the registered contractor or business name.";
    if (!/^[A-Z0-9][A-Z0-9/-]{5,}$/i.test((profile.registrationNumber || "").trim())) {
      return "Enter a valid contractor registration or licence number.";
    }
    if (!profile.declarationAccepted) return "Confirm the contractor declaration before continuing.";
    const score = calculateContractorCredibility(profile, normalized);
    if (score < contractorCredibilityThreshold) {
      return `Contractor credibility score must be at least ${contractorCredibilityThreshold}. Current score: ${score}.`;
    }
  }

  return "";
}


export function saveSession(role, id, options = {}) {
  const error = validateLogin(role, id, options);
  if (error) throw new Error(error);
  const now = new Date();
  const session = {
    role,
    id: id.trim(),
    profile: role === "government"
      ? { department: options.department }
      : role === "contractor"
        ? {
            ...options.contractorProfile,
            credibilityScore: calculateContractorCredibility(options.contractorProfile, id),
            screeningStatus: "pre-screened",
          }
        : undefined,
    signedInAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + sessionDurationMs).toISOString(),
  };
  window.localStorage.setItem(sessionKey, JSON.stringify(session));
  recordLogin(session);
  return session;
}

export function clearSession() {
  window.localStorage.removeItem(sessionKey);
}

export function getLoginAudit() {
  try {
    return JSON.parse(window.localStorage.getItem(auditKey) || "[]");
  } catch {
    return [];
  }
}

function recordLogin(session) {
  const entry = {
    role: session.role,
    id: session.id,
    at: session.signedInAt,
  };
  const audit = [entry, ...getLoginAudit()].slice(0, 5);
  window.localStorage.setItem(auditKey, JSON.stringify(audit));
}

export function pathForRole(role) {
  return roles[role]?.path || "/login";
}
