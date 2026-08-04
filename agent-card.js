/**
 * MILA — Agent card
 *
 * The NANDA-compliant machine-readable identity. Kept in its own module so the
 * library entrypoint can expose it without importing server.js, which builds
 * and starts an Express app.
 */

'use strict';

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

module.exports = { AGENT_CARD };
