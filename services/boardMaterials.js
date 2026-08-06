/**
 * Board / LPAC Materials Service
 * Advisory committee packages, conflict memos, valuation reviews,
 * board books, risk dashboards, portfolio reviews.
 */

const { createLLMClient } = require('../llm-client');
const anthropic = createLLMClient();

class BoardMaterialsService {

  /**
   * Generate comprehensive LPAC package
   */
  async generateLpacPackage({
    fund, portfolio, conflicts, valuations, compliance, period
  }) {
    // Generate AI narrative sections
    const narrative = await this._generateNarrative({
      type: 'LPAC',
      fund,
      portfolio,
      period
    });

    return {
      title: `LPAC Package — ${fund.name} — ${period}`,
      generatedAt: new Date().toISOString(),
      sections: [
        {
          number: 1,
          title: 'Executive Summary',
          content: narrative.executiveSummary
        },
        {
          number: 2,
          title: 'Fund Performance Overview',
          data: {
            nav: fund.nav,
            grossIrr: fund.grossIrr,
            netIrr: fund.netIrr,
            tvpi: fund.tvpi,
            dpi: fund.dpi,
            rvpi: fund.rvpi,
            vintageYear: fund.vintageYear,
            paidInCapital: fund.paidInCapital,
            totalDistributions: fund.totalDistributions
          }
        },
        {
          number: 3,
          title: 'Portfolio Activity',
          data: {
            newInvestments: portfolio.newInvestments || [],
            followOns: portfolio.followOns || [],
            realizations: portfolio.realizations || [],
            writedowns: portfolio.writedowns || [],
            pipelineDeals: portfolio.pipeline || []
          }
        },
        {
          number: 4,
          title: 'Portfolio Company Updates',
          data: portfolio.companies?.map(co => ({
            name: co.name,
            sector: co.sector,
            investmentDate: co.investmentDate,
            costBasis: co.costBasis,
            currentValue: co.currentValue,
            moic: parseFloat((co.currentValue / co.costBasis).toFixed(2)),
            revenue: co.revenue,
            ebitda: co.ebitda,
            keyDevelopments: co.keyDevelopments
          }))
        },
        {
          number: 5,
          title: 'Conflict of Interest Disclosures',
          data: conflicts.map(c => ({
            conflictId: c.id,
            description: c.description,
            partiesInvolved: c.parties,
            type: c.type, // CROSS_FUND, AFFILIATE_TRANSACTION, VALUATION, CO_INVEST
            financialImpact: c.impact,
            recommendation: c.recommendation,
            lpacApprovalRequired: c.requiresApproval,
            status: c.status
          }))
        },
        {
          number: 6,
          title: 'Valuation Summary',
          data: {
            methodology: valuations.methodology,
            thirdPartyProvider: valuations.provider,
            level3Summary: valuations.level3Summary,
            significantChanges: valuations.significantChanges,
            committeeApprovalDate: valuations.approvalDate
          }
        },
        {
          number: 7,
          title: 'Compliance & Regulatory Update',
          data: {
            filingsCompleted: compliance.completed,
            filingsPending: compliance.pending,
            regulatoryChanges: compliance.regulatoryChanges,
            complianceTestingResults: compliance.testingResults,
            incidentsReported: compliance.incidents
          }
        },
        {
          number: 8,
          title: 'Risk Dashboard',
          data: this._generateRiskDashboard(fund, portfolio)
        },
        {
          number: 9,
          title: 'Capital Account Summary',
          data: {
            totalCommitments: fund.totalCommitments,
            calledCapital: fund.paidInCapital,
            uncalledCapital: fund.totalCommitments - fund.paidInCapital,
            picRatio: parseFloat(((fund.paidInCapital / fund.totalCommitments) * 100).toFixed(1)) + '%',
            recycledCapital: fund.recycledCapital || 0,
            creditFacilityUsage: fund.creditFacility || {}
          }
        },
        {
          number: 10,
          title: 'Key Person & Team Updates',
          data: {
            keyPersonStatus: fund.keyPersons?.map(kp => ({
              name: kp.name,
              role: kp.role,
              status: kp.status || 'ACTIVE'
            })),
            newHires: fund.teamChanges?.newHires || [],
            departures: fund.teamChanges?.departures || []
          }
        },
        {
          number: 11,
          title: 'Upcoming Dates & Action Items',
          data: {
            nextLpacMeeting: fund.nextLpacDate,
            annualMeeting: fund.annualMeetingDate,
            upcomingFilings: compliance.upcoming,
            actionItems: fund.actionItems || []
          }
        }
      ]
    };
  }

