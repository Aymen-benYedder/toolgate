import type {
  AuditResponse,
  DecisionResponse,
  PoliciesResponse,
  RequestsResponse,
  ScenarioResult,
  Stats,
} from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "";

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
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
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

  runScenario: (scenarioId: string) =>
    api.post<ScenarioResult>(`/api/demo/scenario/${scenarioId}`),
};