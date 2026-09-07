# toolgate — AI Agent Security Firewall for MCP

> **Live Demo:** [toolgate-demo.vercel.app](https://toolgate-demo.vercel.app) — watch a rogue AI agent get caught in real time

---

## 🚨 AI agents are writing code and executing database tools without oversight.

**toolgate solves this with real-time interception and human-in-the-loop security.**

Every tool call an AI agent makes — reading customer PII, transferring funds, deleting records — passes through toolgate first. A JSON policy engine decides in milliseconds: **auto-allow** safe calls, **auto-block** dangerous ones, and **pause** anything risky for a human to approve or reject. Every decision lands in an immutable audit trail.

toolgate is a **Model Context Protocol (MCP) security gateway**: a firewall for AI agents that turns "trust the agent" into "verify every action."

<!-- GIF placeholder: high-res demo recording lands at AG-13 (see projects/toolgate/todos.md) -->

```
┌─────────────────────┐     ┌──────────────────────────────────────────────┐     ┌──────────────────┐
│  AI Agent           │     │  toolgate Proxy (Node.js + Express)         │     │  Mock Company DB │
│  (Claude / GPT /    │────►│                                              │────►│  · users         │
│   any MCP client)   │     │  ┌────────────────────────────────────────┐  │     │  · orders        │
│  tools/list         │     │  │  Policy Engine (JSON rules, no DSL)    │  │     │  · transactions  │
│  tools/call         │     │  │  ALLOW  → execute + audit              │  │     │  · inventory     │
└─────────────────────┘     │  │  BLOCK  → error -32001 + audit         │  │     └──────────────────┘
                            │  │  PENDING→ human approves / rejects     │  │
                            │  └────────────────────────────────────────┘  │
                            │              │  Socket.IO realtime           │
                            │              ▼                               │
                            │  ┌────────────────────────────────────────┐  │
                            │  │  React Dashboard (LiveFeed, AuditLog,  │  │
                            │  │  PolicyEditor) + Postgres/SQLite       │  │
                            │  └────────────────────────────────────────┘  │
                            └──────────────────────────────────────────────┘
```

---

## Why AI agent security matters

LLM-powered agents now hold credentials to databases, payment systems, and internal APIs. A single hallucinated tool call — `delete_user_record`, `transfer_funds`, `drop_table` — can cause damage faster than a human can react. Traditional security stops at the API boundary; **toolgate adds a governance layer at the tool boundary**, where the agent's actions actually happen.

- **Real-time interception** — every MCP `tools/call` is evaluated before execution
- **Human-in-the-loop approval** — risky calls pause and wait for a human decision (60s hold, then auto-reject)
- **JSON policy engine** — no DSL to learn, no regex to debug; rules are plain structured data
- **Complete audit trail** — request → policy evaluation → decision → execution, all timestamped
- **Fail-safe by default** — no matching policy means the call is *paused*, never auto-allowed

## Run locally in 60 seconds

```bash
git clone https://github.com/Aymen-benYedder/toolgate.git
cd toolgate
cp .env.example .env
docker-compose up
```

Open **http://localhost:5173** — the demo generator starts producing simulated agent traffic immediately. Approve a pending transfer, reject a PII read, and watch the audit log update in real time.

## How the Policy Engine works

Policies are JSON rows evaluated in **priority order** — the first match wins:

```json
{
  "name": "Block destructive operations",
  "priority": 1,
  "toolPattern": "drop_table",
  "action": "BLOCK"
}
```

| Rule | Tool pattern | Condition | Action |
|---|---|---|---|
| Block destructive ops | `drop_table` | always | **BLOCK** |
| PII requires approval | `read_user_pii` | always | **REQUIRE_APPROVAL** |
| Auto-allow small transfers | `transfer_funds` | `amount <= 100` | **ALLOW** |
| Large transfers need a human | `transfer_funds` | `amount > 100` | **REQUIRE_APPROVAL** |
| Reads are safe | `read_*` | always | **ALLOW** |

Conditions support `and` / `or` / field comparisons (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`) against the tool's input arguments — evaluated in plain TypeScript, **no code execution, no injection surface**.

## Features

- **MCP-compatible endpoint** (`POST /mcp`) — drop-in for any MCP client; agent identity via `x-agent-name` header
- **7 demo tools** — `get_user`, `list_orders`, `read_inventory`, `read_user_pii`, `transfer_funds`, `delete_user_record`, `drop_table`
- **Live dashboard** — realtime feed of pending approvals, audit log explorer, policy editor, stats
- **Demo traffic generator** — realistic agent behavior with 3 replayable attack scenarios (rogue delete, large transfer, PII snoop)
- **Rate limiting** on all public mutation endpoints (20 req/min/IP)
- **JWT auth** for policy editing; demo mode keeps the dashboard interactive without login
- **Dual database** — PostgreSQL for production, SQLite for instant local dev

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Node.js 20+ · TypeScript strict · Express · Socket.IO |
| Database | PostgreSQL (prod) / SQLite (local) · Prisma ORM |
| Frontend | React + Vite + TypeScript · Tailwind CSS · Recharts |
| Containerization | Docker + docker-compose |
| Real agent | Anthropic API (optional, feature-flagged) |

## Deployment

```bash
# 1. Set real secrets (never use the defaults in production)
export JWT_SECRET="$(openssl rand -hex 32)"
export ADMIN_PASSWORD="$(openssl rand -hex 16)"

# 2. Build and run
docker-compose up --build -d
```

The proxy applies Prisma migrations and seeds demo data on boot. The dashboard is served as a static build behind nginx.

> ⚠️ `docker-compose.yml` is for **local development** — the Postgres password is a known default. For a public deployment, override `POSTGRES_PASSWORD` and never expose port 5432.

## Security model

- **Demo mode** (`DEMO_MODE=true`): dashboard is publicly viewable and interactive — the point is to *show* the governance working. Policy mutations still require login.
- **Production mode** (`DEMO_MODE=false`): approve/reject require a valid JWT; `decidedBy` is taken from the token, never the request body.
- **Fail-safe**: unknown tool calls and unmatched policies default to `REQUIRE_APPROVAL`, never auto-allow.
- **No secrets in the repo**: `.env` is gitignored; only `.env.example` is tracked.

## FAQ

**What is MCP?** The Model Context Protocol — Anthropic's open standard for connecting AI agents to tools and data. toolgate intercepts MCP `tools/call` requests.

**Does toolgate work with any agent?** Yes — anything that speaks MCP can point at toolgate's `/mcp` endpoint. The demo includes a simulated agent plus an optional real Anthropic-powered agent mode.

**Is the policy engine safe from injection?** Yes. Policies are structured JSON evaluated by a plain TypeScript interpreter — no `eval`, no regex, no code execution.

**What happens if no policy matches?** The call is paused for human approval (fail-safe). After 60 seconds it auto-rejects with `APPROVAL_TIMEOUT`.

## Roadmap

- Email/Slack notifications for pending approvals
- Automated tests beyond policy engine unit tests
- Multi-tenant policy namespaces

## License

MIT