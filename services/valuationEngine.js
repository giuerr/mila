/**
 * Valuation Engine (ASC 820)
 * Fair value hierarchy, private company valuation methods,
 * valuation committee support, back-testing.
 */

class ValuationEngineService {

  /**
   * Market approach — comparable company multiples
   */
  marketApproach({ targetCompany, comparableCompanies, selectedMultiple = 'EV_EBITDA', dlom = 0.20 }) {
    // Calculate comparable multiples
    const multiples = comparableCompanies.map(comp => {
      const multiple = this._getMultiple(comp, selectedMultiple);
      return {
        name: comp.name,
        ticker: comp.ticker,
        multiple: parseFloat(multiple.toFixed(2)),
        marketCap: comp.marketCap,
        revenue: comp.revenue,
        ebitda: comp.ebitda,
        revenueGrowth: comp.revenueGrowth,
        ebitdaMargin: comp.ebitda / comp.revenue
      };
    });

    const sortedMultiples = multiples.map(m => m.multiple).sort((a, b) => a - b);
    const medianMultiple = sortedMultiples[Math.floor(sortedMultiples.length / 2)];
    const meanMultiple = sortedMultiples.reduce((sum, m) => sum + m, 0) / sortedMultiples.length;
    const q1 = sortedMultiples[Math.floor(sortedMultiples.length * 0.25)];
    const q3 = sortedMultiples[Math.floor(sortedMultiples.length * 0.75)];

    // Apply to target
    const targetMetric = selectedMultiple === 'EV_REVENUE'
      ? targetCompany.revenue
      : targetCompany.ebitda;

    const enterpriseValue = targetMetric * medianMultiple;
    const equityValue = enterpriseValue - targetCompany.netDebt;
    const adjustedEquityValue = equityValue * (1 - dlom);

    return {
      method: 'MARKET_APPROACH',
      selectedMultiple,
      comparables: multiples,
      multipleStatistics: {
        mean: parseFloat(meanMultiple.toFixed(2)),
        median: parseFloat(medianMultiple.toFixed(2)),
        q1: parseFloat(q1.toFixed(2)),
        q3: parseFloat(q3.toFixed(2)),
        range: `${sortedMultiples[0].toFixed(2)}x - ${sortedMultiples[sortedMultiples.length - 1].toFixed(2)}x`
      },
      selectedMultipleValue: parseFloat(medianMultiple.toFixed(2)),
      targetMetric,
      enterpriseValue: parseFloat(enterpriseValue.toFixed(2)),
      netDebt: targetCompany.netDebt,
      equityValuePreDlom: parseFloat(equityValue.toFixed(2)),
      dlom: (dlom * 100) + '%',
      equityValue: parseFloat(adjustedEquityValue.toFixed(2)),
      fairValueLevel: 3
    };
  }

  /**
   * Income approach — DCF model
   */
  incomeApproach({ projections, wacc, terminalGrowthRate = 0.03, dlom = 0.20, netDebt = 0 }) {
    // Discount projected cash flows
    let pvCashFlows = 0;
    const discountedFlows = projections.map((cf, i) => {
      const year = i + 1;
      const discountFactor = 1 / Math.pow(1 + wacc, year);
      const pv = cf.freeCashFlow * discountFactor;
      pvCashFlows += pv;
      return {
        year,
        revenue: cf.revenue,
        ebitda: cf.ebitda,
        freeCashFlow: cf.freeCashFlow,
        discountFactor: parseFloat(discountFactor.toFixed(6)),
        presentValue: parseFloat(pv.toFixed(2))
      };
    });

    // Terminal value
    const lastYearFcf = projections[projections.length - 1].freeCashFlow;
    const terminalValue = (lastYearFcf * (1 + terminalGrowthRate)) / (wacc - terminalGrowthRate);
    const pvTerminalValue = terminalValue / Math.pow(1 + wacc, projections.length);

    const enterpriseValue = pvCashFlows + pvTerminalValue;
    const equityValue = enterpriseValue - netDebt;
    const adjustedEquityValue = equityValue * (1 - dlom);

    return {
      method: 'INCOME_APPROACH',
      wacc: (wacc * 100).toFixed(2) + '%',
      terminalGrowthRate: (terminalGrowthRate * 100).toFixed(2) + '%',
      projectedCashFlows: discountedFlows,
      pvOperatingCashFlows: parseFloat(pvCashFlows.toFixed(2)),
      terminalValue: parseFloat(terminalValue.toFixed(2)),
      pvTerminalValue: parseFloat(pvTerminalValue.toFixed(2)),
      terminalValuePctOfEv: parseFloat(((pvTerminalValue / enterpriseValue) * 100).toFixed(1)) + '%',
      enterpriseValue: parseFloat(enterpriseValue.toFixed(2)),
      netDebt,
      equityValuePreDlom: parseFloat(equityValue.toFixed(2)),
      dlom: (dlom * 100) + '%',
      equityValue: parseFloat(adjustedEquityValue.toFixed(2)),
      fairValueLevel: 3
    };
  }

