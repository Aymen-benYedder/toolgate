# AgentGate — Full Build Specification

**Purpose of this document:** This is a complete, unambiguous implementation spec for a coding agent (e.g. Claude Code) to build end-to-end without asking clarifying questions. Every ambiguous decision has been pre-made below. If the agent encounters a gap not covered here, it should choose the simplest option consistent with the stated goals and continue — not stop to ask.

**Project name:** AgentGate — "A firewall for AI agents." (Agent may rename in code comments as `agentgate` for package/repo names.)

---

## 1. Product Goals (read first — these drive every decision below)

1. **Portfolio artifact for an "AI Full-Stack Engineer" job search.** Priority order: (1) looks impressive and current to a recruiter/hiring manager skimming for 60 seconds, (2) is genuinely functional and technically sound, (3) is easy to build (avoid gold-plating).
2. **Must have a public, zero-setup live demo.** A visitor with no account, no API key, and no terminal must be able to open a URL and both *watch* and *interact with* the product within 10 seconds of landing.
3. **Must be trivially easy for a technical evaluator (or the candidate, in an interview) to run locally.** One command, no manual config beyond copying an `.env.example`.
4. **Must not require any real external AI API cost to demo.** The public-facing demo runs on simulated/mocked agent traffic by default. A real LLM integration (Anthropic API) is included as a secondary, clearly-labeled "Live Agent Mode" for depth, but the primary demo experience never depends on someone's API key working.

---

## 2. What We're Building — One-Paragraph Summary

AgentGate is a security/governance middleware for AI agents that use the Model Context Protocol (MCP). It sits between an AI agent and the tools/databases it wants to call. Every tool call is intercepted, evaluated against a configurable policy engine (JSON-based rules — no custom DSL/parser), and either auto-allowed, auto-blocked, or paused and routed to a human-in-the-loop dashboard for Approve/Reject. Every decision and its full context is written to an audit log. The system ships with a demo mode that simulates a realistic AI agent generating a continuous stream of tool calls against a fake company database, so the product is always "alive" and testable without any setup.

---

## 3. Architecture Overview

```
                         ┌─────────────────────────────┐
                         │   Simulated / Real AI Agent  │
                         │  (demo generator OR real     │
                         │   Anthropic API agent)       │
                         └───────────────┬─────────────┘
                                         │ MCP tool-call request
                                         ▼
                         ┌─────────────────────────────┐
                         │      AgentGate Proxy         │
                         │   (Node.js / TypeScript)     │
                         │  - Intercepts tool calls     │
                         │  - Runs Policy Engine        │
                         │  - Emits WebSocket events     │
                         └───────┬───────────┬─────────┘
                                 │           │
                    ALLOW / BLOCK│           │PENDING (needs approval)
                                 ▼           ▼
                    ┌─────────────────┐   ┌──────────────────────┐
                    │  Mock Company   │   │   Postgres/SQLite:    │
                    │  DB (sandbox)   │   │   pending_requests    │
                    └─────────────────┘   └──────────┬───────────┘
                                                       │ WebSocket push
                                                       ▼
                                          ┌───────────────────────────┐
                                          │  React Dashboard (Vite +  │
                                          │  Tailwind)                │
                                          │  - Live feed              │
                                          │  - Approve/Reject         │
                                          │  - Audit log viewer       │
                                          │  - Policy editor           │
                                          └───────────────────────────┘
                                                       │
                                                       ▼
                                          ┌───────────────────────────┐
                                          │   Postgres/SQLite:         │
                                          │   audit_log                │
                                          └───────────────────────────┘
```

All decisions (allow/block/pending/approved/rejected) are logged to `audit_log` regardless of outcome.

---

## 4. Tech Stack (fixed — do not substitute without reason)

