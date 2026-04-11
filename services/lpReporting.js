/**
 * LP Reporting Service
 * AI-generated investor communications personalized by investor type.
 * Generates: quarterly letters, deal updates, market commentary, event recaps.
 */

const Anthropic = require('@anthropic-ai/sdk');
const fundPlatforms = require('../connectors/fund-platforms');

const anthropic = new Anthropic();

const INVESTOR_TYPES = {
  VC: 'Venture Capital fund',
  PE: 'Private Equity fund',
  FAMILY_OFFICE: 'Family Office',
  PENSION: 'Pension Fund',
  ENDOWMENT: 'University Endowment',
  SOVEREIGN: 'Sovereign Wealth Fund',
  INSURANCE: 'Insurance Company',
  FUND_OF_FUNDS: 'Fund of Funds',
  HNWI: 'High Net Worth Individual',
  CORPORATE: 'Corporate / Strategic Investor'
};

const REPORT_TYPES = {
  QUARTERLY_LETTER: 'quarterly_letter',
  DEAL_UPDATE: 'deal_update',
  MARKET_COMMENTARY: 'market_commentary',
  EVENT_RECAP: 'event_recap',
  CAPITAL_CALL_NOTICE: 'capital_call_notice',
  DISTRIBUTION_NOTICE: 'distribution_notice',
  ESG_REPORT: 'esg_report',
  ANNUAL_REVIEW: 'annual_review'
};

class LPReportingService {