  /**
   * Calculate WACC
   */
  calculateWacc({ equityValue, debtValue, costOfEquity, costOfDebt, taxRate }) {
    const totalCapital = equityValue + debtValue;
    const equityWeight = equityValue / totalCapital;
    const debtWeight = debtValue / totalCapital;
    const wacc = (equityWeight * costOfEquity) + (debtWeight * costOfDebt * (1 - taxRate));

    return {
      equityWeight: parseFloat((equityWeight * 100).toFixed(2)) + '%',
      debtWeight: parseFloat((debtWeight * 100).toFixed(2)) + '%',
      costOfEquity: (costOfEquity * 100).toFixed(2) + '%',
      costOfDebt: (costOfDebt * 100).toFixed(2) + '%',
      taxRate: (taxRate * 100).toFixed(2) + '%',
      wacc: parseFloat((wacc * 100).toFixed(2)),
      waccPct: (wacc * 100).toFixed(2) + '%'
    };
  }

  /**
   * Sensitivity analysis (data table)
   */
  sensitivityAnalysis({ baseValuation, variable1, variable2 }) {
    const results = [];

    for (const v1 of variable1.values) {
      for (const v2 of variable2.values) {
        const params = { ...baseValuation };
        params[variable1.name] = v1;
        params[variable2.name] = v2;

        let value;
        if (params.method === 'dcf') {
          const result = this.incomeApproach(params);
          value = result.equityValue;
        } else {
          value = params.targetMetric * v1 * (1 - (params.dlom || 0.20)) - (params.netDebt || 0);
        }

        results.push({
          [variable1.name]: v1,
          [variable2.name]: v2,
          equityValue: parseFloat(value.toFixed(2))
        });
      }
    }

    return {
      variable1: variable1.name,
      variable2: variable2.name,
      matrix: results,
      range: {
        min: Math.min(...results.map(r => r.equityValue)),
        max: Math.max(...results.map(r => r.equityValue)),
        spread: Math.max(...results.map(r => r.equityValue)) - Math.min(...results.map(r => r.equityValue))
      }
    };
  }

  /**
   * Back-test valuations against realized exits
   */
  backTest(historicalValuations) {
    const results = historicalValuations.map(v => {
      const ratio = v.exitPrice / v.lastReportedFv;
      return {
        investmentName: v.name,
        exitDate: v.exitDate,
        lastReportedFv: v.lastReportedFv,
        lastReportedDate: v.lastReportedDate,
        exitPrice: v.exitPrice,
        ratio: parseFloat(ratio.toFixed(4)),
        deviation: parseFloat(((ratio - 1) * 100).toFixed(2)) + '%',
        withinTolerance: Math.abs(ratio - 1) <= 0.15 // 15% tolerance
      };
    });

    const avgRatio = results.reduce((sum, r) => sum + r.ratio, 0) / results.length;
    const withinTolerance = results.filter(r => r.withinTolerance).length;

    return {
      totalExits: results.length,
      results,
      averageRatio: parseFloat(avgRatio.toFixed(4)),
      medianRatio: parseFloat(results.map(r => r.ratio).sort((a, b) => a - b)[Math.floor(results.length / 2)].toFixed(4)),
      withinTolerance,
      tolerancePct: parseFloat(((withinTolerance / results.length) * 100).toFixed(1)) + '%',
      bias: avgRatio > 1.05 ? 'CONSERVATIVE' : avgRatio < 0.95 ? 'AGGRESSIVE' : 'WELL_CALIBRATED',
      conclusion: withinTolerance >= results.length * 0.8
        ? 'Valuation methodology is well-calibrated — 80%+ of exits within 15% of last reported FV'
        : 'Review valuation methodology — significant deviation between reported FV and exit prices'
    };
  }

  // --- Private ---

  _getMultiple(company, type) {
    switch (type) {
      case 'EV_EBITDA': return (company.marketCap + company.netDebt) / company.ebitda;
      case 'EV_REVENUE': return (company.marketCap + company.netDebt) / company.revenue;
      case 'PE': return company.marketCap / company.netIncome;
      case 'PB': return company.marketCap / company.bookValue;
      default: return (company.marketCap + company.netDebt) / company.ebitda;
    }
  }
}

module.exports = new ValuationEngineService();
