/**
 * Portfolio Company Financial Monitoring
 * Collect financials, covenant tracking, budget vs. actual,
 * board reporting, exit preparation, interim finance leadership.
 */

const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic();

class PortfolioMonitoringService {

  /**
   * Portfolio company financial dashboard
   */
  generateDashboard(companies) {
    return {
      totalCompanies: companies.length,
      totalInvested: companies.reduce((s, c) => s + c.costBasis, 0),
      totalCurrentValue: companies.reduce((s, c) => s + c.currentValue, 0),
      aggregateMoic: parseFloat((companies.reduce((s, c) => s + c.currentValue, 0) / companies.reduce((s, c) => s + c.costBasis, 0)).toFixed(4)),
      companies: companies.map(co => ({
        name: co.name,
        sector: co.sector,
        investmentDate: co.investmentDate,
        costBasis: co.costBasis,
        currentValue: co.currentValue,
        moic: parseFloat((co.currentValue / co.costBasis).toFixed(2)),
        revenue: co.latestFinancials?.revenue,
        revenueGrowthYoY: co.latestFinancials?.revenueGrowthYoY,
        ebitda: co.latestFinancials?.ebitda,
        ebitdaMargin: co.latestFinancials?.ebitda && co.latestFinancials?.revenue
          ? parseFloat(((co.latestFinancials.ebitda / co.latestFinancials.revenue) * 100).toFixed(1)) + '%'
          : null,
        netDebt: co.latestFinancials?.netDebt,
        leverage: co.latestFinancials?.ebitda && co.latestFinancials?.netDebt
          ? parseFloat((co.latestFinancials.netDebt / co.latestFinancials.ebitda).toFixed(2)) + 'x'
          : null,
        cashRunway: co.latestFinancials?.cashRunwayMonths,
        status: this._healthStatus(co),
        lastReportDate: co.latestFinancials?.reportDate,
        reportingStatus: this._reportingStatus(co)
      })),
      alerts: this._generateAlerts(companies),
      byStatus: {
        green: companies.filter(c => this._healthStatus(c) === 'GREEN').length,
        amber: companies.filter(c => this._healthStatus(c) === 'AMBER').length,
        red: companies.filter(c => this._healthStatus(c) === 'RED').length
      }
    };
  }

  /**
   * Track financial covenants
   */
  trackCovenants(company) {
    const covenants = company.covenants || [];

    return {
      companyName: company.name,
      covenants: covenants.map(cov => {
        const compliant = cov.type === 'MAX'
          ? cov.actual <= cov.threshold
          : cov.actual >= cov.threshold;
        const headroom = cov.type === 'MAX'
          ? cov.threshold - cov.actual
          : cov.actual - cov.threshold;
        const headroomPct = parseFloat(((headroom / cov.threshold) * 100).toFixed(1));

        return {
          name: cov.name,
          type: cov.type, // MAX (leverage) or MIN (coverage)
          threshold: cov.threshold,
          actual: cov.actual,
          compliant,
          headroom: parseFloat(headroom.toFixed(4)),
          headroomPct: headroomPct + '%',
          testDate: cov.testDate,
          frequency: cov.frequency,
          warning: headroomPct < 10 && headroomPct > 0
            ? 'APPROACHING THRESHOLD — within 10% headroom'
            : null,
          breach: !compliant
            ? `COVENANT BREACH: ${cov.name} at ${cov.actual} vs threshold of ${cov.threshold}`
            : null
        };
      }),
      allCompliant: covenants.every(cov =>
        cov.type === 'MAX' ? cov.actual <= cov.threshold : cov.actual >= cov.threshold
      ),
      breachCount: covenants.filter(cov =>
        cov.type === 'MAX' ? cov.actual > cov.threshold : cov.actual < cov.threshold
      ).length
    };
  }

