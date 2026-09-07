import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { endpoints } from "../lib/api";
import type { Condition, Policy, PolicyAction } from "../types";

const ACTION_LABEL: Record<PolicyAction, string> = {
  ALLOW: "Allow",
  BLOCK: "Block",
  REQUIRE_APPROVAL: "Require approval",
};

const ACTION_BADGE: Record<PolicyAction, string> = {
  ALLOW: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30",
  BLOCK: "bg-red-500/10 text-red-400 ring-red-500/30",
  REQUIRE_APPROVAL: "bg-amber-500/10 text-amber-400 ring-amber-500/30",
};

const OPERATORS = [">", "<", ">=", "<=", "==", "!="] as const;

interface FormState {
  name: string;
  description: string;
  toolPattern: string;
  conditionMode: "always" | "field";
  field: string;
  operator: (typeof OPERATORS)[number];
  value: string;
  action: PolicyAction;
  priority: number;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  toolPattern: "*",
  conditionMode: "always",
  field: "amount",
  operator: ">",
  value: "100",
  action: "REQUIRE_APPROVAL",
  priority: 0,
};

function formToCondition(f: FormState): Condition {
  if (f.conditionMode === "always") return { always: true };
  const num = Number(f.value);
  return {
    field: f.field,
    operator: f.operator,
    value: Number.isFinite(num) && f.value.trim() !== "" ? num : f.value,
  };
}

function conditionToForm(c: Condition): Pick<FormState, "conditionMode" | "field" | "operator" | "value"> {
  if ("always" in c && c.always) {
    return { conditionMode: "always", field: "amount", operator: ">", value: "100" };
  }
  return {
    conditionMode: "field",
    field: c.field ?? "amount",
    operator: (c.operator as (typeof OPERATORS)[number]) ?? ">",
    value: String(c.value ?? ""),
  };
}

function conditionSummary(c: Condition): string {
  if ("always" in c && c.always) return "always";
  if ("and" in c && c.and) return `and(${c.and.map(conditionSummary).join(", ")})`;
  if ("or" in c && c.or) return `or(${c.or.map(conditionSummary).join(", ")})`;
  return `${c.field} ${c.operator} ${c.value}`;
}

