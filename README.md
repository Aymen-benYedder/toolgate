# AgentGate — A firewall for AI agents.

> **Live Demo:** [coming soon — deployed at AG-13]

AgentGate is a security/governance middleware for AI agents that use the Model Context Protocol (MCP). It sits between an AI agent and the tools/databases it wants to call. Every tool call is intercepted, evaluated against a configurable JSON policy engine, and either auto-allowed, auto-blocked, or paused and routed to a human-in-the-loop dashboard for Approve/Reject. Every decision and its full context is written to an audit log.

*(README is a skeleton during scaffold — full version lands at milestone AG-13 with live demo link, GIF, architecture diagram, feature list, tech stack, policy engine explainer, and deployment instructions.)*

## Run locally in 60 seconds

```bash
git clone <repo-url> agentgate
cd agentgate
cp .env.example .env
docker-compose up
```

Open **http://localhost:5173** — the demo generator starts producing simulated agent traffic immediately.

## Architecture

```
Simulated / Real AI Agent ──► AgentGate Proxy (Node/TS) ──► Policy Engine
                                   │  ALLOW / BLOCK / PENDING
                                   ▼
                        Mock Company DB · Postgres/SQLite · React Dashboard
```

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Node.js 20+ · TypeScript strict · Express · Socket.IO |
| Database | PostgreSQL (prod) / SQLite (local) · Prisma ORM |
| Frontend | React + Vite + TypeScript · Tailwind CSS · Recharts |
| Containerization | Docker + docker-compose |
| Real agent | Anthropic API (optional, feature-flagged) |

## Milestones

See `projects/agentgate/todos.md` in the vault — AG-1..AG-14.

## Roadmap

- Email/Slack notifications for pending approvals
- Automated tests beyond policy engine unit tests