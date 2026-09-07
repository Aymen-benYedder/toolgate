import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { endpoints } from "../lib/api";

/**
 * Admin sign-in (spec §10.3 — the only screen behind auth).
 * Default demo credentials: admin@toolgate.dev / changeme123.
 */
export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await endpoints.login(email, password);
      login(res.token, res.email);
      toast.success(`Signed in as ${res.email}`);
      navigate("/policies", { replace: true });
    } catch {
      setError("Invalid email or password");
      toast.error("Invalid email or password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/15 font-mono text-sm font-bold text-emerald-400 ring-1 ring-inset ring-emerald-500/30">
            tg
          </div>
          <span className="font-mono text-lg font-bold text-zinc-100">toolgate</span>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-6">
          <h1 className="font-mono text-xl font-bold">Admin Sign In</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Policy editing requires an admin account.
          </p>

          <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm text-zinc-400">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@toolgate.dev"
                aria-invalid={error ? true : undefined}
                className={`mt-1 w-full rounded-md border bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                  error ? "border-red-500/70" : "border-zinc-700"
                }`}
              />
            </label>
            <label className="block">
              <span className="text-sm text-zinc-400">Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                aria-invalid={error ? true : undefined}
                className={`mt-1 w-full rounded-md border bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                  error ? "border-red-500/70" : "border-zinc-700"
                }`}
              />
            </label>
            {error && (
              <p
                role="alert"
                aria-live="polite"
                className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-4 rounded-md bg-zinc-950/60 px-3 py-2 font-mono text-xs text-zinc-400 ring-1 ring-inset ring-zinc-800">
            demo: admin@toolgate.dev / changeme123
          </p>
        </div>
      </div>
    </div>
  );
}