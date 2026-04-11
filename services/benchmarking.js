/**
 * Benchmarking Service
 * Cambridge Associates, Preqin, ILPA standards, PME calculations,
 * peer comparison, quartile ranking, value creation bridge.
 */

class BenchmarkingService {

  /**
   * Calculate all fund performance metrics for benchmarking
   */
  calculatePerformanceMetrics({ cashFlows, currentNav, inceptionDate }) {
    const totalContributed = cashFlows
      .filter(cf => cf.type === 'contribution')
      .reduce((sum, cf) => sum + cf.amount, 0);
    const totalDistributed = cashFlows
      .filter(cf => cf.type === 'distribution')
      .reduce((sum, cf) => sum + cf.amount, 0);

    const tvpi = (totalDistributed + currentNav) / totalContributed;
    const dpi = totalDistributed / totalContributed;
    const rvpi = currentNav / totalContributed;
    const irr = this._calculateIrr(cashFlows, currentNav);
    const pic = totalContributed; // Paid-in capital

    return {
      irr: parseFloat((irr * 100).toFixed(2)),
      tvpi: parseFloat(tvpi.toFixed(4)),
      dpi: parseFloat(dpi.toFixed(4)),
      rvpi: parseFloat(rvpi.toFixed(4)),
      totalContributed,
      totalDistributed,
      currentNav,
      totalValue: totalDistributed + currentNav,
      inceptionDate,
      vintageYear: new Date(inceptionDate).getFullYear()
    };
  }

  /**
   * Quartile ranking against benchmark
   */
  quartileRanking({ fundMetrics, benchmarkData }) {
    const rankings = {};

    for (const metric of ['irr', 'tvpi', 'dpi']) {
      const fundValue = fundMetrics[metric];
      const benchmark = benchmarkData[metric]; // { q1, median, q3, top5, bottom5 }

      let quartile;
      let percentile;
      if (fundValue >= benchmark.q1) {
        quartile = 1;
        percentile = 75 + ((fundValue - benchmark.q1) / (benchmark.top5 - benchmark.q1)) * 25;
      } else if (fundValue >= benchmark.median) {
        quartile = 2;
        percentile = 50 + ((fundValue - benchmark.median) / (benchmark.q1 - benchmark.median)) * 25;
      } else if (fundValue >= benchmark.q3) {
        quartile = 3;
        percentile = 25 + ((fundValue - benchmark.q3) / (benchmark.median - benchmark.q3)) * 25;
      } else {
        quartile = 4;
        percentile = Math.max(0, ((fundValue - benchmark.bottom5) / (benchmark.q3 - benchmark.bottom5)) * 25);
      }

      rankings[metric] = {
        fundValue,
        quartile,
        percentile: Math.min(99, Math.max(1, parseFloat(percentile.toFixed(1)))),
        benchmark: {
          topQuartile: benchmark.q1,
          median: benchmark.median,
          bottomQuartile: benchmark.q3,
          top5Pct: benchmark.top5,
          bottom5Pct: benchmark.bottom5
        },
        vsMedian: parseFloat((fundValue - benchmark.median).toFixed(4)),
        status: quartile === 1 ? 'TOP_QUARTILE' : quartile === 2 ? 'ABOVE_MEDIAN' : quartile === 3 ? 'BELOW_MEDIAN' : 'BOTTOM_QUARTILE'
      };
    }

    return {
      fundName: fundMetrics.fundName,
      vintageYear: fundMetrics.vintageYear,
      strategy: fundMetrics.strategy,
      benchmarkSource: benchmarkData.source || 'Cambridge Associates',
      rankings
    };
  }

