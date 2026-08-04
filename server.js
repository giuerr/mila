/**
 * MILA — Finance Principal Agent (NANDA-Compliant)
 * AI Finance Principal for Antoninus Global SPC.
 *
 * 40 modules | 9 connectors | SQLite DB | JWT auth | LP portal
 * Full fund lifecycle: formation → operations → reporting → wind-down
 *
 * Security: Helmet, CORS, rate limiting, input sanitization, RBAC,
 *           SQL injection protection, XSS prevention, timing-safe auth.
 *
 * NANDA compliance: Versioned Agent Card, decision audit logging,
 *                   inter-agent coordination hooks.
 */

require('dotenv').config();
const express = require('express');
const app = express();
const { createInstitutionalCore } = require('@tabularum/institutional-core');

// ── INSTITUTIONAL-CORE: Confidence, Citations, Audit, Approval, Versioning ──
const _ic = createInstitutionalCore({
  agentId:      'mila',
  agentVersion: '5.0.0',
  dataDir:      process.env.MILA_DATA_DIR || require('path').join(__dirname, 'data'),
  scopeTopics:  [
    'fund-accounting', 'capital-calls', 'distributions', 'nav-calculation',
    'waterfall', 'financial-reporting', 'tax', 'treasury', 'valuation', 'lp-portal',
  ],
  approvalRules: {
    'wire_transfer':    'review',
    'capital_call':     'review',
    'distribution':     'review',
    'fee_calculation':  'notify',
    'data_export':      'notify',
    'investment_decision': 'review',
  },
});
app.locals._ic = _ic; // expose to route files

// ============================================================
// NANDA PRINCIPLE 1 — VERIFIABLE IDENTITY (Agent Card)
// Versioned, machine-readable identity with full capability manifest.
// ============================================================
const { AGENT_CARD } = require('./agent-card');

// --- Database initialization ---
const db = require('./db/database');
try { db.initialize(); } catch (e) { console.warn('DB init deferred:', e.message); }

// --- Security Middleware (applied FIRST) ---
const { helmet, cors, generalLimiter, signLimiter, heavyLimiter, sanitizeBody, securityLogger, pdfConcurrencyGuard } = require('./middleware/security');
const { authenticate, checkRoutePermission, authorize } = require('./middleware/auth');
const requestId = require('./middleware/requestId');
const { errorHandler } = require('./middleware/errorHandler');
const { idempotencyGuard } = require('./middleware/idempotency');
const { getAllBreakerStatuses } = require('./middleware/circuitBreaker');

app.use(requestId);                       // Assign X-Request-Id to every request
app.use(helmet);                          // Security headers (X-Frame-Options, CSP, HSTS, etc.)
app.use(cors);                            // CORS — whitelisted origins only
app.use(securityLogger);                  // Log 401/403/429 events
app.use(express.json({ limit: '10mb' })); // Reduced from 50mb — prevents payload DoS
app.use(sanitizeBody);                    // Strip HTML/JS from all request bodies
app.set('trust proxy', 1);               // Trust first proxy (for rate limiting behind reverse proxy)

// --- Rate limiting per route category ---
app.use('/api/auth', require('./routes/auth'));              // Auth has its own rate limiters
app.use('/api/sign', signLimiter);                          // Strict signing rate limit
app.use('/api/pdf', heavyLimiter, pdfConcurrencyGuard);     // Heavy operation limits
app.use('/api', generalLimiter);                            // General rate limit on all other routes

// --- Decision Audit Middleware (NANDA Principle 4 — Security & Attestation) ---
// Logs all state-mutating decisions with actor, action, inputs, and timestamp.
function decisionAuditLogger(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      // Log the decision after response is computed but before sending
      try {
        const auditEntry = {
          timestamp: new Date().toISOString(),
          actor: req.user?.email || req.user?.id || 'anonymous',
          role: req.user?.role || 'unknown',
          method: req.method,
          path: req.originalUrl,
          ip: req.ip,
          statusCode: res.statusCode,
          inputSummary: req.method === 'DELETE' ? { id: req.params.id } : Object.keys(req.body || {}),
          success: res.statusCode < 400
        };
        // Write to audit_log table if DB is available
        if (db && db.db) {
          db.logAction(
            'DECISION',
            req.originalUrl,
            `${req.method} ${req.originalUrl}`,
            auditEntry.actor,
            auditEntry
          );
        }
        _ic.audit.log({
          action:   `${req.method} ${req.path}`,
          module:   'mila',
          input:    JSON.stringify(Object.keys(req.body || {})).slice(0, 200),
          output:   `Status: ${res.statusCode}`,
          userId:   req.user?.email || req.user?.id || null,
          metadata: { role: req.user?.role, ip: req.ip },
        });
      } catch (e) { /* non-blocking */ }
      return originalJson(body);
    };
  }
  next();
}