  /**
   * Budget vs. actual analysis for portfolio company
   */
  budgetVsActual(company) {
    const metrics = ['revenue', 'ebitda', 'capex', 'freeCashFlow', 'headcount'];
    const analysis = {};

    for (const metric of metrics) {
      const budget = company.budget?.[metric];
      const actual = company.actual?.[metric];
      if (budget === undefined || actual === undefined) continue;

      const variance = actual - budget;
      const variancePct = budget !== 0 ? (variance / budget) * 100 : 0;

      analysis[metric] = {
        budget,
        actual,
        variance: parseFloat(variance.toFixed(2)),
        variancePct: parseFloat(variancePct.toFixed(1)) + '%',
        status: Math.abs(variancePct) <= 5 ? 'ON_TRACK' : variancePct > 5 ? 'ABOVE_PLAN' : 'BELOW_PLAN',
        isPositiveVariance: (metric === 'revenue' || metric === 'ebitda' || metric === 'freeCashFlow')
          ? variance > 0
          : variance < 0 // For capex, below budget is good
      };
    }

    return {
      companyName: company.name,
      period: company.period,
      metrics: analysis,
      overallAssessment: Object.values(analysis).filter(a => !a.isPositiveVariance && a.status === 'BELOW_PLAN').length > 2
        ? 'UNDERPERFORMING' : 'ON_TRACK'
    };
  }