  /**
   * Public Market Equivalent (Kaplan-Schoar PME)
   */
  calculatePme({ cashFlows, currentNav, indexReturns }) {
    let fvContributions = 0;
    let fvDistributions = 0;

    for (const cf of cashFlows) {
      const growthFactor = this._getGrowthFactor(cf.date, indexReturns);
      if (cf.type === 'contribution') {
        fvContributions += cf.amount * growthFactor;
      } else {
        fvDistributions += cf.amount * growthFactor;
      }
    }

    const pme = (fvDistributions + currentNav) / fvContributions;

    // Direct Alpha
    const publicIrr = this._calculatePublicMarketIrr(cashFlows, indexReturns);
    const fundIrr = this._calculateIrr(cashFlows, currentNav);
    const directAlpha = fundIrr - publicIrr;

    return {
      kaplanSchoarPme: parseFloat(pme.toFixed(4)),
      interpretation: pme > 1.0
        ? `Fund outperformed public markets by ${((pme - 1) * 100).toFixed(1)}%`
        : `Fund underperformed public markets by ${((1 - pme) * 100).toFixed(1)}%`,
      fvContributions: parseFloat(fvContributions.toFixed(2)),
      fvDistributions: parseFloat(fvDistributions.toFixed(2)),
      currentNav,
      directAlpha: parseFloat((directAlpha * 100).toFixed(2)) + '%',
      fundIrr: parseFloat((fundIrr * 100).toFixed(2)) + '%',
      publicMarketIrr: parseFloat((publicIrr * 100).toFixed(2)) + '%',
      indexUsed: indexReturns.indexName || 'S&P 500'
    };
  }

  /**
   * Value creation bridge (attribution analysis)
   */
  valueCreationBridge(deals) {
    const bridges = deals.map(deal => {
      const entryEv = deal.entryMultiple * deal.entryEbitda;
      const exitEv = deal.exitMultiple * deal.exitEbitda;
      const equityAtEntry = entryEv - deal.entryDebt;
      const equityAtExit = exitEv - deal.exitDebt;
      const moic = equityAtExit / equityAtEntry;

      // Decompose returns
      const revenueGrowthContribution = (deal.exitRevenue / deal.entryRevenue - 1);
      const marginContribution = (deal.exitEbitda / deal.exitRevenue) - (deal.entryEbitda / deal.entryRevenue);
      const multipleExpansion = (deal.exitMultiple - deal.entryMultiple) / deal.entryMultiple;
      const leverageContribution = (deal.entryDebt - deal.exitDebt) / equityAtEntry;

      return {
        dealName: deal.name,
        entryDate: deal.entryDate,
        exitDate: deal.exitDate,
        holdPeriodYears: this._yearsBetween(deal.entryDate, deal.exitDate),
        equityInvested: equityAtEntry,
        equityRealized: equityAtExit,
        moic: parseFloat(moic.toFixed(2)),
        attribution: {
          revenueGrowth: parseFloat((revenueGrowthContribution * 100).toFixed(1)) + '%',
          marginExpansion: parseFloat((marginContribution * 100).toFixed(1)) + '%',
          multipleExpansion: parseFloat((multipleExpansion * 100).toFixed(1)) + '%',
          debtPaydown: parseFloat((leverageContribution * 100).toFixed(1)) + '%'
        },
        entryMetrics: {
          revenue: deal.entryRevenue,
          ebitda: deal.entryEbitda,
          multiple: deal.entryMultiple,
          debt: deal.entryDebt,
          margin: parseFloat(((deal.entryEbitda / deal.entryRevenue) * 100).toFixed(1)) + '%'
        },
        exitMetrics: {
          revenue: deal.exitRevenue,
          ebitda: deal.exitEbitda,
          multiple: deal.exitMultiple,
          debt: deal.exitDebt,
          margin: parseFloat(((deal.exitEbitda / deal.exitRevenue) * 100).toFixed(1)) + '%'
        }
      };
    });

    // Portfolio-level summary
    const totalInvested = bridges.reduce((sum, b) => sum + b.equityInvested, 0);
    const totalRealized = bridges.reduce((sum, b) => sum + b.equityRealized, 0);

    return {
      deals: bridges,
      portfolioSummary: {
        totalEquityInvested: totalInvested,
        totalEquityRealized: totalRealized,
        aggregateMoic: parseFloat((totalRealized / totalInvested).toFixed(2)),
        averageMoic: parseFloat((bridges.reduce((sum, b) => sum + b.moic, 0) / bridges.length).toFixed(2)),
        lossRatio: parseFloat(((bridges.filter(b => b.moic < 1).length / bridges.length) * 100).toFixed(1)) + '%'
      }
    };
  }