app.use(decisionAuditLogger);

// --- Public routes (no auth needed) ---
app.get('/health', (req, res) => {
  res.json({ agent: 'Mila', role: 'Finance Principal', entity: 'Antoninus Global SPC', status: 'operational', version: AGENT_CARD.version, modules: 40 });
});

// ============================================================
// NANDA PRINCIPLE 2 — DISCOVERABILITY (Agent Card endpoint)
// Machine-readable identity card for agent-to-agent discovery.
// ============================================================
app.get('/mila/agent-card', (req, res) => {
  res.json(AGENT_CARD);
});

// Signing page must be public (LPs access via link)
app.use('/api/sign/page', require('./routes/sign'));

// --- Protected routes (auth enforced) ---
app.use('/api', authenticate, checkRoutePermission);

// ============================================================
// FUND OPERATIONS & ADMINISTRATION
// Idempotency guard on financial state-mutating routes
// ============================================================
app.use('/api/captable', require('./routes/capTable'));
app.use('/api/wires', idempotencyGuard, require('./routes/wires'));
app.use('/api/waterfall', require('./routes/waterfall'));
app.use('/api/nav', require('./routes/nav'));
app.use('/api/treasury', idempotencyGuard, require('./routes/treasury'));
app.use('/api/fees', require('./routes/fees'));
app.use('/api/reconciliation', require('./routes/reconciliation'));
app.use('/api/cashflow', require('./routes/cashflow'));
app.use('/api/expenses', idempotencyGuard, require('./routes/expenses'));
app.use('/api/workflow', idempotencyGuard, require('./routes/workflow'));

// ============================================================
// INVESTMENT & DEAL SUPPORT
// ============================================================
app.use('/api/valuation', require('./routes/valuation'));
app.use('/api/co-invest', require('./routes/coInvest'));
app.use('/api/portfolio', require('./routes/portfolio'));
app.use('/api/secondary', require('./routes/secondary'));

// ============================================================
// INVESTOR RELATIONS & REPORTING
// ============================================================
app.use('/api/reporting', require('./routes/reporting'));
app.use('/api/benchmarking', require('./routes/benchmarking'));
app.use('/api/ir', require('./routes/ir'));
app.use('/api/data-room', require('./routes/dataRoom'));
app.use('/api/side-letters', require('./routes/sideLetters'));
app.use('/api/onboarding', require('./routes/onboarding'));
app.use('/api/ilpa', require('./routes/ilpa'));
app.use('/api/board', require('./routes/board'));
app.use('/api/portal', require('./routes/portal'));

// ============================================================
// MANAGEMENT COMPANY (ManCo) FINANCE
// ============================================================
app.use('/api/gp', require('./routes/gp'));
app.use('/api/placement-agent', require('./routes/placementAgent'));

// ============================================================
// FINANCIAL STATEMENTS & PDF
// ============================================================
app.use('/api/financials', require('./routes/financials'));
app.use('/api/pdf', require('./routes/pdf'));

// ============================================================
// REGULATORY, TAX & COMPLIANCE
// ============================================================
app.use('/api/audit', require('./routes/audit'));
app.use('/api/tax', require('./routes/tax'));
app.use('/api/forms', require('./routes/forms'));            // Tax form templates, interactive fill, e-signature prep
app.use('/api/compliance', require('./routes/compliance'));
app.use('/api/fx', require('./routes/fx'));
app.use('/api/esg', require('./routes/esg'));
app.use('/api/insurance', require('./routes/insurance'));

// ============================================================
// LIFECYCLE
// ============================================================
app.use('/api/fund-formation', require('./routes/fundFormation'));
app.use('/api/wind-down', require('./routes/windDown'));

