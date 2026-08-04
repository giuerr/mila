/**
 * MILA — Finance Principal Agent
 *
 * Library entrypoint. Side-effect free: requiring this module exposes Mila's
 * identity and domain logic without building or starting the HTTP app. Run the
 * standalone service with `npm start` (server.js) instead.
 *
 * Full fund lifecycle: formation -> operations -> reporting -> wind-down.
 */

'use strict';

const { AGENT_CARD } = require('./agent-card');

// Portable, dependency-free tax and regulatory logic. These are pure functions
// over plain data — no database, no HTTP — so they are safe to import anywhere.
const tax = {
  calculations:      require('./tax/tax-calculations'),
  calendar:          require('./tax/tax-calendar'),
  fatcaCrs:          require('./tax/fatca-crs'),
  filingTracker:     require('./tax/filing-tracker'),
  k1Generator:       require('./tax/k1-generator'),
  jurisdictionRouter: require('./tax/jurisdiction-router'),
  portalScraper:     require('./tax/portal-scraper'),
};

module.exports = {
  name: 'Mila',
  description: 'Finance Principal',
  role: 'Finance Principal',
  agentId: AGENT_CARD.agentId,
  version: AGENT_CARD.version,
  AGENT_CARD,
  capabilities: AGENT_CARD.capabilities,
  tax,

  /**
   * The Express app, loaded on demand. Deferred because building it pulls in
   * the database, connectors and route tree — cost that a consumer importing
   * only the agent card should not pay.
   */
  get app() {
    return require('./server');
  },
};
