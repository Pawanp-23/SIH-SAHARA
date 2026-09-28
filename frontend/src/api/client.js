// Thin fetch wrapper: one cached demo token per user, purpose-of-use header, uniform errors.

export class ApiError extends Error {
  constructor(status, code, message, requestId) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

const tokens = new Map();

// Caches the in-flight promise, so parallel calls for one user share a single login.
function token(username) {
  if (!tokens.has(username)) {
    const p = login(username).catch((e) => { tokens.delete(username); throw e; });
    tokens.set(username, p);
  }
  return tokens.get(username);
}

async function login(username) {
  const res = await fetch("/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) throw new ApiError(res.status, "login_failed", "Could not sign in to the demo API. Is the backend running?");
  const { access_token } = await res.json();
  return access_token;
}

export async function api(path, { as, purpose, method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (as) headers.Authorization = `Bearer ${await token(as)}`;
  if (purpose) headers["X-Purpose-Of-Use"] = purpose;
  let res;
  try {
    res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, "network", "Cannot reach the SAHARA API. Start the backend on port 8000.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || {};
    throw new ApiError(res.status, e.code || "error", e.message || `Request failed (${res.status})`, e.request_id);
  }
  return data;
}

export const USERS = {
  welfare: "welfare.3bn",
  commander: "cmdr.3bn",
  personnel: "p104",
  auditor: "auditor",
};
