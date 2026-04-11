/**
 * Allvue Systems Connector (formerly AltaReturn)
 * REST API, API Key auth
 * Best for: PE/VC fund accounting, investor portal data, capital accounts
 */

const axios = require('axios');
const { breakers } = require('../../middleware/circuitBreaker');

class AllvueConnector {
  constructor() {
    this.baseUrl = process.env.ALLVUE_BASE_URL;
    this.apiKey = process.env.ALLVUE_API_KEY;
    this.breaker = breakers.allvue;
  }

  async request(method, endpoint, data = null) {
    return this.breaker.execute(async () => {
      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        },
        data,
        timeout: 30000
      };
      const res = await axios(config);
      return res.data;
    });
  }

  // --- Fund Accounting ---
  async getNav(fundId, asOfDate) {
    return this.request('GET', `/funds/${fundId}/nav?asOf=${asOfDate}`);
  }

  async getTrialBalance(fundId, asOfDate) {
    return this.request('GET', `/funds/${fundId}/trial-balance?asOf=${asOfDate}`);
  }

  async getGeneralLedger(fundId, startDate, endDate) {
    return this.request('GET', `/funds/${fundId}/gl?start=${startDate}&end=${endDate}`);
  }

  // --- Investor / LP Data ---
  async getInvestors(fundId) {
    return this.request('GET', `/funds/${fundId}/investors`);
  }

  async getCapitalAccounts(fundId, investorId) {
    return this.request('GET', `/funds/${fundId}/investors/${investorId}/capital-account`);
  }

  async getCapitalStatements(fundId, period) {
    return this.request('GET', `/funds/${fundId}/capital-statements?period=${period}`);
  }

  // --- Capital Calls & Distributions ---
  async getCapitalCalls(fundId) {
    return this.request('GET', `/funds/${fundId}/capital-calls`);
  }

  async getDistributions(fundId) {
    return this.request('GET', `/funds/${fundId}/distributions`);
  }

  // --- Portfolio Companies ---
  async getPortfolioCompanies(fundId) {
    return this.request('GET', `/funds/${fundId}/portfolio-companies`);
  }

  async getCompanyValuation(fundId, companyId) {
    return this.request('GET', `/funds/${fundId}/portfolio-companies/${companyId}/valuation`);
  }

  // --- Documents ---
  async getDocuments(fundId, docType) {
    return this.request('GET', `/funds/${fundId}/documents?type=${docType}`);
  }
}

module.exports = new AllvueConnector();
