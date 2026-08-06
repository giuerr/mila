/**
 * Audit Trail Service
 * Generates audit trails, compliance records, and PDF reports.
 */

const { createLLMClient } = require('../llm-client');
const accounting = require('../connectors/accounting');
const fundPlatforms = require('../connectors/fund-platforms');

const anthropic = createLLMClient();

class AuditService {

  /**
   * Generate a full audit trail for a fund period
   */
  async generateAuditTrail(fundId, startDate, endDate, { fundConnector = 'juniperSquare', accountingSystem = 'xero' }) {
    const platform = fundPlatforms[fundConnector];
    const acc = accounting[accountingSystem];

    const [capitalCalls, distributions, glData] = await Promise.all([
      platform.getCapitalCalls(fundId),
      platform.getDistributions(fundId),
      acc.getTrialBalance ? acc.getTrialBalance(endDate) : null
    ]);

    const trail = {
      fundId,
      period: { startDate, endDate },
      capitalActivity: {
        calls: capitalCalls,
        distributions: distributions
      },
      accountingData: glData,
      generatedAt: new Date().toISOString(),
      entries: []
    };

    // Build chronological audit entries
    for (const call of capitalCalls || []) {
      trail.entries.push({
        date: call.date,
        type: 'CAPITAL_CALL',
        description: `Capital call #${call.id} — ${call.amount}`,
        amount: call.amount,
        reference: call.id
      });
    }

    for (const dist of distributions || []) {
      trail.entries.push({
        date: dist.date,
        type: 'DISTRIBUTION',
        description: `Distribution #${dist.id} — ${dist.amount}`,
        amount: dist.amount,
        reference: dist.id
      });
    }

    trail.entries.sort((a, b) => new Date(a.date) - new Date(b.date));

    return trail;
  }

  /**
   * Generate regulatory filing data
   */
  async generateRegulatoryFiling(fundId, filingType, period, { fundConnector = 'juniperSquare', accountingSystem = 'netsuite' }) {
    const platform = fundPlatforms[fundConnector];
    const acc = accounting[accountingSystem];

    // Pull all necessary data
    const [nav, investors, capitalCalls, distributions] = await Promise.all([
      platform.getNav ? platform.getNav(fundId, period.endDate) : platform.getNavHistory(fundId),
      platform.getInvestors(fundId),
      platform.getCapitalCalls(fundId),
      platform.getDistributions(fundId)
    ]);

    const filingData = {
      fundId,
      filingType,
      period,
      nav,
      investorCount: investors?.length || 0,
      totalCapitalCalled: capitalCalls?.reduce((s, c) => s + c.amount, 0) || 0,
      totalDistributed: distributions?.reduce((s, d) => s + d.amount, 0) || 0
    };

    // Use AI to help structure the filing narrative
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `You are preparing a ${filingType} regulatory filing for Antoninus Global SPC (Cayman SPC).

Fund data:
${JSON.stringify(filingData, null, 2)}

Generate the narrative sections required for this filing type. Be precise with numbers.
Filing types and their requirements:
- FATCA: US investor disclosure, withholding status
- CRS: Common Reporting Standard for automatic exchange of information
- AIFMD: EU alternative investment fund managers directive — Annex IV
- Form_PF: SEC form for private fund advisers
- CIMA: Cayman Islands Monetary Authority fund annual return

Produce the filing in structured format with all required sections.`
      }]
    });

    return {
      ...filingData,
      narrative: response.content[0].text,
      generatedAt: new Date().toISOString()
    };
  }
}

module.exports = new AuditService();
