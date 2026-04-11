/**
 * Portfolio Company Health Scorecard Service
 * Real-time monitoring of portfolio company financial & operational health:
 *   - Financial KPI tracking (revenue, EBITDA, margins, growth)
 *   - Covenant monitoring with breach detection
 *   - Health scoring (composite 0-100)
 *   - Trend analysis (QoQ, YoY)
 *   - 3-statement model integration (IS, BS, CF)
 *   - Alert triggers for deteriorating metrics
 *   - Sector & portfolio-level aggregation
 */

class PortfolioHealthService {

  // ==================== HEALTH SCORECARD ====================

  /**
   * Generate comprehensive health scorecard for a portfolio company
   */
  generateScorecard(company) {
    const financial = this._scoreFinancialHealth(company);
    const growth = this._scoreGrowth(company);
    const operational = this._scoreOperational(company);
    const liquidity = this._scoreLiquidity(company);
    const leverage = this._scoreLeverage(company);

    const compositeScore = Math.round(
      financial.score * 0.25 +
      growth.score * 0.25 +
      operational.score * 0.20 +
      liquidity.score * 0.15 +
      leverage.score * 0.15
    );

    const alerts = this._generateAlerts(company, { financial, growth, operational, liquidity, leverage });

    return {
      companyId: company.id,
      companyName: company.name,
      sector: company.sector,
      investmentDate: company.investmentDate,
      asOfDate: company.reportingDate,

      compositeScore,
      rating: compositeScore >= 80 ? 'STRONG' : compositeScore >= 60 ? 'STABLE' : compositeScore >= 40 ? 'WATCH' : 'CRITICAL',
      ratingColor: compositeScore >= 80 ? '#27763d' : compositeScore >= 60 ? '#0066cc' : compositeScore >= 40 ? '#cc8800' : '#c0392b',

      pillars: {
        financial: { ...financial, weight: '25%' },
        growth: { ...growth, weight: '25%' },
        operational: { ...operational, weight: '20%' },
        liquidity: { ...liquidity, weight: '15%' },
        leverage: { ...leverage, weight: '15%' }
      },

      keyMetrics: this._extractKeyMetrics(company),
      trends: this._calculateTrends(company),
      alerts,
      covenantStatus: this._checkCovenants(company),
      threeStatementSummary: this._threeStatementSummary(company)
    };
  }

  // ==================== SCORING PILLARS ====================

  _scoreFinancialHealth(company) {
    const m = company.financials || {};
    let score = 50; // Base

    // Revenue quality
    if (m.recurringRevenuePct >= 80) score += 15;
    else if (m.recurringRevenuePct >= 50) score += 8;

    // Profitability
    if (m.ebitdaMargin >= 25) score += 15;
    else if (m.ebitdaMargin >= 15) score += 8;
    else if (m.ebitdaMargin >= 0) score += 3;
    else score -= 10;

    // Gross margin
    if (m.grossMargin >= 70) score += 10;
    else if (m.grossMargin >= 50) score += 5;

    // Cash flow positive
    if (m.freeCashFlow > 0) score += 10;
    else score -= 5;

    return {
      score: Math.min(100, Math.max(0, score)),
      metrics: {
        revenue: m.revenue,
        ebitda: m.ebitda,
        grossMargin: m.grossMargin ? m.grossMargin + '%' : null,
        ebitdaMargin: m.ebitdaMargin ? m.ebitdaMargin + '%' : null,
        netIncome: m.netIncome,
        freeCashFlow: m.freeCashFlow,
        recurringRevenuePct: m.recurringRevenuePct ? m.recurringRevenuePct + '%' : null
      }
    };
  }

  _scoreGrowth(company) {
    const m = company.financials || {};
    let score = 50;

    if (m.revenueGrowthYoY >= 50) score += 25;
    else if (m.revenueGrowthYoY >= 25) score += 15;
    else if (m.revenueGrowthYoY >= 10) score += 8;
    else if (m.revenueGrowthYoY >= 0) score += 0;
    else score -= 15;

    if (m.ebitdaGrowthYoY >= 30) score += 15;
    else if (m.ebitdaGrowthYoY >= 15) score += 8;
    else if (m.ebitdaGrowthYoY < 0) score -= 10;

    // Customer growth
    if (m.customerGrowthYoY >= 30) score += 10;
    else if (m.customerGrowthYoY >= 10) score += 5;

    return {
      score: Math.min(100, Math.max(0, score)),
      metrics: {
        revenueGrowthYoY: m.revenueGrowthYoY ? m.revenueGrowthYoY + '%' : null,
        revenueGrowthQoQ: m.revenueGrowthQoQ ? m.revenueGrowthQoQ + '%' : null,
        ebitdaGrowthYoY: m.ebitdaGrowthYoY ? m.ebitdaGrowthYoY + '%' : null,
        customerGrowthYoY: m.customerGrowthYoY ? m.customerGrowthYoY + '%' : null,
        arr: m.arr,
        nrr: m.netRevenueRetention ? m.netRevenueRetention + '%' : null
      }
    };
  }

