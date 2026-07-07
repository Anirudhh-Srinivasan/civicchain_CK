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
    idLabel: "Government ID",
    placeholder: "GovOfficerChennai01",
    pattern: /^(gov|government)[a-z0-9_-]{3,}$/i,
    hint: "Use an ID like GovOfficerChennai01 or government-admin.",
    description: "Monitor grievance resolution, escrow movement, and public accountability.",
    capabilities: ["Review dashboards", "Inspect funds", "Audit timeline"],
  },
};

function isExpired(session) {
  return !session.expiresAt || new Date(session.expiresAt).getTime() <= Date.now();
}

export function getSession() {
  try {
    const stored = window.localStorage.getItem(sessionKey);
    if (!stored) return null;
    const session = JSON.parse(stored);
    if (!roles[session.role] || !session.id) return null;
    if (isExpired(session)) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function validateLogin(role, id) {
  const selected = roles[role];
  const normalized = id.trim();
  if (!selected) return "Choose a valid role.";
  if (!normalized) return `Enter a ${selected.idLabel.toLowerCase()} to continue.`;
  if (!selected.pattern.test(normalized)) return selected.hint;
  return "";
}

export function saveSession(role, id) {
  const error = validateLogin(role, id);
  if (error) throw new Error(error);
  const now = new Date();
  const session = {
    role,
    id: id.trim(),
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