  /**
   * Peer fund comparison
   */
  peerComparison({ fund, peerFunds }) {
    const metrics = ['irr', 'tvpi', 'dpi', 'rvpi'];
    const comparison = {};

    for (const metric of metrics) {
      const values = peerFunds.map(p => p[metric]).sort((a, b) => b - a);
      const rank = values.filter(v => v > fund[metric]).length + 1;

      comparison[metric] = {
        fundValue: fund[metric],
        rank,
        outOf: peerFunds.length + 1,
        percentileRank: parseFloat((((peerFunds.length + 1 - rank) / (peerFunds.length + 1)) * 100).toFixed(1)),
        peerMedian: values[Math.floor(values.length / 2)],
        peerMean: parseFloat((values.reduce((s, v) => s + v, 0) / values.length).toFixed(4)),
        peerTop: values[0],
        peerBottom: values[values.length - 1],
        spread: parseFloat((fund[metric] - values[Math.floor(values.length / 2)]).toFixed(4))
      };
    }

    return {
      fundName: fund.name,
      peerCount: peerFunds.length,
      peerGroup: fund.strategy,
      vintageYear: fund.vintageYear,
      comparison,
      overallRanking: Object.values(comparison).every(c => c.percentileRank >= 75)
        ? 'CONSISTENTLY_TOP_QUARTILE'
        : Object.values(comparison).every(c => c.percentileRank >= 50)
        ? 'CONSISTENTLY_ABOVE_MEDIAN'
        : 'MIXED'
    };
  }

  // ==================== ADVANCED ANALYTICS (v5.0) ====================

  /**
   * Vintage year cohort analysis — compare funds by entry year
   */
  vintageCohortAnalysis({ funds, benchmarkData }) {
    const cohorts = {};
    for (const fund of funds) {
      const vintage = fund.vintageYear;
      if (!cohorts[vintage]) cohorts[vintage] = [];
      cohorts[vintage].push(fund);
    }

    return Object.entries(cohorts).map(([vintage, vintageFunds]) => {
      const irrs = vintageFunds.map(f => f.irr).filter(Boolean);
      const tvpis = vintageFunds.map(f => f.tvpi).filter(Boolean);
      const benchmark = benchmarkData?.[vintage] || null;

      return {
        vintageYear: parseInt(vintage),
        fundCount: vintageFunds.length,
        funds: vintageFunds.map(f => ({ name: f.name, irr: f.irr, tvpi: f.tvpi, dpi: f.dpi, status: f.status })),
        aggregateMetrics: {
          avgIrr: irrs.length > 0 ? parseFloat((irrs.reduce((s, v) => s + v, 0) / irrs.length).toFixed(2)) : null,
          medianIrr: irrs.length > 0 ? irrs.sort((a, b) => a - b)[Math.floor(irrs.length / 2)] : null,
          avgTvpi: tvpis.length > 0 ? parseFloat((tvpis.reduce((s, v) => s + v, 0) / tvpis.length).toFixed(4)) : null,
          dispersion: irrs.length >= 2 ? parseFloat((Math.max(...irrs) - Math.min(...irrs)).toFixed(2)) : null
        },
        benchmark: benchmark ? {
          medianIrr: benchmark.median,
          topQuartileIrr: benchmark.q1,
          bottomQuartileIrr: benchmark.q3,
          vsMedian: irrs.length > 0 ? parseFloat(((irrs.reduce((s, v) => s + v, 0) / irrs.length) - benchmark.median).toFixed(2)) : null
        } : null
      };
    }).sort((a, b) => a.vintageYear - b.vintageYear);
  }