  _scoreOperational(company) {
    const m = company.operational || {};
    let score = 50;

    // Employee productivity
    if (m.revenuePerEmployee >= 300000) score += 15;
    else if (m.revenuePerEmployee >= 150000) score += 8;

    // Customer metrics (SaaS)
    if (m.netRevenueRetention >= 120) score += 15;
    else if (m.netRevenueRetention >= 100) score += 8;
    else if (m.netRevenueRetention < 90) score -= 10;

    // Churn
    if (m.grossChurnRate <= 5) score += 10;
    else if (m.grossChurnRate <= 10) score += 5;
    else if (m.grossChurnRate > 20) score -= 10;

    // Management team completeness
    if (m.keyRolesFilled >= 90) score += 10;
    else if (m.keyRolesFilled >= 70) score += 5;
    else score -= 5;

    return {
      score: Math.min(100, Math.max(0, score)),
      metrics: {
        headcount: m.headcount,
        revenuePerEmployee: m.revenuePerEmployee,
        netRevenueRetention: m.netRevenueRetention ? m.netRevenueRetention + '%' : null,
        grossChurnRate: m.grossChurnRate ? m.grossChurnRate + '%' : null,
        customerCount: m.customerCount,
        keyRolesFilled: m.keyRolesFilled ? m.keyRolesFilled + '%' : null,
        ltv_cac: m.ltvToCac
      }
    };
  }

  _scoreLiquidity(company) {
    const m = company.financials || {};
    let score = 50;

    // Cash runway
    if (m.cashRunwayMonths >= 24) score += 20;
    else if (m.cashRunwayMonths >= 12) score += 10;
    else if (m.cashRunwayMonths >= 6) score += 0;
    else score -= 20;

    // Current ratio
    if (m.currentRatio >= 2.0) score += 15;
    else if (m.currentRatio >= 1.5) score += 10;
    else if (m.currentRatio >= 1.0) score += 5;
    else score -= 15;

    // Working capital
    if (m.workingCapital > 0) score += 10;
    else score -= 10;

    // Cash conversion
    if (m.cashConversionCycle <= 30) score += 5;
    else if (m.cashConversionCycle > 90) score -= 5;

    return {
      score: Math.min(100, Math.max(0, score)),
      metrics: {
        cash: m.cash,
        cashRunwayMonths: m.cashRunwayMonths,
        currentRatio: m.currentRatio,
        quickRatio: m.quickRatio,
        workingCapital: m.workingCapital,
        cashConversionCycle: m.cashConversionCycle ? m.cashConversionCycle + ' days' : null
      }
    };
  }

  _scoreLeverage(company) {
    const m = company.financials || {};
    let score = 50;

    // Debt/EBITDA
    if (m.netDebtToEbitda <= 1) score += 20;
    else if (m.netDebtToEbitda <= 3) score += 10;
    else if (m.netDebtToEbitda <= 5) score += 0;
    else score -= 15;

    // Interest coverage
    if (m.interestCoverage >= 5) score += 15;
    else if (m.interestCoverage >= 3) score += 8;
    else if (m.interestCoverage >= 1.5) score += 0;
    else score -= 15;

    // Debt/equity
    if (m.debtToEquity <= 0.5) score += 10;
    else if (m.debtToEquity <= 1.0) score += 5;
    else if (m.debtToEquity > 2.0) score -= 10;

    // No debt = maximum score
    if (!m.totalDebt || m.totalDebt === 0) score = 95;

    return {
      score: Math.min(100, Math.max(0, score)),
      metrics: {
        totalDebt: m.totalDebt,
        netDebt: m.netDebt,
        netDebtToEbitda: m.netDebtToEbitda ? m.netDebtToEbitda + 'x' : null,
        interestCoverage: m.interestCoverage ? m.interestCoverage + 'x' : null,
        debtToEquity: m.debtToEquity ? m.debtToEquity + 'x' : null,
        fixedChargeCoverage: m.fixedChargeCoverage ? m.fixedChargeCoverage + 'x' : null
      }
    };
  }

  // ==================== COVENANT MONITORING ====================

