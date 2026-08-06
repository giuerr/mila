# Mila — Finance Principal

AI Finance Principal for Antoninus Global SPC. Owns the complete fund lifecycle: formation → operations → reporting → wind-down. Cayman Islands SPC accounting, capital activity, NAV, waterfall, tax, treasury, valuation and the LP portal.

- **Slug:** `mila`
- **Entry:** [`index.js`](./index.js)
- **Agent ID:** `mila-cfo-v5.0`
- **Version:** 5.0.0 (NANDA-compliant)

## Three layers

| Layer | Location |
|---|---|
| **Core** (this folder) | [`agents/mila/`](.) — Express server, 60+ routes, services, connectors, SQLite, LP portal templates |
| **Backend HTTP** | [`backend/src/agents/mila/`](../../backend/src/agents/mila) — `route.js`, FATCA/CRS, K-1, tax calendar, filings |
| **Frontend page** | [`frontend/tabularum-mila.html`](../../frontend/tabularum-mila.html) |
| **Frontend JS** | [`frontend/js/pages/mila.js`](../../frontend/js/pages/mila.js) |

## Capabilities (40 modules)

Fund accounting · capital calls · distributions · NAV · waterfall · financial reporting · tax · treasury · valuation · LP portal · ESG · K-1 · bank reconciliation · cap table · cashflow · compliance workflows · data room · ILPA transparency · forms / filings · benchmarking · attribution · anomaly detection · audit packaging · pacing · placement agent · platform sync · journal entries · expenses · fees · FX · insurance · IR · co-invest · fund-of-funds · onboarding · board · e-sign · PDF generation.

See [`routes/`](./routes) for the full HTTP surface.

## Structure

| Path | Purpose |
|---|---|
| [`index.js`](./index.js) | Express bootstrap, agent card, institutional-core wiring |
| [`routes/`](./routes) | 60+ HTTP route modules (one per capability) |
| [`services/`](./services) | Business logic implementations |
| [`connectors/`](./connectors) | Accounting + fund-platform adapters |
| [`db/database.js`](./db/database.js) | SQLite schema and queries |
| [`middleware/`](./middleware) | Auth, security, circuit breaker, idempotency, request IDs |
| [`portal/views/`](./portal/views) | LP portal templates |
| [`templates/`](./templates) | Document templates |
| [`tests/`](./tests) | Test suite |

## Security

Helmet, CORS, rate limiting, input sanitization, RBAC, SQL-injection protection, XSS prevention, timing-safe auth — wired in [`middleware/security.js`](./middleware/security.js).

## Approval gates

`wire_transfer`, `capital_call`, `distribution`, `investment_decision` require human review.
`fee_calculation`, `data_export` send notifications.

## Dependencies

- Shared institutional layer: [`packages/institutional-core`](../../packages/institutional-core)
- SQLite (via [`db/database.js`](./db/database.js))
- Node ≥ 18

## Quick start

```bash
cd agents/mila
npm install
cp .env.example .env
node index.js
```

## Connecting a simulator or harness (Agent Etna)

This agent exposes the same surface every Tabularum agent does, so a harness
needs no per-agent knowledge:

| | |
|---|---|
| `GET /health` | liveness, and whether a model is reachable |
| `GET /agent-card` | identity |
| `GET /tools` | the callable contract, as JSON Schema |
| `POST /task` | `{ goal }` — runs the reasoning loop, returns the answer and the full trace |
| `POST /chat` | the same loop, conversational shape |
| `POST /v1/chat/completions` | the same, in OpenAI response shape |

The chat endpoints accept `goal`, `task`, `message`, `input`, `prompt`,
`query`, `text`, `question`, `content`, or an OpenAI-style `messages` array,
and answer `400` naming what they accept rather than `500` when a body has
none of them. The reply is under `response`, and mirrored as `reply` and
`content`.

`/api/chat` is deliberately left to this repository's own handler.

### It runs with no configuration

The service boots and answers with nothing set at all, which is what a sandbox
gives it. Without a model key the reasoning endpoints return `ok: false` and
`stopReason: "no_llm_key"` rather than failing to start, so a harness sees a
live agent that is unconfigured instead of a dead process.

Set `OPENROUTER_API_KEY` to make it think.

### Authentication

`/task` and `/chat` run the model, so they are gated as soon as any of
`AGENT_TASK_TOKEN`, `AGENT_PASSWORD` or `DASHBOARD_PASSWORD` is set. The secret
may arrive as `Authorization: Bearer <secret>`, `X-Agent-Password` or
`X-Api-Key`.

With none of them set the endpoints are open. That is what makes a zero-config
sandbox work — and why any deployment reachable from the internet should set
one, or it is an unauthenticated endpoint spending your inference credit.