  /**
   * Exit readiness assessment
   */
  async assessExitReadiness(company) {
    const financialReadiness = {
      auditedFinancials: company.hasAuditedFinancials,
      qualityOfEarnings: company.hasQofE,
      threeYearHistory: company.yearsOfFinancials >= 3,
      cleanAccounting: company.cleanAccounting,
      recurringRevenuePct: company.recurringRevenuePct,
      revenueGrowthRate: company.revenueGrowthYoY,
      ebitdaMargin: company.ebitdaMargin,
      netDebtToEbitda: company.leverage
    };

    const operationalReadiness = {
      strongManagementTeam: company.managementStrength,
      scalableSystems: company.systemsScalable,
      ipProtected: company.ipProtected,
      customerConcentration: company.topCustomerPct,
      employeeRetention: company.employeeRetention
    };

    const readinessScore = this._calculateReadinessScore(financialReadiness, operationalReadiness);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Assess exit readiness for ${company.name}. Financial: ${JSON.stringify(financialReadiness)}. Operational: ${JSON.stringify(operationalReadiness)}. Score: ${readinessScore}/100. Provide: 1) Key strengths for exit, 2) Gaps to address, 3) Recommended exit timeline, 4) Likely exit routes (IPO, strategic M&A, financial sponsor). Be concise and specific.`
      }]
    });

    return {
      companyName: company.name,
      readinessScore,
      readinessLevel: readinessScore >= 80 ? 'EXIT_READY' : readinessScore >= 60 ? 'NEAR_READY' : 'NOT_READY',
      financialReadiness,
      operationalReadiness,
      exitRoutes: this._evaluateExitRoutes(company),
      aiAssessment: response.content[0].text,
      recommendedActions: readinessScore < 80
        ? this._getReadinessActions(financialReadiness, operationalReadiness)
        : ['Company is exit-ready — begin preparing marketing materials']
    };
  }

  /**
   * Financial due diligence / Quality of Earnings (QofE) review template
   */
  generateQofETemplate(company) {
    return {
      companyName: company.name,
      sections: [
        {
          name: 'Revenue Quality',
          items: [
            'Revenue recognition policy and ASC 606 compliance',
            'Recurring vs. non-recurring revenue breakdown',
            'Customer concentration analysis (top 10 customers)',
            'Revenue cohort analysis and retention rates',
            'Backlog and pipeline analysis',
            'Pricing trends and contract terms'
          ]
        },
        {
          name: 'EBITDA Adjustments',
          items: [
            'One-time / non-recurring expenses',
            'Run-rate cost savings (recently implemented)',
            'Owner/management add-backs',
            'Related party transaction adjustments',
            'Pro-forma adjustments for recent acquisitions',
            'Stock-based compensation impact'
          ]
        },
        {
          name: 'Working Capital',
          items: [
            'Net working capital definition and normalization',
            'Seasonality analysis',
            'Accounts receivable aging and collectability',
            'Inventory obsolescence risk',
            'Accounts payable terms and sustainability',
            'Working capital peg calculation'
          ]
        },
        {
          name: 'Capital Expenditures',
          items: [
            'Maintenance vs. growth capex split',
            'Deferred maintenance assessment',
            'Technology debt and required investment',
            'Capex as % of revenue trends'
          ]
        },
        {
          name: 'Debt & Off-Balance Sheet',
          items: [
            'Debt schedule and covenant compliance',
            'Operating lease obligations (ASC 842)',
            'Contingent liabilities and pending litigation',
            'Environmental liabilities',
            'Earn-out and deferred consideration obligations'
          ]
        },
        {
          name: 'Tax',
          items: [
            'Effective tax rate analysis',
            'NOL/tax credit carryforwards',
            'Tax audit history and exposure',
            'Transfer pricing compliance',
            'State and local tax nexus'
          ]
        }
      ]
    };
  }

  // --- Private ---

  _healthStatus(co) {
    if (!co.latestFinancials) return 'AMBER';
    if (co.currentValue < co.costBasis * 0.5) return 'RED';
    if (co.latestFinancials.ebitda < 0 && co.latestFinancials.cashRunwayMonths < 6) return 'RED';
    if (co.currentValue < co.costBasis) return 'AMBER';
    if (co.latestFinancials.revenueGrowthYoY < 0) return 'AMBER';
    return 'GREEN';
  }

  _reportingStatus(co) {
    if (!co.latestFinancials?.reportDate) return 'OVERDUE';
    const daysSinceReport = (new Date() - new Date(co.latestFinancials.reportDate)) / (1000 * 60 * 60 * 24);
    if (daysSinceReport > 120) return 'OVERDUE';
    if (daysSinceReport > 90) return 'LATE';
    return 'CURRENT';
  }

  _generateAlerts(companies) {
    const alerts = [];
    for (const co of companies) {
      if (this._healthStatus(co) === 'RED')
        alerts.push({ severity: 'CRITICAL', company: co.name, message: 'Below 0.5x cost basis or negative EBITDA with <6mo runway' });
      if (this._reportingStatus(co) === 'OVERDUE')
        alerts.push({ severity: 'HIGH', company: co.name, message: 'Financial reporting overdue (>120 days)' });
      if (co.covenants?.some(c => c.type === 'MAX' ? c.actual > c.threshold : c.actual < c.threshold))
        alerts.push({ severity: 'CRITICAL', company: co.name, message: 'Covenant breach detected' });
    }
    return alerts;
  }

  _calculateReadinessScore(financial, operational) {
    let score = 0;
    if (financial.auditedFinancials) score += 15;
    if (financial.qualityOfEarnings) score += 10;
    if (financial.threeYearHistory) score += 10;
    if (financial.cleanAccounting) score += 10;
    if (financial.recurringRevenuePct > 70) score += 10;
    if (financial.revenueGrowthRate > 0.15) score += 10;
    if (financial.ebitdaMargin > 0.20) score += 5;
    if (operational.strongManagementTeam) score += 10;
    if (operational.scalableSystems) score += 5;
    if (operational.ipProtected) score += 5;
    if (operational.customerConcentration < 20) score += 5;
    if (operational.employeeRetention > 85) score += 5;
    return Math.min(score, 100);
  }

  _evaluateExitRoutes(co) {
    const routes = [];
    if (co.revenue > 100000000 && co.revenueGrowthYoY > 0.20) routes.push({ route: 'IPO', likelihood: 'HIGH' });
    routes.push({ route: 'Strategic M&A', likelihood: co.strategicBuyerInterest ? 'HIGH' : 'MEDIUM' });
    routes.push({ route: 'Financial Sponsor Sale', likelihood: 'MEDIUM' });
    if (co.ebitda > 0) routes.push({ route: 'Dividend Recap', likelihood: co.leverage < 3 ? 'MEDIUM' : 'LOW' });
    return routes;
  }

  _getReadinessActions(financial, operational) {
    const actions = [];
    if (!financial.auditedFinancials) actions.push('Engage Big 4 / national firm for audited financials');
    if (!financial.qualityOfEarnings) actions.push('Commission vendor Quality of Earnings report');
    if (!financial.threeYearHistory) actions.push('Compile 3+ years of financial history');
    if (!operational.strongManagementTeam) actions.push('Strengthen management bench — consider adding CEO/CFO');
    if (!operational.scalableSystems) actions.push('Invest in ERP/systems scalability');
    if (operational.customerConcentration >= 20) actions.push('Diversify customer base — top customer >20% of revenue');
    return actions;
  }
}

module.exports = new PortfolioMonitoringService();
