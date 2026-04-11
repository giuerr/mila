/**
 * Cash Flow Forecasting & Liquidity Management
 * Capital call forecasting, distribution projections, recycling,
 * credit facility modeling, liquidity stress testing.
 */

class CashFlowForecastingService {

  /**
   * Generate comprehensive cash flow forecast
   */
  generateForecast({
    fund,
    horizon = 12, // months
    dealPipeline = [],
    exitPipeline = [],
    operatingExpenses
  }) {
    const months = [];
    const startDate = new Date();

    for (let i = 0; i < horizon; i++) {
      const monthDate = new Date(startDate);
      monthDate.setMonth(monthDate.getMonth() + i);
      const monthStr = monthDate.toISOString().slice(0, 7);

      const capitalCalls = this._forecastCapitalCalls(fund, dealPipeline, i);
      const distributions = this._forecastDistributions(exitPipeline, i);
      const fees = this._forecastFeeIncome(fund, monthDate);
      const expenses = this._forecastExpenses(operatingExpenses, monthDate);
      const creditFacility = this._forecastCreditUsage(fund, capitalCalls, distributions);

      months.push({
        month: monthStr,
        inflows: {
          capitalCallReceipts: capitalCalls.lpReceipts,
          distributionReceipts: distributions.realizedProceeds,
          managementFeeIncome: fees.managementFee,
          dividendIncome: fees.dividendIncome,
          interestIncome: fees.interestIncome,
          total: capitalCalls.lpReceipts + distributions.realizedProceeds + fees.total
        },
        outflows: {
          investmentDeployment: capitalCalls.deploymentAmount,
          lpDistributions: distributions.lpDistributions,
          managementCompanyExpenses: expenses.mgmtCo,
          fundExpenses: expenses.fund,
          creditFacilityRepayment: creditFacility.repayment,
          total: capitalCalls.deploymentAmount + distributions.lpDistributions + expenses.total + creditFacility.repayment
        },
        netCashFlow: 0, // calculated below
        creditFacilityDraw: creditFacility.draw,
        endingCash: 0 // calculated below
      });
    }

    // Calculate running balances
    let cash = fund.currentCash;
    for (const month of months) {
      month.netCashFlow = parseFloat((month.inflows.total - month.outflows.total + month.creditFacilityDraw).toFixed(2));
      cash += month.netCashFlow;
      month.endingCash = parseFloat(cash.toFixed(2));
    }

    return {
      startingCash: fund.currentCash,
      horizon: `${horizon} months`,
      months,
      summary: {
        totalInflows: months.reduce((s, m) => s + m.inflows.total, 0),
        totalOutflows: months.reduce((s, m) => s + m.outflows.total, 0),
        netCashFlow: months.reduce((s, m) => s + m.netCashFlow, 0),
        minimumCash: Math.min(...months.map(m => m.endingCash)),
        minimumCashMonth: months.reduce((min, m) => m.endingCash < min.endingCash ? m : min).month
      }
    };
  }

  /**
   * Capital call pacing model
   */
  forecastCapitalCallPacing({ totalCommitments, calledCapital, investmentPeriodEnd, historicalPace }) {
    const unfunded = totalCommitments - calledCapital;
    const monthsRemaining = Math.max(0, this._monthsBetween(new Date(), investmentPeriodEnd));
    const historicalMonthlyRate = historicalPace || (calledCapital / Math.max(1, this._monthsBetween(new Date(investmentPeriodEnd).setFullYear(new Date(investmentPeriodEnd).getFullYear() - 5), new Date())));

    // Three scenarios
    const scenarios = {
      base: {
        monthlyDeployment: unfunded / Math.max(monthsRemaining, 1),
        totalDeployed: unfunded,
        paceDescription: 'Even deployment over remaining investment period'
      },
      accelerated: {
        monthlyDeployment: (unfunded / Math.max(monthsRemaining, 1)) * 1.5,
        totalDeployed: Math.min(unfunded, unfunded * 1.5),
        paceDescription: '50% faster than even pace'
      },
      slow: {
        monthlyDeployment: historicalMonthlyRate * 0.7,
        totalDeployed: Math.min(unfunded, historicalMonthlyRate * 0.7 * monthsRemaining),
        paceDescription: '30% below historical pace'
      }
    };

    return {
      totalCommitments,
      calledCapital,
      unfundedCommitments: unfunded,
      picRatio: parseFloat(((calledCapital / totalCommitments) * 100).toFixed(2)) + '%',
      investmentPeriodEnd,
      monthsRemaining,
      scenarios
    };
  }

