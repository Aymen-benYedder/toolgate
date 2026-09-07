import type { RequestStatus } from "../types";
import { statusMeta } from "../lib/format";

/** Status pill — icon + label so color is never the only signal (§12 a11y). */
export function StatusBadge({ status }: { status: RequestStatus }) {
  const meta = statusMeta(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-xs font-medium ring-1 ring-inset ${meta.badge}`}
    >
      <span aria-hidden="true">{meta.icon}</span>
      {meta.label}
    </span>
  );
}