  /**
   * Generate conflict of interest memo for LPAC review
   */
  async generateConflictMemo({ conflict, fundDetails }) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `You are the CFO of Antoninus Global SPC preparing a conflict of interest memo for LPAC review.

Conflict Details:
- Type: ${conflict.type}
- Description: ${conflict.description}
- Parties: ${JSON.stringify(conflict.parties)}
- Financial Impact: ${JSON.stringify(conflict.impact)}
- Fund: ${fundDetails.name}

Write a formal conflict memo with these sections:
1. Summary of the Conflict
2. Relevant LPA Provisions
3. Analysis of the Conflict
4. Financial Impact Assessment
5. Mitigation Measures
6. Recommendation (approve/deny with conditions)
7. LPAC Vote Required (yes/no and rationale)

Be thorough, balanced, and transparent. This must withstand regulatory scrutiny.`
      }]
    });

    return {
      conflictId: conflict.id,
      type: conflict.type,
      memo: response.content[0].text,
      generatedAt: new Date().toISOString(),
      lpacApprovalRequired: true,
      status: 'PENDING_REVIEW'
    };
  }

  /**
   * Generate quarterly board book
   */
  async generateBoardBook({ fund, financials, portfolio, market, operations, period }) {
    const narrative = await this._generateNarrative({
      type: 'BOARD_BOOK',
      fund,
      portfolio,
      period
    });

    return {
      title: `Board Book — ${fund.name} — ${period}`,
      sections: [
        { title: 'Chairman\'s Letter / Executive Summary', content: narrative.executiveSummary },
        {
          title: 'Financial Statements',
          data: {
            balanceSheet: financials.balanceSheet,
            incomeStatement: financials.incomeStatement,
            cashFlow: financials.cashFlowStatement,
            partnersCapital: financials.partnersCapital
          }
        },
        {
          title: 'Portfolio Review',
          data: portfolio.companies?.map(co => ({
            name: co.name,
            status: co.status,
            costBasis: co.costBasis,
            fairValue: co.currentValue,
            moic: parseFloat((co.currentValue / co.costBasis).toFixed(2)),
            irr: co.irr,
            keyMetrics: co.keyMetrics,
            developments: co.keyDevelopments
          }))
        },
        {
          title: 'Deployment & Pipeline',
          data: {
            periodDeployment: portfolio.periodDeployment,
            cumulativeDeployment: portfolio.cumulativeDeployment,
            pipeline: portfolio.pipeline
          }
        },
        { title: 'Market Commentary', content: narrative.marketCommentary },
        {
          title: 'Concentration Analysis',
          data: this._concentrationAnalysis(portfolio)
        },
        {
          title: 'Operational Report',
          data: {
            staffing: operations.staffing,
            technology: operations.technology,
            vendorChanges: operations.vendorChanges,
            insuranceRenewals: operations.insurance
          }
        },
        {
          title: 'Compliance Summary',
          data: operations.compliance
        }
      ],
      generatedAt: new Date().toISOString()
    };
  }

  // --- Private ---

  _generateRiskDashboard(fund, portfolio) {
    const companies = portfolio.companies || [];
    const totalValue = companies.reduce((sum, c) => sum + c.currentValue, 0);

    return {
      concentrationRisk: {
        top5HoldingsPct: parseFloat(
          ((companies
            .sort((a, b) => b.currentValue - a.currentValue)
            .slice(0, 5)
            .reduce((sum, c) => sum + c.currentValue, 0) / totalValue) * 100
          ).toFixed(1)) + '%',
        largestHolding: companies.sort((a, b) => b.currentValue - a.currentValue)[0]?.name,
        largestHoldingPct: companies.length > 0
          ? parseFloat(((companies.sort((a, b) => b.currentValue - a.currentValue)[0].currentValue / totalValue) * 100).toFixed(1)) + '%'
          : '0%'
      },
      liquidityRisk: {
        cashToNav: fund.cash ? parseFloat(((fund.cash / fund.nav) * 100).toFixed(1)) + '%' : 'N/A',
        creditFacilityUtilization: fund.creditFacility?.utilization || 'N/A'
      },
      fxRisk: {
        foreignCurrencyExposure: fund.fxExposure || 'N/A'
      },
      sectorDiversification: this._groupByField(companies, 'sector', totalValue),
      geographyDiversification: this._groupByField(companies, 'geography', totalValue)
    };
  }

  _concentrationAnalysis(portfolio) {
    const companies = portfolio.companies || [];
    const totalValue = companies.reduce((sum, c) => sum + c.currentValue, 0);

    return {
      bySector: this._groupByField(companies, 'sector', totalValue),
      byGeography: this._groupByField(companies, 'geography', totalValue),
      byVintage: this._groupByField(companies, 'investmentYear', totalValue),
      byStage: this._groupByField(companies, 'stage', totalValue)
    };
  }

  _groupByField(items, field, total) {
    const groups = {};
    for (const item of items) {
      const key = item[field] || 'Other';
      if (!groups[key]) groups[key] = 0;
      groups[key] += item.currentValue;
    }
    return Object.entries(groups).map(([name, value]) => ({
      name,
      value,
      pct: parseFloat(((value / total) * 100).toFixed(1)) + '%'
    })).sort((a, b) => b.value - a.value);
  }

  async _generateNarrative({ type, fund, portfolio, period }) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `You are the CFO of Antoninus Global SPC. Generate narrative sections for a ${type} for ${period}.

Fund: ${fund.name}
NAV: ${fund.nav}
IRR: ${fund.netIrr}
TVPI: ${fund.tvpi}
Portfolio companies: ${portfolio.companies?.length || 0}

Write:
1. Executive Summary (250-400 words) — professional, institutional tone
2. Market Commentary (200-300 words) — relevant macro and sector context

Be specific with metrics. Institutional tone.`
      }]
    });

    const text = response.content[0].text;
    const parts = text.split(/(?=Market Commentary|2\.|##\s*Market)/i);

    return {
      executiveSummary: parts[0] || text,
      marketCommentary: parts[1] || ''
    };
  }
}

module.exports = new BoardMaterialsService();