  /**
   * Rolling period returns — 1yr, 3yr, 5yr, since inception
   */
  rollingReturns({ cashFlows, currentNav, periods }) {
    const defaultPeriods = [
      { label: '1 Year', months: 12 },
      { label: '3 Years', months: 36 },
      { label: '5 Years', months: 60 },
      { label: 'Since Inception', months: null }
    ];
    const usePeriods = periods || defaultPeriods;
    const now = new Date();

    return usePeriods.map(period => {
      const startDate = period.months
        ? new Date(now.getFullYear(), now.getMonth() - period.months, now.getDate())
        : new Date(cashFlows[0]?.date || now);

      const periodCashFlows = cashFlows.filter(cf => new Date(cf.date) >= startDate);
      const priorNav = period.months ? (cashFlows.find(cf => {
        const d = new Date(cf.date);
        return d >= startDate && d <= new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      })?.navAtDate || 0) : 0;

      const irr = periodCashFlows.length > 0
        ? this._calculateIrr(periodCashFlows, currentNav)
        : null;

      const contributions = periodCashFlows.filter(cf => cf.type === 'contribution').reduce((s, cf) => s + cf.amount, 0);
      const distributions = periodCashFlows.filter(cf => cf.type === 'distribution').reduce((s, cf) => s + cf.amount, 0);

      return {
        period: period.label,
        months: period.months || 'All',
        startDate: startDate.toISOString().split('T')[0],
        irr: irr !== null ? parseFloat((irr * 100).toFixed(2)) : null,
        contributions,
        distributions,
        endingNav: currentNav
      };
    });
  }

  /**
   * Dispersion analysis — distribution of returns across deals or funds
   */
  dispersionAnalysis({ returns, labels }) {
    if (!returns || returns.length === 0) return { available: false };

    const sorted = [...returns].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = sorted.reduce((s, v) => s + v, 0) / n;
    const variance = sorted.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    return {
      available: true,
      count: n,
      mean: parseFloat(mean.toFixed(4)),
      median: sorted[Math.floor(n / 2)],
      stdDev: parseFloat(stdDev.toFixed(4)),
      min: sorted[0],
      max: sorted[n - 1],
      range: parseFloat((sorted[n - 1] - sorted[0]).toFixed(4)),
      skewness: parseFloat((sorted.reduce((s, v) => s + Math.pow((v - mean) / stdDev, 3), 0) / n).toFixed(4)),
      percentiles: {
        p5: sorted[Math.floor(n * 0.05)],
        p10: sorted[Math.floor(n * 0.10)],
        p25: sorted[Math.floor(n * 0.25)],
        p50: sorted[Math.floor(n * 0.50)],
        p75: sorted[Math.floor(n * 0.75)],
        p90: sorted[Math.floor(n * 0.90)],
        p95: sorted[Math.floor(n * 0.95)]
      },
      outliers: {
        below: sorted.filter(v => v < mean - 2 * stdDev).length,
        above: sorted.filter(v => v > mean + 2 * stdDev).length
      },
      lossRatio: parseFloat(((sorted.filter(v => v < 0).length / n) * 100).toFixed(1)) + '%',
      winRatio: parseFloat(((sorted.filter(v => v > 0).length / n) * 100).toFixed(1)) + '%'
    };
  }

