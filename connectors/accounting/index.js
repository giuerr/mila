/**
 * Accounting Connectors — unified access
 */

const xero = require('./xero');
const quickbooks = require('./quickbooks');
const netsuite = require('./netsuite');

module.exports = {
  xero,
  quickbooks,
  netsuite
};
