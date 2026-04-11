/**
 * SS&C Geneva Connector
 * REST API (cloud), OAuth2
 * Best for: Hedge fund + PE back-office accounting, multi-currency NAV
 */

const axios = require('axios');
const { breakers } = require('../../middleware/circuitBreaker');

class GenevaConnector {
  constructor() {
    this.baseUrl = process.env.GENEVA_BASE_URL;
    this.clientId = process.env.GENEVA_CLIENT_ID;
    this.clientSecret = process.env.GENEVA_CLIENT_SECRET;
    this.accessToken = null;
    this.tokenExpiry = null;
    this.breaker = breakers.geneva;
  }

  async authenticate() {
    const res = await axios.post(`${this.baseUrl}/oauth/token`, {
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret
    });
    this.accessToken = res.data.access_token;
    this.tokenExpiry = Date.now() + (res.data.expires_in * 1000);
  }

  async request(method, endpoint, data = null) {
    return this.breaker.execute(async () => {
      if (!this.accessToken || Date.now() >= this.tokenExpiry) {
        await this.authenticate();
      }
      const res = await axios({
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: { Authorization: `Bearer ${this.accessToken}` },
        data,
        timeout: 30000
      });
      return res.data;
    });
  }

  // --- Portfolio Accounting ---
  async getNav(portfolioId, asOfDate) {
    return this.request('GET', `/portfolios/${portfolioId}/nav?asOf=${asOfDate}`);
  }

  async getPositions(portfolioId, asOfDate) {
    return this.request('GET', `/portfolios/${portfolioId}/positions?asOf=${asOfDate}`);
  }

  async getTrialBalance(portfolioId, asOfDate) {
    return this.request('GET', `/portfolios/${portfolioId}/trial-balance?asOf=${asOfDate}`);
  }

  // --- Investor Allocations ---
  async getInvestorAllocations(portfolioId) {
    return this.request('GET', `/portfolios/${portfolioId}/investor-allocations`);
  }

  async getCapitalAccounts(portfolioId) {
    return this.request('GET', `/portfolios/${portfolioId}/capital-accounts`);
  }

  // --- Trade & Settlement ---
  async getTrades(portfolioId, startDate, endDate) {
    return this.request('GET', `/portfolios/${portfolioId}/trades?start=${startDate}&end=${endDate}`);
  }

  // --- Performance ---
  async getPerformance(portfolioId, period) {
    return this.request('GET', `/portfolios/${portfolioId}/performance?period=${period}`);
  }

  async getIrr(portfolioId) {
    return this.request('GET', `/portfolios/${portfolioId}/irr`);
  }

  // --- GL / Journal Entries ---
  async getJournalEntries(portfolioId, startDate, endDate) {
    return this.request('GET', `/portfolios/${portfolioId}/journal-entries?start=${startDate}&end=${endDate}`);
  }

  // --- Regulatory Reporting ---
  async getFormPF(portfolioId, period) {
    return this.request('GET', `/portfolios/${portfolioId}/regulatory/form-pf?period=${period}`);
  }

  async getAifmd(portfolioId, period) {
    return this.request('GET', `/portfolios/${portfolioId}/regulatory/aifmd?period=${period}`);
  }
}

module.exports = new GenevaConnector();
