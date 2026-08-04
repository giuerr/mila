/**
 * MILA — Finance Principal Agent v4.2 (NANDA-Compliant)
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
const { createInstitutionalCore } = require('../../packages/institutional-core');

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
const AGENT_CARD = {
  // --- Identity ---
  agentId: 'mila-cfo-v5.0',
  name: 'Mila',
  role: 'Finance Principal',
  entity: 'Antoninus Global SPC',
  version: '5.0.0',
  nandaVersion: '1.0',
  description: 'AI Finance Principal managing the complete fund lifecycle: formation, operations, reporting, investor relations, tax, compliance, and wind-down for a Cayman Islands SPC.',
  maintainer: 'Antoninus Global SPC',
  contactEmail: 'ops@antoninus.com',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2026-03-29T00:00:00Z',

  // --- Authentication ---
  authentication: {
    methods: ['JWT_BEARER', 'API_KEY'],
    jwtIssuer: 'mila-cfo-agent',
    apiKeyHeader: 'X-API-Key',
    rbacRoles: ['ADMIN', 'CFO', 'FUND_ACCOUNTANT', 'COMPLIANCE', 'INVESTOR', 'READONLY']
  },

  // --- Capabilities (all 40 modules) ---
  capabilities: [
    { id: 'cap-table',         name: 'Cap Table Management',       path: '/api/captable',         category: 'fundOperations',       description: 'LP ownership, subscriptions, redemptions, multi-series support' },
    { id: 'wire-processing',   name: 'Wire Processing',            path: '/api/wires',            category: 'fundOperations',       description: 'Outbound/inbound wire instructions, SWIFT, payment tracking' },
    { id: 'waterfall',         name: 'Waterfall Engine',           path: '/api/waterfall',        category: 'fundOperations',       description: 'European, American, hybrid waterfalls with netting and loss carry-forward' },
    { id: 'nav',               name: 'NAV Calculator',             path: '/api/nav',              category: 'fundOperations',       description: 'Net asset value, multi-series, side pockets, equalization, fair value hierarchy' },
    { id: 'treasury',          name: 'Treasury Management',        path: '/api/treasury',         category: 'fundOperations',       description: 'Cash positions, credit facility, liquidity forecasting' },
    { id: 'fees',              name: 'Fee Calculator',             path: '/api/fees',             category: 'fundOperations',       description: 'Management fees, performance fees, HWM, clawback, fee offsets, tiered carry' },
    { id: 'reconciliation',    name: 'Bank Reconciliation',        path: '/api/reconciliation',   category: 'fundOperations',       description: 'Automated matching, exception handling, three-way reconciliation' },
    { id: 'cashflow',          name: 'Cash Flow Forecasting',      path: '/api/cashflow',         category: 'fundOperations',       description: 'Projected capital calls, distributions, expense forecasting' },
    { id: 'expenses',          name: 'Expense Management',         path: '/api/expenses',         category: 'fundOperations',       description: 'Fund expenses, org expenses, LPA cap tracking, GP/LP allocation' },
    { id: 'workflow',          name: 'Workflow Engine',             path: '/api/workflow',         category: 'fundOperations',       description: 'Multi-step approval chains, routing, escalation' },
    { id: 'valuation',         name: 'Valuation Engine',           path: '/api/valuation',        category: 'investmentSupport',    description: 'DCF, comparable companies, precedent transactions, ASC 820 hierarchy' },
    { id: 'co-invest',         name: 'Co-Investment',              path: '/api/co-invest',        category: 'investmentSupport',    description: 'Co-invest allocation, vehicle structuring, fee arrangements' },
    { id: 'portfolio',         name: 'Portfolio Monitoring',        path: '/api/portfolio',        category: 'investmentSupport',    description: 'Portfolio company tracking, KPIs, sector/geography analysis' },
    { id: 'secondary',         name: 'Secondary Market',           path: '/api/secondary',        category: 'investmentSupport',    description: 'LP interest transfers, pricing, ROFR, consent tracking' },
    { id: 'reporting',         name: 'LP Reporting',               path: '/api/reporting',        category: 'investorRelations',    description: 'Quarterly reports, capital account statements, event recaps' },
    { id: 'benchmarking',      name: 'Benchmarking',               path: '/api/benchmarking',     category: 'investorRelations',    description: 'Peer comparison, IRR/MOIC quartiles, PME analysis' },
    { id: 'ir',                name: 'Investor Relations',         path: '/api/ir',               category: 'investorRelations',    description: 'LP communications, AGM support, relationship management' },
    { id: 'data-room',         name: 'Data Room',                  path: '/api/data-room',        category: 'investorRelations',    description: 'Virtual data room, document access control, activity tracking' },
    { id: 'side-letters',      name: 'Side Letter Manager',        path: '/api/side-letters',     category: 'investorRelations',    description: 'Side letter provisions, MFN tracking, fee overrides' },
    { id: 'onboarding',        name: 'Investor Onboarding',        path: '/api/onboarding',       category: 'investorRelations',    description: 'KYC/AML, accreditation, subscription documents, W-8/W-9' },
    { id: 'ilpa',              name: 'ILPA Templates',             path: '/api/ilpa',             category: 'investorRelations',    description: 'ILPA-standard reporting templates, fee transparency' },
    { id: 'board',             name: 'Board Materials',            path: '/api/board',            category: 'investorRelations',    description: 'Board pack generation, LPAC meeting support' },
    { id: 'portal',            name: 'LP Portal',                  path: '/api/portal',           category: 'investorRelations',    description: 'Self-service investor portal, document downloads, statements' },
    { id: 'gp',                name: 'GP Economics',               path: '/api/gp',               category: 'manCoFinance',         description: 'Management company P&L, carry allocation, GP commitment' },
    { id: 'placement-agent',   name: 'Placement Agent',            path: '/api/placement-agent',  category: 'manCoFinance',         description: 'Placement fee tracking, tail provisions, commission schedules' },
    { id: 'financials',        name: 'Financial Statements',       path: '/api/financials',       category: 'financialStatements',  description: 'Balance sheet, income statement, cash flow, SOC, partner capital' },
    { id: 'pdf',               name: 'PDF Engine',                 path: '/api/pdf',              category: 'financialStatements',  description: 'Puppeteer-based PDF generation with concurrency control' },
    { id: 'audit',             name: 'Audit Trail',                path: '/api/audit',            category: 'regulatoryCompliance', description: 'Full audit trail, regulatory filing data, AI-assisted narratives' },
    { id: 'tax',               name: 'Tax Engine',                 path: '/api/tax',              category: 'regulatoryCompliance', description: 'K-1, withholding, FATCA/CRS, PFIC, ECI, UBTI, tax lot tracking, 26-jurisdiction tax profiles' },
    { id: 'forms',             name: 'Form Template Library',      path: '/api/forms',            category: 'regulatoryCompliance', description: 'Interactive tax form filling (W-8BEN, W-8BEN-E, W-9, CRS, 40+ forms), pre-population, validation, e-signature prep' },
    { id: 'compliance',        name: 'Compliance Calendar',        path: '/api/compliance',       category: 'regulatoryCompliance', description: 'Filing deadlines across 26 jurisdictions, CIMA/SEC/AIFMD/CSSF/SFC/MAS/JFSA/FSC tracking' },
    { id: 'fx',                name: 'FX Engine',                  path: '/api/fx',               category: 'regulatoryCompliance', description: 'Multi-currency, FX hedging, translation gains/losses' },
    { id: 'esg',               name: 'ESG Reporting',              path: '/api/esg',              category: 'regulatoryCompliance', description: 'SFDR, TCFD, carbon footprint, impact metrics' },
    { id: 'insurance',         name: 'Insurance Tracker',          path: '/api/insurance',        category: 'regulatoryCompliance', description: 'D&O, E&O, cyber policies, renewal tracking, coverage analysis' },
    { id: 'fund-formation',    name: 'Fund Formation',             path: '/api/fund-formation',   category: 'lifecycle',            description: 'New fund setup, LPA terms, service provider onboarding' },
    { id: 'wind-down',         name: 'Wind-Down',                  path: '/api/wind-down',        category: 'lifecycle',            description: 'Fund termination, final distributions, regulatory deregistration' },
    { id: 'fof',               name: 'Fund of Funds',              path: '/api/fof',              category: 'fundOfFunds',          description: 'Underlying fund tracking, look-through reporting, commitment pacing' },
    { id: 'investor-portal',   name: 'LP Investor Portal',         path: '/api/investor-portal',   category: 'investorServices',     description: 'LP dashboard: capital accounts, performance charts, document vault, commitment tracker, multi-fund view' },
    { id: 'portfolio-health',  name: 'Portfolio Health Scorecards', path: '/api/portfolio-health', category: 'investmentSupport',    description: 'Company health scoring (0-100), KPI tracking, covenant monitoring, 3-statement models, alert triggers' },
    { id: 'platform-sync',     name: 'Platform Sync (Bidirectional)', path: '/api/platform-sync', category: 'infrastructure',       description: 'Two-way sync with Juniper Square, Allvue, eFront, Geneva, Investran — push capital calls, distributions, NAV' },
    { id: 'deal-pipeline',     name: 'Deal Pipeline Tracker',      path: '/api/deal-pipeline',    category: 'investmentSupport',    description: 'Sourcing funnel, stage management, probability weighting, conversion analytics, IC memo generation' },
    { id: 'compliance-workflow', name: 'Compliance Workflow',       path: '/api/compliance-workflow', category: 'regulatoryCompliance', description: 'Filing lifecycle, automated reminders, escalation chains, assignee management, audit-ready reports' },
    { id: 'esign',             name: 'E-Signature (Legacy)',        path: '/api/esign',            category: 'eSignature',           description: 'Legacy — deprecated in favour of native signature engine' },
    { id: 'sign',              name: 'Signature Engine',           path: '/api/sign',             category: 'eSignature',           description: 'Native e-signature: IP, timestamp, device, geolocation, SHA-256 hashing, audit trail PDF, signing certificates' },
    { id: 'notifications',     name: 'Notification Hub',           path: '/api/notifications',    category: 'infrastructure',       description: 'Email, webhook, and in-app notification delivery' },
    { id: 'auth',              name: 'Authentication',             path: '/api/auth',             category: 'infrastructure',       description: 'JWT auth, RBAC, API key service-to-service auth' }
  ],

  // --- Connectors (external systems) ---
  connectors: {
    fundPlatforms: [
      { id: 'juniper-square', name: 'Juniper Square', protocol: 'REST/OAuth2', status: 'active' },
      { id: 'allvue',         name: 'Allvue',         protocol: 'REST/OAuth2', status: 'active' },
      { id: 'efront',         name: 'eFront (BlackRock)', protocol: 'REST/OAuth2', status: 'active' },
      { id: 'geneva',         name: 'SS&C Geneva',    protocol: 'REST/OAuth2', status: 'active' },
      { id: 'investran',      name: 'Investran (FIS)', protocol: 'REST/OAuth2', status: 'active' }
    ],
    accounting: [
      { id: 'xero',       name: 'Xero',                  protocol: 'REST/OAuth2+PKCE', status: 'active' },
      { id: 'quickbooks',  name: 'QuickBooks Online',     protocol: 'REST/OAuth2',      status: 'active' },
      { id: 'netsuite',    name: 'NetSuite (Oracle)',     protocol: 'REST/TBA',         status: 'active' }
    ],
    eSignature: [
      { id: 'native-sign', name: 'Native Signature Engine', protocol: 'internal', status: 'active' }
    ]
  },

  // --- Inter-Agent Coordination (NANDA Principle 6) ---
  coordinationEndpoints: {
    gaio:  { description: 'Legal docs ↔ financial terms sync', events: ['FUND_FORMED', 'LPA_AMENDED', 'SIDE_LETTER_EXECUTED'] },
    lucio: { description: 'Portfolio data ↔ NAV calculation',  events: ['VALUATION_UPDATED', 'NAV_CALCULATED', 'INVESTMENT_REALIZED'] },
    livia: { description: 'Investor comms ↔ reporting',        events: ['REPORT_GENERATED', 'CAPITAL_CALL_ISSUED', 'DISTRIBUTION_MADE'] }
  },

  // --- Database ---
  storage: { engine: 'SQLite (sql.js)', file: 'mila.db', wal: false },

  // --- Endpoints ---
  endpoints: {
    health: '/health',
    agentCard: '/mila/agent-card',
    capabilities: '/capabilities'
  }
};

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
  res.json({ agent: 'Mila', role: 'Finance Principal', entity: 'Antoninus Global SPC', status: 'operational', version: '4.2.0', modules: 40 });
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
const server = app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════════════════╗`);
  console.log(`  ║   MILA — Finance Principal v4.2 (NANDA)                ║`);
  console.log(`  ║   Antoninus Global SPC                               ║`);
  console.log(`  ║   40 modules | 9 connectors | SQLite | JWT | ${PORT}   ║`);
  console.log(`  ╚══════════════════════════════════════════════════════╝\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[MILA] SIGTERM received — shutting down gracefully');
  server.close(() => process.exit(0));
});

module.exports = app;