  _checkCovenants(company) {
    const covenants = company.covenants || [];
    if (covenants.length === 0) return { hasCovenants: false, status: 'N/A', covenants: [] };

    const results = covenants.map(c => {
      const actual = this._getCovenantActual(company, c.metric);
      let inCompliance;

      if (c.type === 'MINIMUM') inCompliance = actual >= c.threshold;
      else if (c.type === 'MAXIMUM') inCompliance = actual <= c.threshold;
      else inCompliance = actual >= c.min && actual <= c.max;

      const headroom = c.type === 'MINIMUM'
        ? ((actual - c.threshold) / c.threshold * 100)
        : ((c.threshold - actual) / c.threshold * 100);

      return {
        name: c.name,
        metric: c.metric,
        type: c.type,
        threshold: c.threshold,
        actual: parseFloat(actual.toFixed(2)),
        inCompliance,
        headroom: parseFloat(headroom.toFixed(1)) + '%',
        warning: Math.abs(headroom) < 15,
        breached: !inCompliance,
        lender: c.lender,
        testFrequency: c.testFrequency || 'Quarterly',
        consequence: c.consequence || 'Default event — potential acceleration of debt'
      };
    });

    const breached = results.filter(r => r.breached);
    const warnings = results.filter(r => r.warning && !r.breached);

    return {
      hasCovenants: true,
      status: breached.length > 0 ? 'BREACH' : warnings.length > 0 ? 'WARNING' : 'COMPLIANT',
      totalCovenants: results.length,
      breachedCount: breached.length,
      warningCount: warnings.length,
      covenants: results
    };
  }

  _getCovenantActual(company, metric) {
    const m = company.financials || {};
    const map = {
      'debt_to_ebitda': m.netDebtToEbitda || 0,
      'interest_coverage': m.interestCoverage || 0,
      'current_ratio': m.currentRatio || 0,
      'debt_to_equity': m.debtToEquity || 0,
      'fixed_charge_coverage': m.fixedChargeCoverage || 0,
      'minimum_ebitda': m.ebitda || 0,
      'minimum_revenue': m.revenue || 0,
      'maximum_capex': m.capex || 0,
      'minimum_cash': m.cash || 0
    };
    return map[metric] || 0;
  }

  // ==================== 3-STATEMENT MODEL ====================

  _threeStatementSummary(company) {
    const m = company.financials || {};

    return {
      incomeStatement: {
        revenue: m.revenue,
        cogs: m.cogs,
        grossProfit: m.grossProfit,
        grossMargin: m.grossMargin,
        opex: m.opex,
        ebitda: m.ebitda,
        ebitdaMargin: m.ebitdaMargin,
        depreciation: m.depreciation,
        interestExpense: m.interestExpense,
        taxExpense: m.taxExpense,
        netIncome: m.netIncome,
        netMargin: m.revenue ? parseFloat(((m.netIncome / m.revenue) * 100).toFixed(1)) : null
      },
      balanceSheet: {
        cash: m.cash,
        accountsReceivable: m.accountsReceivable,
        inventory: m.inventory,
        totalCurrentAssets: m.totalCurrentAssets,
        ppe: m.ppe,
        goodwill: m.goodwill,
        intangibles: m.intangibles,
        totalAssets: m.totalAssets,
        accountsPayable: m.accountsPayable,
        currentDebt: m.currentDebt,
        totalCurrentLiabilities: m.totalCurrentLiabilities,
        longTermDebt: m.longTermDebt,
        totalLiabilities: m.totalLiabilities,
        totalEquity: m.totalEquity,
        bookValue: m.totalEquity
      },
      cashFlow: {
        operatingCashFlow: m.operatingCashFlow,
        capex: m.capex,
        freeCashFlow: m.freeCashFlow,
        acquisitions: m.acquisitions,
        debtRepayment: m.debtRepayment,
        equityIssuance: m.equityIssuance,
        netCashFlow: m.netCashFlow
      }
    };
  }

  // ==================== TRENDS & ALERTS ====================

  _extractKeyMetrics(company) {
    const m = company.financials || {};
    return {
      revenue: m.revenue,
      ebitda: m.ebitda,
      revenueGrowth: m.revenueGrowthYoY ? m.revenueGrowthYoY + '%' : null,
      ebitdaMargin: m.ebitdaMargin ? m.ebitdaMargin + '%' : null,
      cash: m.cash,
      cashRunway: m.cashRunwayMonths ? m.cashRunwayMonths + ' months' : null,
      headcount: company.operational?.headcount,
      evAtEntry: company.evAtEntry,
      currentEv: company.currentEv,
      moic: company.moic,
      irr: company.irr
    };
  }

