# Design Review — AG-7 Dashboard Scaffold (toolgate)

**Date:** 2026-09-07
**Reviewer:** EYE (visual design + UX audit)
**Subject:** http://localhost:5173/ (proxy :4000, dashboard dev :5173)
**Mode:** Read-only visual audit. No source files modified.
**Viewport:** 1440 × 900 @ DPR 1

---

## TL;DR

| Check | Verdict |
|---|---|
| 1. Sidebar — branding, nav, connection indicator | **PASS** |
| 2. Live Feed stub renders in main area | **PASS** |
| 3. Dark theme (zinc-950 bg) + mono headings | **PASS** |
| 4. No console errors / blank screen / layout breakage | **PASS (with 2 cosmetic notices)** |

Overall: **APPROVED for scaffold milestone.** Two non-blocking console notices worth knowing about; neither affects the user-facing render.

---

## What I saw

### Sidebar (left rail, 224px / `md:w-56`)

- **Logo block**: emerald-tinted square with `tg` monogram. Uses `bg-emerald-500/15`, `text-emerald-400`, `ring-emerald-500/30` — a subtle outlined badge. Looks intentional, on-brand for a security/governance tool.
- **Wordmark**: `toolgate` in mono, bold, `text-zinc-100`, `tracking-tight`. Reads cleanly.
- **Nav (3 items)**: Live Feed · Audit Log · Policy Editor. Active item (`Live Feed`, current route `/`) gets a `bg-zinc-800/80` pill highlight + `text-zinc-100`; inactive items are `text-zinc-400`. Hover states declared via `hover:bg-zinc-900 hover:text-zinc-200`.
- **Connection indicator (bottom of sidebar)**: a 2 × 2 dot in **emerald-400** (verified: `oklch(0.765 0.177 163.223)`) + the label `live` in mono, `text-xs`, `text-zinc-500`. Green dot correctly reflects the live socket state.
- **Responsive shell**: aside is horizontal (top bar) below `md`, vertical (sidebar) above. Code declares both — viewport @1440 uses sidebar layout.

### Main area (Outlet → LiveFeed stub)

- Heading: **`Live Feed`** in `font-mono`, `text-2xl`, `font-bold`. Computed font-family: `ui-monospace, "Cascadia Code", "JetBrains Mono", "SF Mono", monospace` — matches spec.
- Subheading: `Pending approvals + activity feed + stats bar land in AG-8 — the money shot.` in `text-zinc-400`. Sets expectation for AG-8.
- Container: `mx-auto max-w-6xl px-4 py-8` — sensible content width, breathing room on the left and top.

### Theme

- `<body>` computed `background-color`: `oklch(0.141 0.005 285.823)` — that's Tailwind v4's `zinc-950`. Matches spec.
- Type system: monospace headings, sans for body — consistent with a developer-tool aesthetic.

### Layout integrity

- Aside has fixed width (`md:w-56`) + `flex` main column with `min-w-0 flex-1` — prevents the classic "wide content blows out the grid" bug. Good.
- Vertical border `border-r border-zinc-800` between sidebar and main — subtle but visible.
- No overlap, no overflow, no z-index fights, no broken grid.

---

## Console / network audit

Captured during a 5s settle window after `networkidle`.

| Event | Count | Severity | Notes |
|---|---|---|---|
| Page errors (`pageerror`) | 0 | — | None |
| 4xx/5xx responses | 1 | Cosmetic | `GET /favicon.ico → 404` |
| Failed requests (network) | 0 | — | None |
| Console `error` | 1 | Cosmetic | Same favicon 404 |
| Console `warning` | 1 | Non-blocking | `WebSocket connection to 'ws://localhost:5173/socket.io/?EIO=4&transport=websocket' failed: WebSocket is closed before the connection is established.` |
| Console `debug` / `info` | 3 | Info | Vite HMR `[vite] connecting…` / `[vite] connected.`, React DevTools tip |

### Interpreting the WS warning

The socket.io-client attempted a WebSocket upgrade, which closed before establishing, then fell back to HTTP polling — which **succeeded** (`GET /socket.io/?EIO=4&transport=polling → 200`). This is the expected pattern when the vite dev proxy doesn't relay `Upgrade` headers but does relay the polling endpoint. The connection is alive (green dot), so the UX is correct.

If you want to silence the warning later, set `VITE_SOCKET_URL="http://localhost:4000"` and add `ws: true` proxy in `vite.config.ts` — but it's not required for AG-7.

---

## Visual cohesion notes (since I'm here)

This is a scaffold, so I'm only flagging things that **already feel off**, not nice-to-haves:

1. **The `live` label is `text-zinc-500`** — very low contrast against the dark sidebar. The green dot carries the signal (correctly), and accessibility-wise you have both color + text, so it passes WCAG (text isn't conveying the status alone). But on first glance the label nearly disappears. Consider `text-zinc-400` for better discoverability in a follow-up.
2. **The sidebar active-state pill uses `bg-zinc-800/80`** which is barely a step up from the surrounding `bg-zinc-950/80`. The active item is identifiable but quiet. For AG-8+ when this is the primary navigation, consider a more emphatic active treatment (e.g., a 2px emerald left border, or `bg-zinc-800` solid). Not blocking.
3. **Aside backdrop is `bg-zinc-950/80`** — translucent. With no content beneath it (it's a left rail), the translucency is invisible and just costs a paint. Solid `bg-zinc-950` would be more correct, but it's invisible right now, so it's a code-cleanliness thing, not a visual bug.
4. **Content container underfills the viewport** at 1440 × 900 — that's expected for a stub. Will resolve itself when AG-8 lands the stats/feed.

None of these block the milestone.

---

## Screenshots captured

- `workspace/dashboard-viewport.png` — 1440 × 900 viewport
- `workspace/dashboard-fullpage.png` — full page
- `workspace/sidebar-zoom.png` — sidebar crop
- `workspace/indicator-zoom.png` — connection indicator close-up

---

## Verdict

**APPROVED** for AG-7 scaffold milestone. All four explicit checks pass. Socket.io is connected (via polling fallback), proxy works, no console errors, no layout breakage. Two cosmetic console notices (favicon 404, one WS upgrade warning) — non-blocking, both disappear in production.

**Next:** ready for AG-8 (pending approvals + activity feed + stats bar).
