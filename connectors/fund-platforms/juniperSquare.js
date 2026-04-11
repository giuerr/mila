/**
 * Juniper Square Connector
 * REST API, OAuth2 client credentials
 * Best for: GP fundraising, LP reporting, capital calls/distributions
 */

const axios = require('axios');
const { breakers } = require('../../middleware/circuitBreaker');

class JuniperSquareConnector {
  constructor() {
    this.breaker = breakers.juniperSquare;
    this.baseUrl = process.env.JUNIPER_BASE_URL;
    this.clientId = process.env.JUNIPER_CLIENT_ID;
    this.clientSecret = process.env.JUNIPER_CLIENT_SECRET;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async authenticate() {
    const res = await axios.post(`${this.baseUrl}/oauth/token`, {
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret
    });
    this.accessToken = res.data.access_token;
    this.tokenExpiry = Date.now() + (res.data.expires_in * 1000);
    return this.accessToken;
  }

  async request(method, endpoint, data = null) {
    return this.breaker.execute(async () => {
      if (!this.accessToken || Date.now() >= this.tokenExpiry) {
        await this.authenticate();
      }
      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: { Authorization: `Bearer ${this.accessToken}` },
        data,
        timeout: 30000
      };
      const res = await axios(config);
      return res.data;
    });
  }

  // --- Investors / LPs ---
  async getInvestors(fundId) {
    return this.request('GET', `/funds/${fundId}/investors`);
  }

  async getInvestorDetails(investorId) {
    return this.request('GET', `/investors/${investorId}`);
  }

  // --- Capital Activity ---
  async getCapitalCalls(fundId) {
    return this.request('GET', `/funds/${fundId}/capital-calls`);
  }

  async createCapitalCall(fundId, payload) {
    return this.request('POST', `/funds/${fundId}/capital-calls`, payload);
  }

  async getDistributions(fundId) {
    return this.request('GET', `/funds/${fundId}/distributions`);
  }

  async createDistribution(fundId, payload) {
    return this.request('POST', `/funds/${fundId}/distributions`, payload);
  }

  // --- Fund Reporting ---
  async getFundPerformance(fundId) {
    return this.request('GET', `/funds/${fundId}/performance`);
  }

  async getNavHistory(fundId) {
    return this.request('GET', `/funds/${fundId}/nav`);
  }

  // --- Commitments & Cap Table ---
  async getCommitments(fundId) {
    return this.request('GET', `/funds/${fundId}/commitments`);
  }

  async getCapTable(fundId) {
    return this.request('GET', `/funds/${fundId}/cap-table`);
  }

  // --- Documents ---
  async uploadDocument(fundId, document) {
    return this.request('POST', `/funds/${fundId}/documents`, document);
  }

  async getDocuments(fundId) {
    return this.request('GET', `/funds/${fundId}/documents`);
  }

  // --- Webhooks ---
  async registerWebhook(url, events) {
    return this.request('POST', '/webhooks', { url, events });
  }
}

module.exports = new JuniperSquareConnector();