  _calculateTrends(company) {
    const hist = company.historicalFinancials || [];
    if (hist.length < 2) return { available: false };

    const latest = hist[hist.length - 1];
    const prior = hist[hist.length - 2];

    return {
      available: true,
      period: `${prior.period} → ${latest.period}`,
      revenue: { current: latest.revenue, prior: prior.revenue, change: parseFloat(((latest.revenue - prior.revenue) / prior.revenue * 100).toFixed(1)) + '%' },
      ebitda: { current: latest.ebitda, prior: prior.ebitda, change: prior.ebitda !== 0 ? parseFloat(((latest.ebitda - prior.ebitda) / Math.abs(prior.ebitda) * 100).toFixed(1)) + '%' : 'N/M' },
      cash: { current: latest.cash, prior: prior.cash, change: parseFloat(((latest.cash - prior.cash) / prior.cash * 100).toFixed(1)) + '%' },
      headcount: { current: latest.headcount, prior: prior.headcount, change: prior.headcount ? (latest.headcount - prior.headcount) : null }
    };
  }

  _generateAlerts(company, scores) {
    const alerts = [];
    const m = company.financials || {};

    if (scores.financial.score < 40) alerts.push({ severity: 'CRITICAL', type: 'FINANCIAL_HEALTH', message: `${company.name}: Financial health score critically low (${scores.financial.score}/100)` });
    if (scores.growth.score < 30) alerts.push({ severity: 'HIGH', type: 'GROWTH_STALL', message: `${company.name}: Growth metrics deteriorating — revenue growth ${m.revenueGrowthYoY || 0}%` });
    if (m.cashRunwayMonths && m.cashRunwayMonths < 6) alerts.push({ severity: 'CRITICAL', type: 'CASH_RUNWAY', message: `${company.name}: Cash runway below 6 months (${m.cashRunwayMonths} months)` });
    if (m.cashRunwayMonths && m.cashRunwayMonths < 12 && m.cashRunwayMonths >= 6) alerts.push({ severity: 'HIGH', type: 'CASH_RUNWAY', message: `${company.name}: Cash runway 6-12 months — monitor closely` });
    if (scores.leverage.score < 30) alerts.push({ severity: 'HIGH', type: 'LEVERAGE', message: `${company.name}: Leverage levels elevated (score: ${scores.leverage.score}/100)` });
    if (m.ebitdaMargin < 0) alerts.push({ severity: 'MEDIUM', type: 'PROFITABILITY', message: `${company.name}: Negative EBITDA margin (${m.ebitdaMargin}%)` });
    if (m.revenueGrowthYoY < 0) alerts.push({ severity: 'MEDIUM', type: 'REVENUE_DECLINE', message: `${company.name}: Revenue declining YoY (${m.revenueGrowthYoY}%)` });

    return alerts;
  }

  // ==================== PORTFOLIO-LEVEL AGGREGATION ====================

  /**
   * Portfolio-wide health dashboard
   */
  getPortfolioHealthDashboard(companies) {
    const scorecards = companies.map(c => this.generateScorecard(c));

    const distribution = { STRONG: 0, STABLE: 0, WATCH: 0, CRITICAL: 0 };
    scorecards.forEach(s => distribution[s.rating]++);

    const allAlerts = scorecards.flatMap(s => s.alerts).sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return order[a.severity] - order[b.severity];
    });

    const allCovenantBreaches = scorecards
      .filter(s => s.covenantStatus.status === 'BREACH')
      .map(s => ({ company: s.companyName, breaches: s.covenantStatus.covenants.filter(c => c.breached) }));

    const avgScore = Math.round(scorecards.reduce((sum, s) => sum + s.compositeScore, 0) / scorecards.length);

    return {
      portfolioAvgScore: avgScore,
      portfolioRating: avgScore >= 80 ? 'STRONG' : avgScore >= 60 ? 'STABLE' : avgScore >= 40 ? 'WATCH' : 'CRITICAL',
      companyCount: companies.length,
      ratingDistribution: distribution,
      scorecards: scorecards.sort((a, b) => a.compositeScore - b.compositeScore), // Worst first
      alerts: allAlerts,
      alertCount: { CRITICAL: allAlerts.filter(a => a.severity === 'CRITICAL').length, HIGH: allAlerts.filter(a => a.severity === 'HIGH').length, MEDIUM: allAlerts.filter(a => a.severity === 'MEDIUM').length },
      covenantBreaches: allCovenantBreaches,
      topPerformers: scorecards.filter(s => s.compositeScore >= 80).map(s => ({ name: s.companyName, score: s.compositeScore })),
      needsAttention: scorecards.filter(s => s.compositeScore < 40).map(s => ({ name: s.companyName, score: s.compositeScore, alerts: s.alerts }))
    };
  }
}

module.exports = new PortfolioHealthService();
