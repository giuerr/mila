/**
 * Investran (FIS) Connector
 * SOAP + REST hybrid, credential-based auth
 * Best for: PE fund admin, partnership accounting, waterfall calculations
 */

const axios = require('axios');
const { breakers } = require('../../middleware/circuitBreaker');

class InvestranConnector {
  constructor() {
    this.baseUrl = process.env.INVESTRAN_BASE_URL;
    this.username = process.env.INVESTRAN_USERNAME;
    this.password = process.env.INVESTRAN_PASSWORD;
    this.sessionToken = null;
    this.breaker = breakers.investran;
  }

  async authenticate() {
    const res = await axios.post(`${this.baseUrl}/auth/login`, {
      username: this.username,
      password: this.password
    });
    this.sessionToken = res.data.sessionToken;
  }

  async request(method, endpoint, data = null) {
    return this.breaker.execute(async () => {
      if (!this.sessionToken) {
        await this.authenticate();
      }
      try {
        const res = await axios({
          method,
          url: `${this.baseUrl}${endpoint}`,
          headers: {
            'X-Session-Token': this.sessionToken,
            'Content-Type': 'application/json'
          },
          data,
          timeout: 30000
        });
        return res.data;
      } catch (err) {
        if (err.response?.status === 401) {
          await this.authenticate();
          const res = await axios({
            method,
            url: `${this.baseUrl}${endpoint}`,
            headers: {
              'X-Session-Token': this.sessionToken,
              'Content-Type': 'application/json'
            },
            data,
            timeout: 30000
          });
          return res.data;
        }
        throw err;
      }
    });
  }

  // --- Fund Data ---
  async getFunds() {
    return this.request('GET', '/funds');
  }

  async getFundDetails(fundId) {
    return this.request('GET', `/funds/${fundId}`);
  }

  // --- Capital Calls & Distributions ---
  async getCapitalCalls(fundId) {
    return this.request('GET', `/funds/${fundId}/capital-calls`);
  }

  async processCapitalCall(fundId, payload) {
    return this.request('POST', `/funds/${fundId}/capital-calls`, payload);
  }

  async getDistributions(fundId) {
    return this.request('GET', `/funds/${fundId}/distributions`);
  }

  async processDistribution(fundId, payload) {
    return this.request('POST', `/funds/${fundId}/distributions`, payload);
  }

  // --- Commitments ---
  async getCommitments(fundId) {
    return this.request('GET', `/funds/${fundId}/commitments`);
  }

  async getDrawdownSchedule(fundId) {
    return this.request('GET', `/funds/${fundId}/drawdown-schedule`);
  }

  // --- LP Capital Accounts ---
  async getCapitalAccounts(fundId) {
    return this.request('GET', `/funds/${fundId}/capital-accounts`);
  }

  async getCapitalAccountStatement(fundId, investorId, period) {
    return this.request('GET', `/funds/${fundId}/investors/${investorId}/statement?period=${period}`);
  }

  // --- Waterfall / Carried Interest ---
  async getWaterfallCalc(fundId) {
    return this.request('GET', `/funds/${fundId}/waterfall`);
  }

  async getCarriedInterest(fundId) {
    return this.request('GET', `/funds/${fundId}/carried-interest`);
  }

  // --- Partnership Accounting ---
  async getPartnershipAllocation(fundId, period) {
    return this.request('GET', `/funds/${fundId}/partnership-allocation?period=${period}`);
  }
}

module.exports = new InvestranConnector();
