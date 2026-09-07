import type {
  AgentStatus,
  AuditResponse,
  DecisionResponse,
  LiveAgentResult,
  PoliciesResponse,
  Policy,
  RequestsResponse,
  ScenarioResult,
  Stats,
} from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const TOKEN_KEY = "toolgate_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(res.status, body?.message ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Typed endpoint helpers — one function per backend route. */
export const endpoints = {
  health: () => api.get<{ status: string; service: string; demoMode: boolean }>("/health"),

  requests: (params?: {
    status?: string;
    agentName?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.agentName) q.set("agentName", params.agentName);
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    const qs = q.toString();
    return api.get<RequestsResponse>(`/api/requests${qs ? `?${qs}` : ""}`);
  },

  pending: () => api.get<RequestsResponse>("/api/requests/pending"),

  approve: (id: string) => api.post<DecisionResponse>(`/api/requests/${id}/approve`),
  reject: (id: string, reason?: string) =>
    api.post<DecisionResponse>(`/api/requests/${id}/reject`, { reason }),

  audit: (params?: { requestId?: string; event?: string; page?: number; pageSize?: number }) => {
    const q = new URLSearchParams();
    if (params?.requestId) q.set("requestId", params.requestId);
    if (params?.event) q.set("event", params.event);
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    const qs = q.toString();
    return api.get<AuditResponse>(`/api/audit${qs ? `?${qs}` : ""}`);
  },

  stats: () => api.get<Stats>("/api/stats"),

  policies: () => api.get<PoliciesResponse>("/api/policies"),

  createPolicy: (body: unknown) => api.post<{ policy: Policy }>("/api/policies", body),
  updatePolicy: (id: string, body: unknown) =>
    api.patch<{ policy: Policy }>(`/api/policies/${id}`, body),
  deletePolicy: (id: string) => api.del<{ ok: boolean }>(`/api/policies/${id}`),

  testPolicy: (body: { toolName: string; toolInput: Record<string, unknown>; draftPolicy?: unknown }) =>
    api.post<{
      decision: { action: string; matchedPolicyId?: string | null; matchedPolicyName?: string | null };
      draftIncluded: boolean;
      evaluatedCount: number;
    }>("/api/policies/test", body),

  login: (email: string, password: string) =>
    api.post<{ token: string; email: string }>("/api/auth/login", { email, password }),

  runScenario: (scenarioId: string) =>
    api.post<ScenarioResult>(`/api/demo/scenario/${scenarioId}`),

  resetDemo: () =>
    api.post<{
      ok: boolean;
      adminEmail: string;
      policyCount: number;
      requestCount: number;
      auditEventCount: number;
      statusMix: Record<string, number>;
    }>("/api/demo/reset"),

  agentStatus: () => api.get<AgentStatus>("/api/agent/status"),

  /** Live Agent run — can take up to ~60s while pending calls await approval. */
  runAgent: (instruction: string, signal?: AbortSignal) =>
    request<LiveAgentResult>("/api/agent/run", {
      method: "POST",
      body: JSON.stringify({ instruction }),
      signal,
    }),
};