| Layer | Choice | Notes |
|---|---|---|
| Backend runtime | Node.js 20+, TypeScript | strict mode on |
| Backend framework | Express (or Fastify — agent's choice, Express if unsure) | REST + WebSocket |
| Realtime | `ws` or Socket.IO | Socket.IO preferred — simpler client reconnect handling |
| Database | PostgreSQL (production) with Prisma ORM; SQLite fallback for pure local/dev via same Prisma schema | Do NOT use MongoDB — relational data (policies, requests, audit rows) fits SQL better and Postgres is what any serious recruiter expects to see |
| Frontend | React + Vite + TypeScript | not Next.js — this is not SEO-driven, Vite is faster to build and simpler to deploy as a static site |
| Styling | Tailwind CSS | use shadcn/ui component patterns for polish (cards, badges, dialogs, toasts) |
| Charts (audit stats) | Recharts | small "requests over time" / "allow vs block" chart on dashboard home |
| Auth (dashboard) | Simple hardcoded demo-mode toggle + optional single-admin login (email/password, JWT, bcrypt) — NOT multi-tenant, NOT OAuth. Keep minimal. | Dashboard is publicly viewable in demo mode without login; a "Sign in as Admin" is optional and only needed to edit policies |
| Real agent integration | Anthropic API (`@anthropic-ai/sdk`) using tool use / MCP client, optional, feature-flagged | Only activates if `ANTHROPIC_API_KEY` env var is present |
| Containerization | Docker + docker-compose | single `docker-compose up` must start proxy + dashboard + db + demo-generator |
| Deployment target | Backend+DB: Railway or Render (free tier). Frontend: Vercel or Netlify (static build) | Document both in README |

---

## 5. Repository Structure

```
agentgate/
├── docker-compose.yml
├── .env.example
├── README.md
├── packages/
│   ├── proxy/                     # Node/TS backend
│   │   ├── src/
│   │   │   ├── server.ts          # Express app entry
│   │   │   ├── mcp/
│   │   │   │   ├── interceptor.ts # core tool-call interception logic
│   │   │   │   └── types.ts       # MCP-shaped request/response types
│   │   │   ├── policy/
│   │   │   │   ├── engine.ts      # evaluates a tool call against policies
│   │   │   │   ├── defaultPolicies.json
│   │   │   │   └── types.ts
│   │   │   ├── db/
│   │   │   │   ├── prisma/schema.prisma
│   │   │   │   └── client.ts
│   │   │   ├── routes/
│   │   │   │   ├── requests.ts    # pending/approve/reject endpoints
│   │   │   │   ├── policies.ts    # CRUD for policies
│   │   │   │   ├── audit.ts       # audit log query endpoints
│   │   │   │   └── auth.ts        # admin login
│   │   │   ├── realtime/
│   │   │   │   └── socket.ts      # Socket.IO event emitters
│   │   │   ├── demo/
│   │   │   │   ├── generator.ts   # simulated agent traffic generator
│   │   │   │   ├── scenarios.ts   # scripted "attack scenarios" for the Replay button
│   │   │   │   └── mockDb.ts      # in-memory/sqlite fake company DB (users, transactions, orders)
│   │   │   ├── agent/
│   │   │   │   └── liveAgent.ts   # optional real Anthropic-powered agent
│   │   │   └── middleware/
│   │   │       └── errorHandler.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── dashboard/                 # React frontend
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── pages/
│       │   │   ├── LiveFeed.tsx       # main landing view — the "wow" screen
│       │   │   ├── AuditLog.tsx
│       │   │   ├── PolicyEditor.tsx
│       │   │   └── Login.tsx
│       │   ├── components/
│       │   │   ├── PendingRequestCard.tsx
│       │   │   ├── RequestTimeline.tsx
│       │   │   ├── StatsBar.tsx
│       │   │   ├── ScenarioReplayButton.tsx
│       │   │   └── DemoModeBanner.tsx
│       │   ├── hooks/
│       │   │   └── useSocket.ts
│       │   └── lib/api.ts
│       ├── package.json
│       └── vite.config.ts
└── scripts/
    └── seed.ts                    # seeds default policies + fake historical audit data
```

---

## 6. Data Model (Prisma schema — implement exactly)

```prisma
model Policy {
  id          String   @id @default(cuid())
  name        String
  description String?
  toolPattern String   // e.g. "delete_*", "transfer_funds", "*" for all
  condition   Json      // e.g. { "field": "amount", "operator": ">", "value": 100 } or { "always": true }
  action      String    // "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL"
  enabled     Boolean  @default(true)
  priority    Int      @default(0) // lower number = evaluated first
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model ToolCallRequest {
  id            String   @id @default(cuid())
  agentName     String   // e.g. "demo-agent", "claude-live-agent"
  toolName      String   // e.g. "delete_user_record"
  toolInput     Json     // arbitrary params of the call
  status        String   // "PENDING" | "APPROVED" | "REJECTED" | "AUTO_ALLOWED" | "AUTO_BLOCKED"
  matchedPolicyId String?
  decidedBy     String?  // "system" | "admin" | admin user id
  reasoning     String?  // agent's stated reasoning for the call, if provided
  result        Json?    // what happened after execution (mock DB response)
  createdAt     DateTime @default(now())
  decidedAt     DateTime?
}

model AuditLog {
  id          String   @id @default(cuid())
  requestId   String
  event       String   // "REQUEST_RECEIVED" | "POLICY_EVALUATED" | "APPROVED" | "REJECTED" | "EXECUTED" | "BLOCKED"
  detail      Json
  createdAt   DateTime @default(now())
}

model AdminUser {
  id           String @id @default(cuid())
  email        String @unique
  passwordHash String
  createdAt    DateTime @default(now())
}
```

---

## 7. Policy Engine Spec (the "genius part" — keep implementation simple)

- **No custom rule language/parser.** Policies are stored as structured JSON rows (see `Policy` model above) and evaluated by a plain TypeScript function — not a DSL interpreter. This keeps implementation to roughly a day of work while still demoing as "a configurable rules engine" in the UI.
- **Evaluation order:** policies sorted by `priority` ascending; first matching enabled policy wins. If no policy matches, default action is `REQUIRE_APPROVAL` (fail-safe, never fail-open).
- **`toolPattern` matching:** simple glob support (`*` wildcard only, via a tiny helper — no regex exposed to the user).
- **`condition` schema (keep to these operators only):**
  ```ts
  type Condition =
    | { always: true }
    | { field: string; operator: ">" | "<" | ">=" | "<=" | "==" | "!="; value: number | string }
    | { and: Condition[] }
    | { or: Condition[] };
  ```
  `field` is a dot-path into `toolInput` (e.g. `"amount"`, `"target.table"`).
- **Default seed policies** (implement these exactly in `defaultPolicies.json`, loaded by `scripts/seed.ts`):
  1. `name: "Block destructive DB operations"` — `toolPattern: "delete_*"` OR `"drop_*"` (two policies) — `condition: { always: true }` — `action: "BLOCK"` — `priority: 1`
  2. `name: "Approve large transfers"` — `toolPattern: "transfer_funds"` — `condition: { field: "amount", operator: ">", value: 100 }` — `action: "REQUIRE_APPROVAL"` — `priority: 2`
  3. `name: "Auto-allow read operations"` — `toolPattern: "get_*"` OR `"read_*"` OR `"list_*"` — `condition: { always: true }` — `action: "ALLOW"` — `priority: 3`
  4. `name: "Flag sensitive data access"` — `toolPattern: "read_user_pii"` — `condition: { always: true }` — `action: "REQUIRE_APPROVAL"` — `priority: 1`
  5. `name: "Default catch-all"` — `toolPattern: "*"` — `condition: { always: true }` — `action: "REQUIRE_APPROVAL"` — `priority: 99`

---

## 8. MCP Proxy Server Spec

- Implements a minimal MCP-compatible server: accepts `tools/list` and `tools/call` JSON-RPC-shaped requests (per MCP spec) on `POST /mcp`.
- On `tools/call`:
  1. Log `REQUEST_RECEIVED` to `AuditLog`.
  2. Create `ToolCallRequest` row with status `PENDING` initially.
  3. Run Policy Engine → get decision.
  4. Log `POLICY_EVALUATED`.
  5. If `ALLOW`: execute against mock DB (or real downstream tool if configured), set status `AUTO_ALLOWED`, log `EXECUTED`, return result immediately.
  6. If `BLOCK`: set status `AUTO_BLOCKED`, log `BLOCKED`, return an MCP error response to the agent explaining the block and which policy caused it.
  7. If `REQUIRE_APPROVAL`: leave status `PENDING`, emit a `new_pending_request` Socket.IO event to the dashboard, and **long-poll or hold the HTTP response open for up to 60 seconds** waiting for a decision (simplify: if no decision within 60s, auto-reject and respond with a timeout error — do not hang forever).
  8. On admin Approve/Reject via dashboard: update row, log event, resolve the held request (or, if already timed out, just record the late decision for audit purposes).
- Expose REST endpoints (for the dashboard to consume, in addition to the MCP endpoint):
  - `GET /api/requests/pending` — list pending requests
  - `POST /api/requests/:id/approve` — approve (body: `{ decidedBy: string }`)
  - `POST /api/requests/:id/reject` — reject (body: `{ decidedBy: string, reason?: string }`)
  - `GET /api/requests` — paginated history with filters (`status`, `agentName`, date range)
  - `GET /api/audit` — paginated audit log
  - `GET /api/policies` / `POST /api/policies` / `PATCH /api/policies/:id` / `DELETE /api/policies/:id`
  - `POST /api/auth/login` — admin login, returns JWT
  - `POST /api/demo/scenario/:scenarioId` — triggers a scripted scenario (see §9)
  - `GET /api/stats` — counts for dashboard summary bar (total requests, % auto-allowed, % blocked, % pending, avg approval time)

---

## 9. Demo Mode Spec (highest priority section — build this carefully)

This is what makes the product "show, don't tell" for recruiters. Do not treat it as an afterthought.

### 9.1 Mock Company Database
A small in-memory or SQLite dataset simulating a fictional company ("Northwind Retail" or similar), with tables/collections for: `users` (with a `pii` flag on email/phone fields), `orders`, `transactions` (with `amount` field), `inventory`. Seed with ~30-50 fake rows using a library like `@faker-js/faker`.

### 9.2 Simulated Agent Traffic Generator
- A background process (`demo/generator.ts`) that, when `DEMO_MODE=true` (default in the public deployment), fires a tool call to the proxy's own `/mcp` endpoint every 4-8 seconds (randomized interval), cycling through a realistic mix:
  - ~50% benign reads (`get_user`, `list_orders`, `read_inventory`) → auto-allowed
  - ~20% medium-risk (`transfer_funds` with random amounts, some >$100 some not) → mix of auto-allow and pending
  - ~15% flagged PII access (`read_user_pii`) → pending
  - ~15% destructive attempts (`delete_user_record`, `drop_table`) → auto-blocked
- Each simulated call includes a short plausible "agent reasoning" string (e.g. `"User requested account cleanup, attempting to remove inactive record"`) stored in `reasoning` — this is what makes the live feed feel real and readable, not like raw JSON logs.
- Agent name for generated traffic: `"demo-agent-01"`.

### 9.3 Scripted "Replay Attack Scenario" Button
On the dashboard, a visible button: **"▶ Simulate a risky agent action."** Clicking it (available to any visitor, no login) calls `POST /api/demo/scenario/:scenarioId` and triggers one of 3 pre-written dramatic scenarios on demand, e.g.:
1. `"rogue_delete"` — agent attempts `drop_table` on `transactions` → instantly appears as a red "BLOCKED" toast + live feed entry.
2. `"large_transfer"` — agent attempts `transfer_funds` for $5,000 → appears as a pulsing pending card the visitor can Approve/Reject themselves.
3. `"pii_snoop"` — agent attempts `read_user_pii` on a random user → appears as pending, flagged with a "Sensitive Data" badge.
This lets a recruiter who lands on the page and doesn't want to wait for random traffic *force* the interesting moment immediately.

### 9.4 No-Login Interactivity
Visitors can Approve/Reject pending requests in demo mode **without logging in** (`decidedBy: "guest-visitor"`). This is intentional — the whole point is zero friction. A small banner reads: *"You're viewing a live public demo. Feel free to click Approve/Reject on pending requests below — this is a sandboxed fake database, no real systems are affected."*

### 9.5 Reset Mechanism
A `POST /api/demo/reset` endpoint (called automatically every ~30 minutes by a cron/interval on the server) clears `ToolCallRequest` and `AuditLog` tables and re-seeds, so the public demo doesn't accumulate junk data indefinitely or get "broken" by visitors.

---

## 10. Dashboard UI Spec

### 10.1 `LiveFeed` (the landing / home page — this is the money shot)
- Top: `DemoModeBanner` (see 9.4) if `DEMO_MODE=true`.
- `StatsBar`: 4-5 live-updating counters (Total requests today, Auto-allowed, Blocked, Pending, Avg. approval time) with small Recharts sparkline.
- `ScenarioReplayButton` prominently placed.
- Main content: a two-column layout —
  - Left: **Pending Approvals** — stack of `PendingRequestCard`s, each showing tool name, agent name, input params (pretty-printed), the agent's stated reasoning, a red pulsing left border, and Approve (green) / Reject (red) buttons. New ones animate in from the top.
  - Right: **Live Activity Feed** — auto-scrolling list of all recent decisions (allowed/blocked/approved/rejected) as compact rows with colored status badges and relative timestamps ("2s ago"), updating via Socket.IO in real time.
- Use toast notifications (e.g. `react-hot-toast`) for major events (block, new pending request).

### 10.2 `AuditLog`
- Filterable/sortable table: timestamp, agent, tool, status, matched policy, decided by.
- Click a row to expand full JSON detail (input, reasoning, result, full audit trail of events for that request).
- CSV export button (nice-to-have, low effort with `papaparse`, include if time allows).

### 10.3 `PolicyEditor`
- Requires admin login (only screen behind auth).
- Table of policies with toggle switches (enabled/disabled), priority reordering (drag handles or simple up/down buttons), and Edit/Delete.
- "New Policy" form: tool pattern (text input), condition builder (simple form: field / operator / value, or "always"), action (dropdown: Allow/Block/Require Approval), priority (number).
- Live "Test this policy" mini-tool: enter a sample tool name + JSON input, see which policy would match and what the resulting action would be — this is a nice sophistication signal for very little added work (it's just calling the existing policy engine function against user input).

### 10.4 Visual Design Direction
- Dark-mode-first (security/ops tooling aesthetic — think Vercel/Linear/Datadog, not a generic admin template).
- Color coding consistent throughout: green = allowed, red = blocked, amber/yellow = pending, gray = rejected.
- Use monospace font for tool names/JSON payloads, sans-serif for UI chrome.

---

## 11. Real Agent Mode (secondary, optional — build only after everything above works)

- If `ANTHROPIC_API_KEY` is set in the backend's environment, expose a toggle in the dashboard: "Switch to Live Agent Mode."
- In this mode, a real call is made to the Anthropic API with tool definitions matching the mock DB's available tools (`get_user`, `transfer_funds`, `delete_user_record`, etc. — described via standard tool-use JSON schemas). The user types a natural-language instruction (e.g. "Clean up inactive test accounts") into a text box, Claude decides which tool(s) to call, and those tool calls flow through the exact same proxy/policy/dashboard pipeline as the simulated agent.
- This is the "genuinely real" proof point for technical interviewers who dig deeper than the demo, but it must never be required for the base demo experience to work, since a public visitor won't have (or shouldn't need) an API key.

---

## 12. Non-Functional Requirements

- **Security:** Demo mode's Approve/Reject-without-login is intentional and scoped only to the sandboxed mock DB — never allow demo mode to touch anything real. Rate-limit the public `/api/demo/scenario/:id` and approve/reject endpoints (e.g. 20 requests/min per IP) to prevent abuse via `express-rate-limit`.
- **Performance:** Dashboard should handle at least 500 audit log rows without pagination lag (implement basic pagination anyway).
- **Resilience:** If the Socket.IO connection drops, the dashboard should fall back to polling `/api/requests/pending` every 5s and show a small "reconnecting..." indicator.
- **Accessibility:** Buttons must have visible focus states and adequate color contrast even with the red/green/amber scheme (add icons, not just color, to status badges).

---

## 13. Setup & Environment

`.env.example` (root):
```
# Backend
DATABASE_URL="postgresql://user:pass@localhost:5432/agentgate"
# For pure local/dev without Postgres, set DATABASE_URL="file:./dev.db" and use SQLite provider in prisma schema
JWT_SECRET="replace-me"
DEMO_MODE=true
ADMIN_EMAIL="admin@agentgate.dev"
ADMIN_PASSWORD="changeme123"
PORT=4000

# Optional — enables Live Agent Mode
ANTHROPIC_API_KEY=

# Frontend
VITE_API_URL="http://localhost:4000"
VITE_SOCKET_URL="http://localhost:4000"
```

`docker-compose.yml` must bring up, with a single `docker-compose up`:
- `postgres` service
- `proxy` service (runs migrations + seed automatically on start via an entrypoint script, then starts server + demo generator)
- `dashboard` service (Vite build served via a lightweight static server, or `vite preview`)

**Root README must include, in this order:**
1. One-paragraph pitch + a GIF or embedded screen recording placeholder.
2. **Live Demo** link at the very top (bold, above the fold).
3. "Run locally in 60 seconds": `git clone`, `cp .env.example .env`, `docker-compose up`, open `http://localhost:5173`.
4. Architecture diagram (reuse §3 ASCII or convert to an image).
5. Feature list.
6. Tech stack table.
7. "How the Policy Engine works" mini-explainer with the default policy examples.
8. Deployment instructions (Railway/Render + Vercel).

---

## 14. Build Order / Milestones (for the coding agent to follow sequentially)

1. **Scaffold** monorepo structure, Prisma schema + migrations, docker-compose, `.env.example`.
2. **Mock DB + demo data seeding** (`scripts/seed.ts`, `demo/mockDb.ts`).
3. **Policy Engine** (`policy/engine.ts`) + default policies + unit tests for the 5 seed policies against sample inputs.
4. **MCP Proxy core** (`mcp/interceptor.ts`, `/mcp` endpoint, REST endpoints from §8).
5. **Socket.IO wiring** (server emits, verify with a simple script/curl before building UI).
6. **Demo traffic generator + scenario scripts** (§9.2, §9.3) — verify via REST/logs that realistic traffic flows before touching frontend.
7. **Dashboard scaffold** (Vite + Tailwind + routing), `useSocket` hook, `lib/api.ts`.
8. **LiveFeed page** (§10.1) — this is the priority screen, polish it most.
9. **AuditLog page** (§10.2).
10. **Auth + PolicyEditor page** (§10.3).
11. **Demo mode banner, reset cron, rate limiting** (§9.4, §9.5, §12).
12. **Real Agent Mode** (§11) — only after everything above is solid.
13. **README + deployment** — deploy a live instance, put the real link in the README, record a short screen capture GIF for the top of the README.
14. **Polish pass:** empty states, loading skeletons, mobile responsiveness of the dashboard (recruiters may open the link on a phone), favicon/title/OG meta tags for link previews when shared on LinkedIn.

---

## 15. Acceptance Criteria (definition of done)

- [ ] Visiting the public URL, within 10 seconds, a visitor sees live-updating activity with no action required.
- [ ] Visitor can click Approve/Reject on a pending request with no login and sees an immediate visual response.
- [ ] Visitor can click "Simulate a risky agent action" and see a dramatic blocked or pending result appear within 2 seconds.
- [ ] `docker-compose up` from a clean clone results in a fully working local instance with seeded data, no manual DB setup steps.
- [ ] Policy Editor allows creating a new policy and immediately demonstrates it taking effect on the next matching demo tool call.
- [ ] Audit log accurately reflects every decision made, including who/what decided it and why.
- [ ] README's live demo link and local setup instructions both work exactly as written, tested from a clean environment.
- [ ] Mobile viewport (375px width) renders the LiveFeed page usably (cards stack vertically, no horizontal scroll/overflow).

---

## 16. Explicitly Out of Scope (do not build these — they add risk/time without adding demo value)

- Multi-tenant / multi-organization support.
- OAuth / SSO login.
- Custom rule DSL or a rule-parsing language.
- Support for multiple simultaneous real MCP client integrations (Claude Desktop AND OpenCode AND others) — one real integration (Anthropic API) is sufficient.
- Kubernetes/Helm deployment configs.
- Email/Slack notifications for pending approvals (nice future feature, mention in README's "Roadmap" section instead of building it).
- Automated tests beyond basic policy engine unit tests (mention "tests to add" in Roadmap if time-constrained).
