/**
 * NetSuite (Oracle) Connector
 * REST + SuiteQL, OAuth 1.0 TBA
 * Multi-subsidiary, multi-currency, consolidation — best for multi-fund structures
 */

const axios = require('axios');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const { breakers } = require('../../middleware/circuitBreaker');

class NetSuiteConnector {
  constructor() {
    this.accountId = process.env.NETSUITE_ACCOUNT_ID;
    this.baseUrl = `https://${this.accountId}.suitetalk.api.netsuite.com`;
    this.oauth = OAuth({
      consumer: {
        key: process.env.NETSUITE_CONSUMER_KEY,
        secret: process.env.NETSUITE_CONSUMER_SECRET
      },
      signature_method: 'HMAC-SHA256',
      hash_function(baseString, key) {
        return crypto.createHmac('sha256', key).update(baseString).digest('base64');
      }
    });
    this.token = {
      key: process.env.NETSUITE_TOKEN_KEY,
      secret: process.env.NETSUITE_TOKEN_SECRET
    };
    this.breaker = breakers.netsuite;
  }

  getAuthHeader(url, method) {
    const authData = this.oauth.authorize({ url, method }, this.token);
    return this.oauth.toHeader(authData).Authorization + `, realm="${this.accountId}"`;
  }

  async request(method, endpoint, data = null) {
    return this.breaker.execute(async () => {
      const url = `${this.baseUrl}${endpoint}`;
      const res = await axios({
        method,
        url,
        headers: {
          Authorization: this.getAuthHeader(url, method),
          'Content-Type': 'application/json',
          Prefer: 'respond-async'
        },
        data,
        timeout: 30000
      });
      return res.data;
    });
  }

  // --- SuiteQL (SQL-like queries — most powerful for reporting) ---
  async suiteql(query, limit = 1000, offset = 0) {
    const url = `${this.baseUrl}/services/rest/query/v1/suiteql`;
    const res = await axios({
      method: 'POST',
      url: `${url}?limit=${limit}&offset=${offset}`,
      headers: {
        Authorization: this.getAuthHeader(url, 'POST'),
        'Content-Type': 'application/json',
        Prefer: 'transient'
      },
      data: { q: query }
    });
    return res.data;
  }

  // --- Subsidiaries (each fund/SPV = a subsidiary) ---
  async getSubsidiaries() {
    return this.request('GET', '/services/rest/record/v1/subsidiary');
  }

  async getSubsidiary(id) {
    return this.request('GET', `/services/rest/record/v1/subsidiary/${id}`);
  }

  // --- Journal Entries ---
  async createJournalEntry(entry) {
    return this.request('POST', '/services/rest/record/v1/journalEntry', entry);
  }

  async getJournalEntry(id) {
    return this.request('GET', `/services/rest/record/v1/journalEntry/${id}`);
  }

  // --- Accounts ---
  async getAccounts() {
    return this.request('GET', '/services/rest/record/v1/account');
  }

  // --- Customers (LPs) ---
  async getCustomers() {
    return this.request('GET', '/services/rest/record/v1/customer');
  }

  async createCustomer(customer) {
    return this.request('POST', '/services/rest/record/v1/customer', customer);
  }

  // --- Transactions ---
  async getTransactions(type, subsidiaryId) {
    return this.suiteql(`
      SELECT id, tranid, trandate, type, amount, currency
      FROM transaction
      WHERE type = '${type}' AND subsidiary = ${subsidiaryId}
      ORDER BY trandate DESC
    `);
  }

  // --- Reporting via SuiteQL ---
  async getTrialBalance(subsidiaryId, asOfDate) {
    return this.suiteql(`
      SELECT a.acctnumber, a.acctname, a.accttype,
             SUM(tal.debit) as total_debit, SUM(tal.credit) as total_credit,
             SUM(tal.amount) as balance
      FROM transactionaccountingline tal
      JOIN account a ON tal.account = a.id
      JOIN transaction t ON tal.transaction = t.id
      WHERE t.subsidiary = ${subsidiaryId}
        AND t.trandate <= '${asOfDate}'
      GROUP BY a.acctnumber, a.acctname, a.accttype
      ORDER BY a.acctnumber
    `);
  }

  async getBalanceSheet(subsidiaryId, asOfDate) {
    return this.suiteql(`
      SELECT a.acctnumber, a.acctname, a.accttype, SUM(tal.amount) as balance
      FROM transactionaccountingline tal
      JOIN account a ON tal.account = a.id
      JOIN transaction t ON tal.transaction = t.id
      WHERE t.subsidiary = ${subsidiaryId}
        AND t.trandate <= '${asOfDate}'
        AND a.accttype IN ('Bank', 'AcctRec', 'OthCurrAsset', 'FixedAsset', 'OthAsset',
                           'AcctPay', 'CreditCard', 'OthCurrLiab', 'LongTermLiab',
                           'Equity', 'RetEarn')
      GROUP BY a.acctnumber, a.acctname, a.accttype
      ORDER BY a.accttype, a.acctnumber
    `);
  }

  // --- Multi-Currency ---
  async getExchangeRates() {
    return this.suiteql(`
      SELECT basecurrency, transactioncurrency, exchangerate, effectivedate
      FROM currencyexchangerate
      ORDER BY effectivedate DESC
    `);
  }

  // --- Consolidation ---
  async getConsolidatedBalances(parentSubId, asOfDate) {
    return this.suiteql(`
      SELECT s.name as entity, a.accttype, SUM(tal.amount) as balance
      FROM transactionaccountingline tal
      JOIN account a ON tal.account = a.id
      JOIN transaction t ON tal.transaction = t.id
      JOIN subsidiary s ON t.subsidiary = s.id
      WHERE (s.id = ${parentSubId} OR s.parent = ${parentSubId})
        AND t.trandate <= '${asOfDate}'
      GROUP BY s.name, a.accttype
      ORDER BY s.name, a.accttype
    `);
  }
}

module.exports = new NetSuiteConnector();
