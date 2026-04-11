/**
 * eFront (BlackRock) Connector
 * REST API, OAuth2
 * Best for: Alternative investment lifecycle, LP portfolio monitoring, ESG
 */

const axios = require('axios');
const { breakers } = require('../../middleware/circuitBreaker');

class EFrontConnector {
  constructor() {
    this.baseUrl = process.env.EFRONT_BASE_URL;
    this.clientId = process.env.EFRONT_CLIENT_ID;
    this.clientSecret = process.env.EFRONT_CLIENT_SECRET;
    this.accessToken = null;
    this.tokenExpiry = null;
    this.breaker = breakers.efront;
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

  // --- Fund Lifecycle ---
  async getFunds() {
    return this.request('GET', '/funds');
  }

  async getFundDetails(fundId) {
    return this.request('GET', `/funds/${fundId}`);
  }

  // --- Capital Activity ---
  async getCapitalCalls(fundId) {
    return this.request('GET', `/funds/${fundId}/capital-calls`);
  }

  async getDistributions(fundId) {
    return this.request('GET', `/funds/${fundId}/distributions`);
  }

  // --- NAV & Valuations ---
  async getNav(fundId, asOfDate) {
    return this.request('GET', `/funds/${fundId}/nav?asOf=${asOfDate}`);
  }

  async getValuations(fundId) {
    return this.request('GET', `/funds/${fundId}/valuations`);
  }

  // --- LP / Investor Reporting ---
  async getInvestors(fundId) {
    return this.request('GET', `/funds/${fundId}/investors`);
  }

  async getCapitalAccountStatement(fundId, investorId) {
    return this.request('GET', `/funds/${fundId}/investors/${investorId}/capital-account`);
  }

  // --- Cash Flow Modeling ---
  async getCashFlowForecast(fundId) {
    return this.request('GET', `/funds/${fundId}/cash-flow-forecast`);
  }

  // --- Portfolio Monitoring ---
  async getPortfolioCompanies(fundId) {
    return this.request('GET', `/funds/${fundId}/portfolio`);
  }

  // --- ESG ---
  async getEsgData(fundId) {
    return this.request('GET', `/funds/${fundId}/esg`);
  }

  // --- Cap Table ---
  async getCapTable(fundId) {
    return this.request('GET', `/funds/${fundId}/cap-table`);
  }

  // --- Documents ---
  async getDocuments(fundId) {
    return this.request('GET', `/funds/${fundId}/documents`);
  }
}

module.exports = new EFrontConnector();