export function PolicyEditor() {
  const { email, logout } = useAuth();
  const navigate = useNavigate();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null); // null = closed, "new" = create
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Test tool state
  const [testTool, setTestTool] = useState("transfer_funds");
  const [testInput, setTestInput] = useState('{\n  "from": "ACC-10048213",\n  "to": "ACC-77319045",\n  "amount": 5000\n}');
  const [testIncludeDraft, setTestIncludeDraft] = useState(false);
  const [testResult, setTestResult] = useState<{
    action: string;
    matchedPolicyId?: string | null;
    matchedPolicyName?: string | null;
    draftIncluded: boolean;
    evaluatedCount: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await endpoints.policies();
      setPolicies(res.policies);
    } catch {
      toast.error("Failed to load policies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(
    () => [...policies].sort((a, b) => a.priority - b.priority),
    [policies],
  );

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditingId("new");
  };

  const openEdit = (p: Policy) => {
    setForm({
      name: p.name,
      description: p.description ?? "",
      toolPattern: p.toolPattern,
      ...conditionToForm(p.condition),
      action: p.action,
      priority: p.priority,
    });
    setEditingId(p.id);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const body = {
      name: form.name,
      description: form.description || null,
      toolPattern: form.toolPattern,
      condition: formToCondition(form),
      action: form.action,
      priority: form.priority,
    };
    try {
      if (editingId === "new") {
        await endpoints.createPolicy(body);
        toast.success(`Created policy "${form.name}"`);
      } else if (editingId) {
        await endpoints.updatePolicy(editingId, body);
        toast.success(`Updated policy "${form.name}"`);
      }
      setEditingId(null);
      await load();
    } catch {
      toast.error("Failed to save policy");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (p: Policy) => {
    try {
      await endpoints.updatePolicy(p.id, { enabled: !p.enabled });
      await load();
    } catch {
      toast.error("Failed to toggle policy");
    }
  };

  const movePriority = async (p: Policy, dir: -1 | 1) => {
    const idx = sorted.findIndex((x) => x.id === p.id);
    const neighbor = sorted[idx + dir];
    if (!neighbor) return;
    try {
      await Promise.all([
        endpoints.updatePolicy(p.id, { priority: neighbor.priority }),
        endpoints.updatePolicy(neighbor.id, { priority: p.priority }),
      ]);
      await load();
    } catch {
      toast.error("Failed to reorder policies");
    }
  };

  const remove = async (p: Policy) => {
    if (!window.confirm(`Delete policy "${p.name}"?`)) return;
    try {
      await endpoints.deletePolicy(p.id);
      toast.success(`Deleted "${p.name}"`);
      await load();
    } catch {
      toast.error("Failed to delete policy");
    }
  };

  const runTest = async (e: FormEvent) => {
    e.preventDefault();
    let toolInput: Record<string, unknown>;
    try {
      toolInput = JSON.parse(testInput) as Record<string, unknown>;
    } catch {
      toast.error("Test input must be valid JSON");
      return;
    }
    try {
      const res = await endpoints.testPolicy({
        toolName: testTool,
        toolInput,
        draftPolicy: testIncludeDraft
          ? {
              name: form.name || "Draft policy",
              toolPattern: form.toolPattern,
              condition: formToCondition(form),
              action: form.action,
              priority: form.priority,
            }
          : undefined,
      });
      setTestResult({
        ...res.decision,
        draftIncluded: res.draftIncluded,
        evaluatedCount: res.evaluatedCount,
      });
    } catch {
      toast.error("Test failed");
    }
  };

  const signOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-bold">Policy Editor</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Signed in as <span className="font-mono text-zinc-300">{email}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            + New Policy
          </button>
          <button
            type="button"
            onClick={signOut}
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* New / Edit form */}
      {editingId !== null && (
        <form
          onSubmit={(e) => void save(e)}
          className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4"
        >
          <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-zinc-400">
            {editingId === "new" ? "New policy" : "Edit policy"}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block sm:col-span-2">
              <span className="text-sm text-zinc-400">Name</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Block destructive DB operations"
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              />
            </label>
            <label className="block">
              <span className="text-sm text-zinc-400">Tool pattern</span>
              <input
                required
                value={form.toolPattern}
                onChange={(e) => setForm({ ...form, toolPattern: e.target.value })}
                placeholder="delete_*"
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              />
            </label>
            <label className="block">
              <span className="text-sm text-zinc-400">Action</span>
              <select
                value={form.action}
                onChange={(e) => setForm({ ...form, action: e.target.value as PolicyAction })}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <option value="ALLOW">Allow</option>
                <option value="BLOCK">Block</option>
                <option value="REQUIRE_APPROVAL">Require approval</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-zinc-400">Priority (lower = first)</span>
              <input
                type="number"
                min={0}
                max={999}
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm text-zinc-400">Description</span>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional — what this policy protects"
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              />
            </label>
            <div className="sm:col-span-2">
              <span className="text-sm text-zinc-400">Condition</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <select
                  value={form.conditionMode}
                  onChange={(e) =>
                    setForm({ ...form, conditionMode: e.target.value as "always" | "field" })
                  }
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  <option value="always">Always</option>
                  <option value="field">Field condition</option>
                </select>
                {form.conditionMode === "field" && (
                  <>
                    <input
                      value={form.field}
                      onChange={(e) => setForm({ ...form, field: e.target.value })}
                      placeholder="amount"
                      className="w-28 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    />
                    <select
                      value={form.operator}
                      onChange={(e) =>
                        setForm({ ...form, operator: e.target.value as (typeof OPERATORS)[number] })
                      }
                      className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 font-mono text-sm text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    >
                      {OPERATORS.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                    <input
                      value={form.value}
                      onChange={(e) => setForm({ ...form, value: e.target.value })}
                      placeholder="100"
                      className="w-24 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    />
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save policy"}
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Policy table */}
      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 font-mono text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2.5">Priority</th>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">Tool pattern</th>
                <th className="px-3 py-2.5">Condition</th>
                <th className="px-3 py-2.5">Action</th>
                <th className="px-3 py-2.5">Enabled</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                    Loading…
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                    No policies yet — create one.
                  </td>
                </tr>
              ) : (
                sorted.map((p, idx) => (
                  <tr key={p.id} className="border-b border-zinc-800/60 hover:bg-zinc-900/40">
                    <td className="px-3 py-2.5 font-mono text-xs text-zinc-500">{p.priority}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-zinc-100">{p.name}</div>
                      {p.description && (
                        <div className="text-xs text-zinc-500">{p.description}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-sm text-zinc-300">{p.toolPattern}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-zinc-400">
                      {conditionSummary(p.condition)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 font-mono text-xs font-medium ring-1 ring-inset ${ACTION_BADGE[p.action]}`}
                      >
                        {ACTION_LABEL[p.action]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={p.enabled}
                        aria-label={`Toggle ${p.name}`}
                        onClick={() => void toggleEnabled(p)}
                        className={`relative h-5 w-9 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                          p.enabled ? "bg-emerald-500" : "bg-zinc-700"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                            p.enabled ? "left-4.5 translate-x-0" : "left-0.5"
                          }`}
                          style={{ left: p.enabled ? "18px" : "2px" }}
                        />
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => void movePriority(p, -1)}
                          aria-label={`Move ${p.name} up`}
                          className="rounded px-1.5 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={idx === sorted.length - 1}
                          onClick={() => void movePriority(p, 1)}
                          aria-label={`Move ${p.name} down`}
                          className="rounded px-1.5 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(p)}
                          className="rounded px-2 py-1 text-sm text-red-400 hover:bg-red-500/10"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live test tool */}
      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Test this policy
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Run a sample tool call through the engine to see which policy matches and what happens.
        </p>
        <form onSubmit={(e) => void runTest(e)} className="mt-4 grid gap-4 lg:grid-cols-3">
          <label className="block">
            <span className="text-sm text-zinc-400">Tool name</span>
            <input
              required
              value={testTool}
              onChange={(e) => setTestTool(e.target.value)}
              placeholder="transfer_funds"
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            />
          </label>
          <label className="block lg:col-span-2">
            <span className="text-sm text-zinc-400">Tool input (JSON)</span>
            <textarea
              required
              rows={4}
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              spellCheck={false}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-400 lg:col-span-2">
            <input
              type="checkbox"
              checked={testIncludeDraft}
              onChange={(e) => setTestIncludeDraft(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 accent-emerald-500"
            />
            Include the draft policy above (as priority {form.priority})
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-md bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              Run test
            </button>
          </div>
        </form>

        {testResult && (
          <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm text-zinc-400">Result:</span>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 font-mono text-xs font-medium ring-1 ring-inset ${
                  ACTION_BADGE[testResult.action as PolicyAction] ?? ACTION_BADGE.REQUIRE_APPROVAL
                }`}
              >
                {ACTION_LABEL[testResult.action as PolicyAction] ?? testResult.action}
              </span>
              {testResult.matchedPolicyName && (
                <span className="font-mono text-xs text-zinc-400">
                  matched: <span className="text-zinc-200">{testResult.matchedPolicyName}</span>
                </span>
              )}
              {!testResult.matchedPolicyName && (
                <span className="font-mono text-xs text-zinc-500">no policy matched (fail-safe default)</span>
              )}
              <span className="ml-auto font-mono text-xs text-zinc-600">
                {testResult.evaluatedCount} enabled policies
                {testResult.draftIncluded ? " · draft included" : ""}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}