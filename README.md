# Mila — Finance Principal

AI Finance Principal for Antoninus Global SPC. Owns the complete fund lifecycle: formation → operations → reporting → wind-down. Cayman Islands SPC accounting, capital activity, NAV, waterfall, tax, treasury, valuation and the LP portal.

- **Slug:** `mila`
- **Entry:** [`index.js`](./index.js)
- **Agent ID:** `mila-cfo-v5.0`
- **Version:** 5.0.0 (NANDA-compliant)

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
