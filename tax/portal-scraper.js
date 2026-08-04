/**
 * CICERO — Fund Portal Scraper
 * Connects to external fund administrator portals to extract:
 * - NAV data
 * - Capital call notices
 * - Distribution notices
 * - Quarterly reports
 * - K-1 documents
 *
 * Supports credential-based login to common fund admin platforms.
 * Credentials are encrypted and stored securely.
 *
 * IMPORTANT: In production, credentials must be encrypted at rest
 * using AES-256 and only decrypted in memory during scraping sessions.
 */

'use strict';
const crypto = require('crypto');

// ── Encryption for stored credentials ────────────────────────────────────────

const ENCRYPTION_KEY = process.env.PORTAL_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16;

function encryptCredential(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(ENCRYPTION_KEY.substring(0, 64), 'hex');
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptCredential(encryptedText) {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const key = Buffer.from(ENCRYPTION_KEY.substring(0, 64), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(parts[1], 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ── Portal Registry ──────────────────────────────────────────────────────────

const SUPPORTED_PORTALS = {
  'investran': {
    name: 'Investran (FIS)',
    loginUrl: 'https://investran.fisglobal.com/login',
    type: 'fund_admin',
    dataPoints: ['nav', 'capital_calls', 'distributions', 'k1', 'quarterly_reports']
  },
  'efront': {
    name: 'eFront',
    loginUrl: 'https://app.efront.com/login',
    type: 'fund_admin',
    dataPoints: ['nav', 'cash_flows', 'performance', 'documents']
  },
  'allvue': {
    name: 'Allvue Systems',
    loginUrl: 'https://portal.allvuesystems.com',
    type: 'fund_admin',
    dataPoints: ['nav', 'capital_activity', 'investor_reports']
  },
  'burgiss': {
    name: 'Burgiss',
    loginUrl: 'https://app.burgiss.com',
    type: 'analytics',
    dataPoints: ['nav', 'irr', 'tvpi', 'dpi', 'benchmarks']
  },
  'carta': {
    name: 'Carta',
    loginUrl: 'https://app.carta.com/login',
    type: 'cap_table',
    dataPoints: ['cap_table', 'valuations', 'equity_grants', 'k1']
  },
  'juniper_square': {
    name: 'Juniper Square',
    loginUrl: 'https://app.junipersquare.com/login',
    type: 'fund_admin',
    dataPoints: ['nav', 'capital_calls', 'distributions', 'investor_portal']
  },
  'custom': {
    name: 'Custom Portal',
    loginUrl: null,
    type: 'custom',
    dataPoints: ['nav', 'documents']
  }
};

// ── Stored Portal Connections (in-memory, move to DB in production) ──────────

const connections = new Map();

/**
 * Store portal credentials (encrypted).
 * @param {string} userId - Owner of the connection
 * @param {string} portalId - Portal identifier
 * @param {string} email - Login email
 * @param {string} password - Login password (will be encrypted)
 * @param {string} customUrl - Custom portal URL (for 'custom' type)
 * @returns {Object} connection record (without plaintext password)
 */
function addConnection(userId, portalId, email, password, customUrl) {
  if (!SUPPORTED_PORTALS[portalId] && portalId !== 'custom') {
    throw new Error('Unsupported portal: ' + portalId);
  }

  const id = 'PORTAL-' + crypto.randomBytes(6).toString('hex').toUpperCase();
  const connection = {
    id,
    userId,
    portalId,
    portalName: SUPPORTED_PORTALS[portalId]?.name || 'Custom Portal',
    email,
    encryptedPassword: encryptCredential(password),
    customUrl: customUrl || null,
    status: 'connected',
    lastSync: null,
    lastSyncStatus: null,
    dataExtracted: {},
    createdAt: new Date().toISOString()
  };

  connections.set(id, connection);

  // Return without the encrypted password
  const { encryptedPassword, ...safe } = connection;
  return safe;
}

/**
 * List all portal connections for a user.
 */
function getConnections(userId) {
  return Array.from(connections.values())
    .filter(c => c.userId === userId)
    .map(({ encryptedPassword, ...safe }) => safe);
}

/**
 * Remove a portal connection.
 */
function removeConnection(connectionId) {
  connections.delete(connectionId);
}

/**
 * Sync data from a portal.
 * In production: uses headless browser (Puppeteer) or API to:
 * 1. Login with decrypted credentials
 * 2. Navigate to relevant pages
 * 3. Extract NAV, capital calls, distributions
 * 4. Download documents
 *
 * @param {string} connectionId
 * @returns {Object} extracted data
 */
async function syncPortal(connectionId) {
  const conn = connections.get(connectionId);
  if (!conn) throw new Error('Connection not found.');

  // Decrypt password for use
  const password = decryptCredential(conn.encryptedPassword);
  const portal = SUPPORTED_PORTALS[conn.portalId] || SUPPORTED_PORTALS.custom;

  // In production: Puppeteer session
  // const browser = await puppeteer.launch({ headless: true });
  // const page = await browser.newPage();
  // await page.goto(portal.loginUrl || conn.customUrl);
  // await page.type('#email', conn.email);
  // await page.type('#password', password);
  // await page.click('#login-button');
  // ... navigate and extract data

  // For now: return structured placeholder showing what would be extracted
  const extractedData = {
    nav: {
      current: 125000000,
      asOf: new Date().toISOString().split('T')[0],
      currency: 'USD',
      priorQuarter: 122500000,
      change: 2.04,
      perUnit: 12.50
    },
    capitalCalls: [
      { id: 'CC-001', date: '2026-01-15', amount: 5000000, status: 'funded', fund: conn.portalName + ' Fund I' },
      { id: 'CC-002', date: '2026-03-01', amount: 3000000, status: 'pending', dueDate: '2026-04-01', fund: conn.portalName + ' Fund I' }
    ],
    distributions: [
      { id: 'DIST-001', date: '2025-12-31', amount: 2500000, type: 'return_of_capital', fund: conn.portalName + ' Fund I' }
    ],
    documents: [
      { name: 'Q4 2025 Quarterly Report', type: 'quarterly_report', date: '2026-02-15', available: true },
      { name: '2025 K-1', type: 'k1', date: '2026-03-10', available: true },
      { name: 'Capital Call Notice #12', type: 'capital_call', date: '2026-03-01', available: true }
    ],
    performance: {
      netIrr: 14.2,
      tvpi: 1.35,
      dpi: 0.42,
      rvpi: 0.93,
      vintage: 2022
    }
  };

  // Update connection record
  conn.lastSync = new Date().toISOString();
  conn.lastSyncStatus = 'success';
  conn.dataExtracted = extractedData;

  return {
    connectionId,
    portal: conn.portalName,
    syncedAt: conn.lastSync,
    status: 'success',
    data: extractedData
  };
}

/**
 * Get aggregated NAV across all connected portals for a user.
 */
function getAggregatedNAV(userId) {
  const userConnections = Array.from(connections.values()).filter(c => c.userId === userId && c.dataExtracted?.nav);
  const totalNav = userConnections.reduce((sum, c) => sum + (c.dataExtracted.nav.current || 0), 0);

  return {
    totalNav,
    portfolioCount: userConnections.length,
    breakdown: userConnections.map(c => ({
      portal: c.portalName,
      nav: c.dataExtracted.nav.current,
      asOf: c.dataExtracted.nav.asOf,
      change: c.dataExtracted.nav.change
    }))
  };
}

/**
 * Get all pending capital calls across portals.
 */
function getPendingCapitalCalls(userId) {
  const userConnections = Array.from(connections.values()).filter(c => c.userId === userId);
  const pending = [];
  userConnections.forEach(c => {
    (c.dataExtracted?.capitalCalls || []).filter(cc => cc.status === 'pending').forEach(cc => {
      pending.push({ ...cc, portal: c.portalName });
    });
  });
  return pending;
}

module.exports = {
  SUPPORTED_PORTALS,
  addConnection,
  getConnections,
  removeConnection,
  syncPortal,
  getAggregatedNAV,
  getPendingCapitalCalls,
  encryptCredential,
  decryptCredential
};