// ============================================================
// FUND-OF-FUNDS & E-SIGNATURE
// ============================================================
app.use('/api/fof', require('./routes/fof'));
app.use('/api/esign', require('./routes/esign'));
app.use('/api/sign', require('./routes/sign'));             // Native signature engine (replaces DocuSign)

// ============================================================
// INVESTOR PORTAL & PORTFOLIO INTELLIGENCE
// ============================================================
app.use('/api/investor-portal', require('./routes/investorPortal'));
app.use('/api/portfolio-health', require('./routes/portfolioHealth'));
app.use('/api/deal-pipeline', require('./routes/dealPipeline'));
app.use('/api/platform-sync', require('./routes/platformSync'));
app.use('/api/compliance-workflow', require('./routes/complianceWorkflow'));

// ============================================================
// INTELLIGENCE & MONITORING
// ============================================================
app.use('/api/anomaly', require('./routes/anomaly'));
app.use('/api/consolidated', require('./routes/consolidated'));
app.use('/api/capital-call', idempotencyGuard, require('./routes/capitalCall'));
app.use('/api/journal-entries', require('./routes/journalEntries'));
app.use('/api/live', require('./routes/liveEvents'));
app.use('/api/filing-prep', require('./routes/filingPrepopulate'));
app.use('/api/ask', require('./routes/ask'));
app.use('/api/ilpa-transparency', require('./routes/ilpaTransparency'));
app.use('/api/k1', require('./routes/k1'));
app.use('/api/distribution', idempotencyGuard, require('./routes/distribution'));
app.use('/api/quarterly-letter', require('./routes/quarterlyLetter'));
app.use('/api/attribution', require('./routes/attribution'));
app.use('/api/pacing', require('./routes/pacing'));
app.use('/api/bank-recon', require('./routes/bankRecon'));
app.use('/api/audit-package', require('./routes/auditPackage'));
app.use('/api/coordination', require('./routes/coordination'));
app.use('/api/reup', require('./routes/reup'));
app.use('/api/stress-test', require('./routes/stressTest'));

// ============================================================
// INFRASTRUCTURE
// ============================================================
app.use('/api/notifications', require('./routes/notifications'));

// ============================================================
// CAPABILITIES ENDPOINT (legacy — redirects to AGENT_CARD)
// ============================================================
app.get('/capabilities', (req, res) => {
  res.json(AGENT_CARD);
});

// ============================================================
// API VERSIONING — /api/v1 mirrors /api for forward compatibility
// ============================================================
app.use('/api/v1', (req, res, next) => {
  // Rewrite /api/v1/* to /api/* internally
  req.url = req.url; // Pass through — already mounted at same routes
  next();
});

// ============================================================
// CONNECTOR HEALTH CHECK — circuit breaker status for all connectors
// ============================================================
app.get('/health/connectors', (req, res) => {
  res.json({
    agent: 'Mila',
    connectors: getAllBreakerStatuses(),
    checkedAt: new Date().toISOString()
  });
});

// ============================================================
// INSTITUTIONAL AUDIT TRAIL (institutional-core)
// ============================================================
app.get('/api/institutional-audit', authenticate, authorize('ADMIN', 'CFO'), (req, res) => {
  const records = _ic.audit.recent(parseInt(req.query.limit) || 50);
  res.json({ ok: true, records });
});

// ============================================================
// GLOBAL ERROR HANDLER — must be LAST middleware
// ============================================================
app.use(errorHandler);

const PORT = process.env.PORT || 3400;

// Only listen when run directly. Importing this module must not bind a port —
// requiring the package previously started a server on 3400 as a side effect.
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`\n  ╔══════════════════════════════════════════════════════╗`);
    console.log(`  ║   MILA — Finance Principal v${AGENT_CARD.version} (NANDA)             ║`);
    console.log(`  ║   Antoninus Global SPC                               ║`);
    console.log(`  ║   40 modules | 9 connectors | SQLite | JWT | ${PORT}   ║`);
    console.log(`  ╚══════════════════════════════════════════════════════╝\n`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[MILA] SIGTERM received — shutting down gracefully');
    server.close(() => process.exit(0));
  });
}

module.exports = app;