  /**
   * Stress testing — model performance under historical crisis scenarios
   */
  stressTest({ fundMetrics, stressScenarios }) {
    const defaults = stressScenarios || [
      { name: 'Global Financial Crisis (2008)', navDrawdown: -0.40, durationMonths: 18, recoveryMonths: 36 },
      { name: 'COVID-19 (2020)', navDrawdown: -0.25, durationMonths: 6, recoveryMonths: 12 },
      { name: 'Dot-Com Bust (2001)', navDrawdown: -0.35, durationMonths: 24, recoveryMonths: 48 },
      { name: 'Rising Rates (2022)', navDrawdown: -0.15, durationMonths: 12, recoveryMonths: 24 },
      { name: 'Severe Recession', navDrawdown: -0.50, durationMonths: 24, recoveryMonths: 48 }
    ];

    return defaults.map(scenario => {
      const stressedNav = fundMetrics.currentNav * (1 + scenario.navDrawdown);
      const stressedTvpi = (fundMetrics.totalDistributed + stressedNav) / fundMetrics.totalContributed;
      const stressedMoic = stressedTvpi;

      return {
        scenario: scenario.name,
        navDrawdown: (scenario.navDrawdown * 100) + '%',
        currentNav: fundMetrics.currentNav,
        stressedNav: parseFloat(stressedNav.toFixed(0)),
        navImpact: parseFloat((fundMetrics.currentNav * scenario.navDrawdown).toFixed(0)),
        currentTvpi: fundMetrics.tvpi,
        stressedTvpi: parseFloat(stressedTvpi.toFixed(4)),
        stressedMoic: parseFloat(stressedMoic.toFixed(4)),
        capitalAtRisk: parseFloat((fundMetrics.currentNav * Math.abs(scenario.navDrawdown)).toFixed(0)),
        expectedRecoveryMonths: scenario.recoveryMonths,
        carryImpact: stressedTvpi < 1.0 ? 'CARRY ELIMINATED — fund below cost basis' :
                     stressedTvpi < 1.0 + (fundMetrics.preferredReturn || 0.08) ? 'CARRY SUSPENDED — below preferred return' :
                     'CARRY REDUCED'
      };
    });
  }

  /**
   * Factor attribution — decompose returns into market beta, manager alpha, leverage
   */
  factorAttribution({ fundIrr, publicMarketIrr, leverageContribution, fxContribution }) {
    const alpha = fundIrr - publicMarketIrr - (leverageContribution || 0) - (fxContribution || 0);

    return {
      totalReturn: parseFloat((fundIrr * 100).toFixed(2)) + '%',
      decomposition: {
        marketBeta: parseFloat((publicMarketIrr * 100).toFixed(2)) + '%',
        managerAlpha: parseFloat((alpha * 100).toFixed(2)) + '%',
        leverageEffect: leverageContribution ? parseFloat((leverageContribution * 100).toFixed(2)) + '%' : '0%',
        fxEffect: fxContribution ? parseFloat((fxContribution * 100).toFixed(2)) + '%' : '0%'
      },
      interpretation: alpha > 0
        ? `Manager generated ${(alpha * 100).toFixed(1)}% alpha above public markets and leverage effects`
        : `Manager underperformed by ${(Math.abs(alpha) * 100).toFixed(1)}% relative to public market + leverage benchmark`,
      skillVsLuck: Math.abs(alpha) > 0.05 ? 'Statistically significant alpha' : 'Within noise range — insufficient evidence of skill vs luck'
    };
  }

  // --- Private ---

  _calculateIrr(cashFlows, currentNav, guess = 0.10) {
    // Newton-Raphson IRR solver
    const allFlows = [
      ...cashFlows.map(cf => ({
        amount: cf.type === 'contribution' ? -cf.amount : cf.amount,
        date: new Date(cf.date)
      })),
      { amount: currentNav, date: new Date() }
    ];

    const baseDate = allFlows[0].date;
    let rate = guess;

    for (let i = 0; i < 100; i++) {
      let npv = 0;
      let dnpv = 0;

      for (const cf of allFlows) {
        const years = (cf.date - baseDate) / (365.25 * 24 * 60 * 60 * 1000);
        npv += cf.amount / Math.pow(1 + rate, years);
        dnpv -= years * cf.amount / Math.pow(1 + rate, years + 1);
      }

      const newRate = rate - npv / dnpv;
      if (Math.abs(newRate - rate) < 0.00001) return newRate;
      rate = newRate;
    }

    return rate;
  }

  _getGrowthFactor(date, indexReturns) {
    // Simplified — in production, use actual index return series
    const years = (new Date() - new Date(date)) / (365.25 * 24 * 60 * 60 * 1000);
    const annualReturn = indexReturns.annualReturn || 0.10;
    return Math.pow(1 + annualReturn, years);
  }

  _calculatePublicMarketIrr(cashFlows, indexReturns) {
    return indexReturns.annualReturn || 0.10;
  }

  _yearsBetween(start, end) {
    return (new Date(end) - new Date(start)) / (365.25 * 24 * 60 * 60 * 1000);
  }
}

module.exports = new BenchmarkingService();