  /**
   * Recycling projection
   */
  calculateRecyclingCapacity({ lpaRecyclingProvision, totalCommitments, calledCapital, realizedProceeds, recycledToDate, investmentPeriodEnd }) {
    const maxRecyclable = totalCommitments * (lpaRecyclingProvision || 0); // e.g., 0.25 = 25%
    const remainingRecycling = maxRecyclable - recycledToDate;
    const withinInvestmentPeriod = new Date() < new Date(investmentPeriodEnd);

    return {
      lpaProvision: (lpaRecyclingProvision * 100) + '%',
      maxRecyclableAmount: maxRecyclable,
      recycledToDate,
      remainingRecyclingCapacity: remainingRecycling,
      effectiveFundSize: totalCommitments + recycledToDate,
      realizedProceedsAvailable: realizedProceeds,
      recyclableNow: withinInvestmentPeriod ? Math.min(remainingRecycling, realizedProceeds) : 0,
      investmentPeriodActive: withinInvestmentPeriod,
      note: !withinInvestmentPeriod
        ? 'Investment period has ended — no further recycling permitted'
        : `Can recycle up to ${remainingRecycling.toFixed(0)} of realized proceeds`
    };
  }

  /**
   * Liquidity stress test
   */
  stressTest({ fund, scenarios }) {
    const defaults = {
      lpDefaultRate: [0.05, 0.10, 0.20], // 5%, 10%, 20% of LPs default
      exitDelay: [6, 12, 24], // months
      creditFacilityRevoked: [false, true]
    };

    const testScenarios = scenarios || defaults;
    const results = [];

    for (const defaultRate of testScenarios.lpDefaultRate) {
      for (const delay of testScenarios.exitDelay) {
        for (const revoked of testScenarios.creditFacilityRevoked) {
          const impactedCapital = fund.unfundedCommitments * defaultRate;
          const shortfall = impactedCapital + (revoked ? fund.creditFacilityBalance : 0);
          const reducedExitProceeds = fund.expectedExitProceeds * (1 - delay * 0.02); // 2% haircut per month delay

          results.push({
            scenario: `${(defaultRate * 100)}% LP default, ${delay}mo exit delay, facility ${revoked ? 'revoked' : 'available'}`,
            lpDefaultRate: defaultRate,
            exitDelay: delay,
            creditFacilityRevoked: revoked,
            capitalShortfall: parseFloat(shortfall.toFixed(2)),
            reducedExitProceeds: parseFloat(reducedExitProceeds.toFixed(2)),
            cashImpact: parseFloat((fund.currentCash - shortfall).toFixed(2)),
            survives: (fund.currentCash - shortfall) > 0,
            severity: shortfall > fund.currentCash ? 'CRITICAL' : shortfall > fund.currentCash * 0.5 ? 'HIGH' : 'MODERATE'
          });
        }
      }
    }

    return {
      fund: fund.name,
      currentCash: fund.currentCash,
      scenarios: results,
      worstCase: results.reduce((worst, r) => r.cashImpact < worst.cashImpact ? r : worst),
      passesAllScenarios: results.every(r => r.survives)
    };
  }

  // --- Private ---

  _forecastCapitalCalls(fund, pipeline, monthOffset) {
    const pipelineDeployment = pipeline
      .filter(d => d.expectedMonth === monthOffset)
      .reduce((sum, d) => sum + d.amount * d.probability, 0);
    return {
      deploymentAmount: pipelineDeployment,
      lpReceipts: pipelineDeployment // Calls match deployment
    };
  }

  _forecastDistributions(exits, monthOffset) {
    const exitProceeds = exits
      .filter(e => e.expectedMonth === monthOffset)
      .reduce((sum, e) => sum + e.expectedProceeds * e.probability, 0);
    return {
      realizedProceeds: exitProceeds,
      lpDistributions: exitProceeds * 0.80 // ~80% to LPs after carry
    };
  }

  _forecastFeeIncome(fund, date) {
    const monthlyMgmtFee = (fund.feeBase * fund.managementFeeRate) / 12;
    return {
      managementFee: monthlyMgmtFee,
      dividendIncome: fund.expectedDividends / 12 || 0,
      interestIncome: fund.expectedInterest / 12 || 0,
      total: monthlyMgmtFee + (fund.expectedDividends / 12 || 0) + (fund.expectedInterest / 12 || 0)
    };
  }

  _forecastExpenses(opex, date) {
    return {
      mgmtCo: opex?.managementCompany / 12 || 0,
      fund: opex?.fund / 12 || 0,
      total: ((opex?.managementCompany || 0) + (opex?.fund || 0)) / 12
    };
  }

  _forecastCreditUsage(fund, calls, distributions) {
    const netNeed = calls.deploymentAmount - calls.lpReceipts;
    return {
      draw: Math.max(0, netNeed),
      repayment: Math.min(fund.creditFacilityBalance || 0, distributions.realizedProceeds * 0.2)
    };
  }

  _monthsBetween(start, end) {
    const s = new Date(start);
    const e = new Date(end);
    return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  }
}

module.exports = new CashFlowForecastingService();
