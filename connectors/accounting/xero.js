/**
 * Xero Connector
 * REST API, OAuth2 (authorization code + PKCE)
 * Multi-currency, journal entries, contacts (LPs), reporting
 * Rate limit: 60 calls/min, 5,000/day per tenant
 */

const axios = require('axios');
const { breakers } = require('../../middleware/circuitBreaker');

class XeroConnector {
  constructor() {
    this.breaker = breakers.xero;
    this.baseUrl = process.env.XERO_BASE_URL;
    this.clientId = process.env.XERO_CLIENT_ID;
    this.clientSecret = process.env.XERO_CLIENT_SECRET;
    this.tenantId = process.env.XERO_TENANT_ID;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
  }

  getHeaders() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'xero-tenant-id': this.tenantId,
      'Content-Type': 'application/json'
    };
  }

  async refreshAccessToken() {
    const res = await axios.post('https://identity.xero.com/connect/token', {
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret
    }, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    this.accessToken = res.data.access_token;
    this.refreshToken = res.data.refresh_token;
    this.tokenExpiry = Date.now() + (res.data.expires_in * 1000);
  }

  async request(method, endpoint, data = null) {
    return this.breaker.execute(async () => {
      if (!this.accessToken || Date.now() >= this.tokenExpiry) {
        await this.refreshAccessToken();
      }
      const res = await axios({
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: this.getHeaders(),
        data,
        timeout: 30000
      });
      return res.data;
    });
  }

  // --- Journal Entries (core for fund accounting) ---
  async createManualJournal(journal) {
    return this.request('POST', '/ManualJournals', { ManualJournals: [journal] });
  }

  async getManualJournals() {
    return this.request('GET', '/ManualJournals');
  }

  // --- Chart of Accounts ---
  async getAccounts() {
    return this.request('GET', '/Accounts');
  }

  async createAccount(account) {
    return this.request('PUT', '/Accounts', { Accounts: [account] });
  }

  // --- Contacts (map to LPs) ---
  async getContacts() {
    return this.request('GET', '/Contacts');
  }

  async createContact(contact) {
    return this.request('POST', '/Contacts', { Contacts: [contact] });
  }

  // --- Invoices (capital calls as invoices) ---
  async createInvoice(invoice) {
    return this.request('POST', '/Invoices', { Invoices: [invoice] });
  }

  async getInvoices(status) {
    const query = status ? `?where=Status=="${status}"` : '';
    return this.request('GET', `/Invoices${query}`);
  }

  // --- Bank Transactions ---
  async getBankTransactions() {
    return this.request('GET', '/BankTransactions');
  }

  // --- Multi-Currency ---
  async getCurrencies() {
    return this.request('GET', '/Currencies');
  }

  // --- Tracking Categories (fund/share class tagging) ---
  async getTrackingCategories() {
    return this.request('GET', '/TrackingCategories');
  }

  // --- Reports ---
  async getBalanceSheet(date) {
    return this.request('GET', `/Reports/BalanceSheet?date=${date}`);
  }

  async getProfitAndLoss(fromDate, toDate) {
    return this.request('GET', `/Reports/ProfitAndLoss?fromDate=${fromDate}&toDate=${toDate}`);
  }

  async getTrialBalance(date) {
    return this.request('GET', `/Reports/TrialBalance?date=${date}`);
  }
}

module.exports = new XeroConnector();
