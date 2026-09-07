import { useState } from "react";
import toast from "react-hot-toast";
import { endpoints } from "../lib/api";

const SCENARIOS = [
  {
    id: "rogue_delete",
    label: "Rogue delete",
    desc: "drop_table → auto-blocked",
    icon: "🗑",
  },
  {
    id: "large_transfer",
    label: "Large transfer",
    desc: "transfer_funds $5,000 → pending",
    icon: "💸",
  },
  {
    id: "pii_snoop",
    label: "PII snoop",
    desc: "read_user_pii → pending",
    icon: "🔍",
  },
] as const;

/**
 * "Simulate a risky agent action" (spec §9.3) — dropdown of the three
 * scripted replay scenarios. Each fires POST /api/demo/scenario/:id and
 * toasts the outcome; pending scenarios surface as cards via the socket.
 */
export function ScenarioReplayButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string) => {
    setBusy(id);
    setOpen(false);
    try {
      const r = await endpoints.runScenario(id);
      if (r.expected === "BLOCKED") {
        toast.success(`Scenario: ${r.message}`);
      } else {
        toast(`Scenario: ${r.message}`, { icon: "⏳" });
      }
    } catch {
      toast.error("Scenario failed to trigger");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-md bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span aria-hidden="true">▶</span>
        Simulate a risky agent action
        <span aria-hidden="true" className="text-zinc-500">
          ▾
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl shadow-black/40"
          >
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                role="menuitem"
                type="button"
                disabled={busy !== null}
                onClick={() => void run(s.id)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-800/80 disabled:opacity-50"
              >
                <span aria-hidden="true" className="mt-0.5 text-base">
                  {s.icon}
                </span>
                <span>
                  <span className="block font-mono text-sm font-semibold text-zinc-100">
                    {s.label}
                  </span>
                  <span className="block text-xs text-zinc-500">{s.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}