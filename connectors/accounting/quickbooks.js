/**
 * QuickBooks Online Connector
 * REST API, OAuth2
 * Multi-currency, journal entries, class/dept segmentation
 * Rate limit: 500 req/min per realm
 */

const axios = require('axios');
const { breakers } = require('../../middleware/circuitBreaker');

class QuickBooksConnector {
  constructor() {
    this.baseUrl = process.env.QBO_BASE_URL;
    this.clientId = process.env.QBO_CLIENT_ID;
    this.clientSecret = process.env.QBO_CLIENT_SECRET;
    this.realmId = process.env.QBO_REALM_ID;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.breaker = breakers.quickbooks;
  }

  get companyUrl() {
    return `${this.baseUrl}/company/${this.realmId}`;
  }

  async refreshAccessToken() {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await axios.post('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      'grant_type=refresh_token&refresh_token=' + this.refreshToken,
      { headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }}
    );
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
        url: `${this.companyUrl}${endpoint}`,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        data,
        timeout: 30000
      });
      return res.data;
    });
  }

  // --- Journal Entries ---
  async createJournalEntry(entry) {
    return this.request('POST', '/journalentry', entry);
  }

  async getJournalEntry(id) {
    return this.request('GET', `/journalentry/${id}`);
  }

  // --- Chart of Accounts ---
  async getAccounts() {
    return this.request('GET', '/query?query=select * from Account');
  }

  async createAccount(account) {
    return this.request('POST', '/account', account);
  }

  // --- Customers (map to LPs) ---
  async getCustomers() {
    return this.request('GET', '/query?query=select * from Customer');
  }

  async createCustomer(customer) {
    return this.request('POST', '/customer', customer);
  }

  // --- Invoices (capital calls) ---
  async createInvoice(invoice) {
    return this.request('POST', '/invoice', invoice);
  }

  async getInvoices() {
    return this.request('GET', '/query?query=select * from Invoice');
  }

  // --- Vendors (fund expenses) ---
  async getVendors() {
    return this.request('GET', '/query?query=select * from Vendor');
  }

  // --- Reports ---
  async getBalanceSheet(date) {
    return this.request('GET', `/reports/BalanceSheet?date_macro=custom&end_date=${date}`);
  }

  async getProfitAndLoss(startDate, endDate) {
    return this.request('GET', `/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}`);
  }

  async getTrialBalance(date) {
    return this.request('GET', `/reports/TrialBalance?date_macro=custom&end_date=${date}`);
  }

  async getGeneralLedger(startDate, endDate) {
    return this.request('GET', `/reports/GeneralLedger?start_date=${startDate}&end_date=${endDate}`);
  }

  // --- Classes (fund/share class segmentation) ---
  async getClasses() {
    return this.request('GET', '/query?query=select * from Class');
  }

  // --- Currency ---
  async getExchangeRates() {
    return this.request('GET', '/query?query=select * from ExchangeRate');
  }
}

module.exports = new QuickBooksConnector();