  /**
   * Generate a personalized quarterly LP letter
   */
  async generateQuarterlyLetter({ fundId, quarter, year, investorType, fundData, portfolioHighlights, connector = 'juniperSquare' }) {
    const platform = fundPlatforms[connector];

    // Pull live data from fund platform
    const [performance, capitalActivity, investors] = await Promise.all([
      platform.getNavHistory ? platform.getNavHistory(fundId) : platform.getNav(fundId, `${year}-${quarter * 3}-30`),
      platform.getCapitalCalls(fundId),
      platform.getInvestors(fundId)
    ]);

    const prompt = this._buildQuarterlyPrompt({
      quarter, year, investorType, performance, capitalActivity, portfolioHighlights
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });

    return {
      type: REPORT_TYPES.QUARTERLY_LETTER,
      investorType,
      quarter: `Q${quarter} ${year}`,
      content: response.content[0].text,
      fundData: { performance, capitalActivity },
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Generate a deal update for LPs
   */
  async generateDealUpdate({ fundId, dealName, dealDetails, investorType, connector = 'juniperSquare' }) {
    const platform = fundPlatforms[connector];
    const portfolioData = platform.getPortfolioCompanies
      ? await platform.getPortfolioCompanies(fundId)
      : null;

    const prompt = `You are the CFO communications team at a private capital fund (Antoninus Global SPC).
Write a deal update letter for an LP who is a ${INVESTOR_TYPES[investorType] || investorType}.

Deal: ${dealName}
Details: ${JSON.stringify(dealDetails)}
${portfolioData ? `Portfolio context: ${JSON.stringify(portfolioData)}` : ''}

Personalization guidelines for ${INVESTOR_TYPES[investorType] || investorType}:
${this._getPersonalizationGuidelines(investorType)}

Write a professional, concise deal update (500-800 words). Include:
- Deal summary and thesis
- Key metrics and valuation context
- Strategic fit within the portfolio
- Risk factors and mitigants
- Next steps / timeline

Tone: institutional, confident, transparent.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    return {
      type: REPORT_TYPES.DEAL_UPDATE,
      investorType,
      dealName,
      content: response.content[0].text,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Generate market commentary
   */
  async generateMarketCommentary({ sector, region, investorType, keyThemes, dataPoints }) {
    const prompt = `You are the CFO communications team at Antoninus Global SPC.
Write a market commentary for an LP who is a ${INVESTOR_TYPES[investorType] || investorType}.

Sector: ${sector}
Region: ${region}
Key Themes: ${JSON.stringify(keyThemes)}
Data Points: ${JSON.stringify(dataPoints)}

Personalization for ${INVESTOR_TYPES[investorType] || investorType}:
${this._getPersonalizationGuidelines(investorType)}

Write an insightful market commentary (600-1000 words). Include:
- Macro environment and sector dynamics
- Key trends and their implications for our portfolio
- Opportunities we're watching
- Risks and how we're positioned
- Outlook for next quarter

Tone: thoughtful, data-driven, forward-looking.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }]
    });

    return {
      type: REPORT_TYPES.MARKET_COMMENTARY,
      investorType,
      sector,
      region,
      content: response.content[0].text,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Generate event recap (AGM, advisory board, LP meeting)
   */
  async generateEventRecap({ eventName, eventDate, eventType, highlights, decisions, investorType }) {
    const prompt = `You are the CFO communications team at Antoninus Global SPC.
Write an event recap for an LP who is a ${INVESTOR_TYPES[investorType] || investorType}.

Event: ${eventName}
Date: ${eventDate}
Type: ${eventType}
Highlights: ${JSON.stringify(highlights)}
Key Decisions: ${JSON.stringify(decisions)}

Personalization for ${INVESTOR_TYPES[investorType] || investorType}:
${this._getPersonalizationGuidelines(investorType)}

Write a professional event recap (400-700 words). Include:
- Event overview and purpose
- Key discussion topics
- Decisions made and rationale
- Action items and next steps
- Relevant materials or follow-up

Tone: clear, organized, actionable.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    return {
      type: REPORT_TYPES.EVENT_RECAP,
      investorType,
      eventName,
      eventDate,
      content: response.content[0].text,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Batch-generate personalized reports for all investor types
   */
  async generateBatchReports({ fundId, reportType, params, connector = 'juniperSquare' }) {
    const investorTypes = Object.keys(INVESTOR_TYPES);
    const reports = {};

    const generators = {
      [REPORT_TYPES.QUARTERLY_LETTER]: (type) => this.generateQuarterlyLetter({ ...params, fundId, investorType: type, connector }),
      [REPORT_TYPES.DEAL_UPDATE]: (type) => this.generateDealUpdate({ ...params, fundId, investorType: type, connector }),
      [REPORT_TYPES.MARKET_COMMENTARY]: (type) => this.generateMarketCommentary({ ...params, investorType: type }),
      [REPORT_TYPES.EVENT_RECAP]: (type) => this.generateEventRecap({ ...params, investorType: type })
    };

    const generator = generators[reportType];
    if (!generator) throw new Error(`Unknown report type: ${reportType}`);

    const results = await Promise.allSettled(
      investorTypes.map(type => generator(type))
    );

    investorTypes.forEach((type, i) => {
      reports[type] = results[i].status === 'fulfilled'
        ? results[i].value
        : { error: results[i].reason?.message };
    });

    return reports;
  }

  // --- Private helpers ---

  _buildQuarterlyPrompt({ quarter, year, investorType, performance, capitalActivity, portfolioHighlights }) {
    return `You are the CFO communications team at Antoninus Global SPC, a Cayman-domiciled fund.
Write a quarterly LP letter for Q${quarter} ${year}, personalized for an LP who is a ${INVESTOR_TYPES[investorType] || investorType}.

Fund Performance Data:
${JSON.stringify(performance, null, 2)}

Capital Activity:
${JSON.stringify(capitalActivity, null, 2)}

Portfolio Highlights:
${JSON.stringify(portfolioHighlights, null, 2)}

Personalization guidelines for ${INVESTOR_TYPES[investorType] || investorType}:
${this._getPersonalizationGuidelines(investorType)}

Write a comprehensive quarterly letter (1000-1500 words). Structure:
1. Opening / Executive Summary
2. Fund Performance (NAV, IRR, MOIC, DPI as applicable)
3. Portfolio Activity (new investments, follow-ons, exits)
4. Portfolio Company Updates (top 3-5 positions)
5. Market Environment & Outlook
6. Capital Account Summary
7. Upcoming Events / Important Dates
8. Closing

Tone: institutional, transparent, confident but measured. Numbers should be precise.`;
  }

  _getPersonalizationGuidelines(investorType) {
    const guidelines = {
      VC: `- Emphasize growth metrics: ARR, MRR, user growth, TAM penetration
- Focus on follow-on investment opportunities and co-invest pipeline
- Highlight technology trends and sector thesis validation
- Use startup/tech vernacular where appropriate`,

      PE: `- Emphasize value creation: EBITDA growth, margin expansion, operational improvements
- Focus on entry/exit multiples and IRR attribution
- Highlight add-on acquisition pipeline
- Use traditional PE metrics and benchmarking language`,

      FAMILY_OFFICE: `- Balance between capital preservation and growth narrative
- Emphasize alignment of interests and long-term orientation
- Include broader macro context and wealth preservation themes
- More personal, relationship-oriented tone
- Mention co-investment and direct deal opportunities`,

      PENSION: `- Emphasize risk-adjusted returns and downside protection
- Include ESG/responsible investment metrics
- Reference benchmark performance (Cambridge, Preqin, etc.)
- Focus on cash yield (DPI) and liquidity profile
- Formal, compliance-ready language
- Include vintage year context and J-curve positioning`,

      ENDOWMENT: `- Emphasize long-term compounding and multi-generational perspective
- Include academic/research-oriented market analysis
- Reference relevant endowment model benchmarks
- Highlight mission-aligned or impact investments if applicable`,

      SOVEREIGN: `- Highly formal, institutional tone
- Emphasize geopolitical and macro considerations
- Include geographic diversification analysis
- Reference global benchmarks and peer comparisons
- Focus on absolute returns and FX hedging where relevant`,

      INSURANCE: `- Emphasize yield, duration matching, and liability-driven considerations
- Focus on capital efficiency and Solvency II/RBC implications
- Include cash flow predictability and distribution timeline
- Risk-weighted return analysis`,

      FUND_OF_FUNDS: `- Include detailed attribution analysis
- Focus on strategy diversification and portfolio construction benefits
- Provide granular exposure breakdowns
- Reference manager-level performance data
- Include fee structure transparency (gross vs. net)`,

      HNWI: `- Clear, accessible language (avoid excessive jargon)
- Emphasize wealth growth and tangible outcomes
- Include lifestyle/aspirational context where relevant
- Personal touch — reference previous conversations or preferences
- Highlight liquidity events and distribution timeline`,

      CORPORATE: `- Emphasize strategic value beyond financial returns
- Highlight technology scouting and innovation pipeline
- Focus on market intelligence and competitive positioning
- Include potential M&A or commercial partnership opportunities`
    };

    return guidelines[investorType] || '- Use standard institutional investor communication guidelines';
  }
}

module.exports = new LPReportingService();
