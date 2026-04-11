/**
 * Commitment Pacing Service
 * Forecast future capital calls based on historical drawdown rates.
 * Per-LP projected call schedules and net cash flow liquidity forecasts.
 */

const db = require('../db/database');

class CommitmentPacingService {

  /**
   * Forecast future capital calls based on historical drawdown rate
   * @param {Object} params
   * @param {string} params.fundId - Fund identifier
   * @param {number} params.forecastMonths - Number of months to project (default 24)
   * @returns {Object} Monthly projected calls with remaining unfunded
   */
  forecast({ fundId, forecastMonths = 24 }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId) throw new Error('fundId is required');
    if (forecastMonths < 1 || forecastMonths > 120) throw new Error('forecastMonths must be between 1 and 120');

    const fund = db.findById('funds', fundId);
    if (!fund) throw new Error(`Fund ${fundId} not found`);

    const commitments = db.query(`
      SELECT * FROM commitments WHERE fund_id = ? AND status = 'ACTIVE'
    `, [fundId]);

    if (commitments.length === 0) throw new Error('No active commitments for this fund');

    const totalCommitments = commitments.reduce((sum, c) => sum + c.commitment, 0);
    const totalCalled = commitments.reduce((sum, c) => sum + (c.called_capital || 0), 0);
    const totalUnfunded = totalCommitments - totalCalled;

    if (totalUnfunded <= 0) {
      return {
        fundId,
        fundName: fund.name,
        totalCommitments,
        totalCalled,
        totalUnfunded: 0,
        percentDrawn: 100,
        message: 'Fund is fully drawn — no future calls expected',
        monthlyForecast: []
      };
    }

    // Determine average monthly drawdown rate from historical capital calls
    const callHistory = db.query(`
      SELECT created_at, SUM(amount) as total_amount
      FROM capital_activity
      WHERE fund_id = ? AND type = 'CAPITAL_CALL' AND status IN ('PENDING', 'RECEIVED')
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY created_at ASC
    `, [fundId]);

    let avgMonthlyDrawRate;
    if (callHistory.length >= 2) {
      // Calculate the time span and total drawn
      const firstCall = new Date(callHistory[0].created_at);
      const lastCall = new Date(callHistory[callHistory.length - 1].created_at);
      const monthsOfHistory = Math.max(1, (lastCall.getTime() - firstCall.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
      const historicalTotalDrawn = callHistory.reduce((sum, h) => sum + h.total_amount, 0);
      avgMonthlyDrawRate = historicalTotalDrawn / monthsOfHistory;
    } else if (callHistory.length === 1) {
      // Single data point — assume this rate continues
      avgMonthlyDrawRate = callHistory[0].total_amount;
    } else {
      // No history — use industry standard: ~25% of commitments per year = ~2.08% per month
      avgMonthlyDrawRate = totalCommitments * 0.0208;
    }

    // Check if fund is past investment period
    const now = new Date();
    const investmentPeriodEnd = fund.investment_period_end ? new Date(fund.investment_period_end) : null;
    const pastInvestmentPeriod = investmentPeriodEnd && now > investmentPeriodEnd;

    // After investment period, drawdown rate typically drops to ~20% of normal (follow-ons, fees)
    if (pastInvestmentPeriod) {
      avgMonthlyDrawRate *= 0.20;
    }

    // Project forward
    const monthlyForecast = [];
    let remainingUnfunded = totalUnfunded;
    let cumulativeCalled = totalCalled;

    for (let m = 1; m <= forecastMonths; m++) {
      if (remainingUnfunded <= 0) break;

      const projectedCall = Math.min(avgMonthlyDrawRate, remainingUnfunded);
      remainingUnfunded -= projectedCall;
      cumulativeCalled += projectedCall;

      const forecastDate = new Date(now);
      forecastDate.setMonth(forecastDate.getMonth() + m);

      monthlyForecast.push({
        month: m,
        date: forecastDate.toISOString().split('T')[0].substring(0, 7), // YYYY-MM
        projectedCallAmount: parseFloat(projectedCall.toFixed(2)),
        cumulativeCalled: parseFloat(cumulativeCalled.toFixed(2)),
        remainingUnfunded: parseFloat(Math.max(0, remainingUnfunded).toFixed(2)),
        percentDrawn: parseFloat(((cumulativeCalled / totalCommitments) * 100).toFixed(1))
      });
    }

    const monthsToFullDraw = avgMonthlyDrawRate > 0 ? Math.ceil(totalUnfunded / avgMonthlyDrawRate) : null;

    return {
      fundId,
      fundName: fund.name,
      asOfDate: now.toISOString().split('T')[0],
      totalCommitments,
      totalCalled,
      totalUnfunded: parseFloat(totalUnfunded.toFixed(2)),
      percentDrawn: parseFloat(((totalCalled / totalCommitments) * 100).toFixed(1)),
      historicalDataPoints: callHistory.length,
      avgMonthlyDrawRate: parseFloat(avgMonthlyDrawRate.toFixed(2)),
      pastInvestmentPeriod,
      estimatedMonthsToFullDraw: monthsToFullDraw,
      estimatedFullDrawDate: monthsToFullDraw ? (() => {
        const d = new Date(now);
        d.setMonth(d.getMonth() + monthsToFullDraw);
        return d.toISOString().split('T')[0];
      })() : null,
      monthlyForecast
    };
  }

  /**
   * Per-LP projected call schedule
   * @param {Object} params
   * @param {string} params.fundId - Fund identifier
   * @returns {Object} Per-LP pacing schedule
   */
  lpPacingSchedule({ fundId }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId) throw new Error('fundId is required');

    const fund = db.findById('funds', fundId);
    if (!fund) throw new Error(`Fund ${fundId} not found`);

    // Get the fund-level forecast first
    const fundForecast = this.forecast({ fundId, forecastMonths: 36 });

    const commitments = db.query(`
      SELECT c.*, i.name as investor_name, i.email as investor_email
      FROM commitments c
      JOIN investors i ON c.investor_id = i.id
      WHERE c.fund_id = ? AND c.status = 'ACTIVE'
    `, [fundId]);

    if (commitments.length === 0) throw new Error('No active commitments for this fund');

    const totalCommitments = commitments.reduce((sum, c) => sum + c.commitment, 0);

    const lpSchedules = commitments.map(c => {
      const unfunded = c.commitment - (c.called_capital || 0);
      const proRataShare = totalCommitments > 0 ? c.commitment / totalCommitments : 0;

      if (unfunded <= 0) {
        return {
          investorId: c.investor_id,
          investorName: c.investor_name,
          commitment: c.commitment,
          calledCapital: c.called_capital || 0,
          unfunded: 0,
          percentDrawn: 100,
          proRataShare: parseFloat((proRataShare * 100).toFixed(2)),
          projectedCalls: [],
          message: 'Fully drawn'
        };
      }

      // Project calls pro-rata based on fund-level forecast
      let remainingLpUnfunded = unfunded;
      const projectedCalls = [];

      for (const month of fundForecast.monthlyForecast) {
        if (remainingLpUnfunded <= 0) break;

        const lpCallAmount = Math.min(month.projectedCallAmount * proRataShare, remainingLpUnfunded);
        remainingLpUnfunded -= lpCallAmount;

        if (lpCallAmount > 0) {
          projectedCalls.push({
            date: month.date,
            amount: parseFloat(lpCallAmount.toFixed(2)),
            remainingUnfunded: parseFloat(Math.max(0, remainingLpUnfunded).toFixed(2))
          });
        }
      }

      return {
        investorId: c.investor_id,
        investorName: c.investor_name,
        commitment: c.commitment,
        calledCapital: c.called_capital || 0,
        unfunded: parseFloat(unfunded.toFixed(2)),
        percentDrawn: parseFloat((((c.called_capital || 0) / c.commitment) * 100).toFixed(1)),
        proRataShare: parseFloat((proRataShare * 100).toFixed(2)),
        projectedCalls,
        totalProjectedRemaining: parseFloat(projectedCalls.reduce((sum, pc) => sum + pc.amount, 0).toFixed(2))
      };
    });

    return {
      fundId,
      fundName: fund.name,
      asOfDate: new Date().toISOString().split('T')[0],
      avgMonthlyDrawRate: fundForecast.avgMonthlyDrawRate,
      estimatedFullDrawDate: fundForecast.estimatedFullDrawDate,
      lpSchedules,
      summary: {
        totalLPs: lpSchedules.length,
        fullyDrawn: lpSchedules.filter(lp => lp.unfunded === 0).length,
        withRemainingCalls: lpSchedules.filter(lp => lp.unfunded > 0).length,
        totalUnfunded: parseFloat(lpSchedules.reduce((sum, lp) => sum + lp.unfunded, 0).toFixed(2))
      }
    };
  }

  /**
   * Liquidity forecast — combine projected calls with projected distributions
   * @param {Object} params
   * @param {string} params.fundId - Fund identifier
   * @returns {Object} Net cash flow forecast
   */
  liquidityForecast({ fundId }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId) throw new Error('fundId is required');

    const fund = db.findById('funds', fundId);
    if (!fund) throw new Error(`Fund ${fundId} not found`);

    // Get projected calls
    const callForecast = this.forecast({ fundId, forecastMonths: 36 });

    // Estimate projected distributions from investments nearing exit
    const investments = db.query(`
      SELECT * FROM investments
      WHERE fund_id = ? AND status IN ('ACTIVE', 'PARTIALLY_REALIZED')
      ORDER BY investment_date ASC
    `, [fundId]);

    // Historical distribution rate
    const distHistory = db.query(`
      SELECT strftime('%Y-%m', created_at) as month, SUM(amount) as total_amount
      FROM capital_activity
      WHERE fund_id = ? AND type = 'DISTRIBUTION'
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month ASC
    `, [fundId]);

    let avgMonthlyDistRate = 0;
    if (distHistory.length >= 2) {
      const firstDist = new Date(distHistory[0].month + '-01');
      const lastDist = new Date(distHistory[distHistory.length - 1].month + '-01');
      const monthsOfHistory = Math.max(1, (lastDist.getTime() - firstDist.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
      const historicalTotalDist = distHistory.reduce((sum, h) => sum + h.total_amount, 0);
      avgMonthlyDistRate = historicalTotalDist / monthsOfHistory;
    } else if (distHistory.length === 1) {
      avgMonthlyDistRate = distHistory[0].total_amount * 0.5; // Conservative: assume half-rate going forward
    }

    // Estimate potential near-term realizations from mature investments (held > 3 years)
    const now = new Date();
    const matureInvestments = investments.filter(inv => {
      if (!inv.investment_date) return false;
      const holdYears = (now.getTime() - new Date(inv.investment_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return holdYears > 3;
    });

    const totalMatureFairValue = matureInvestments.reduce((sum, inv) => sum + (inv.fair_value || 0), 0);

    // Project 36 months of net cash flows
    const monthlyForecast = [];
    let cumulativeNetCashFlow = 0;

    for (let m = 1; m <= 36; m++) {
      const forecastDate = new Date(now);
      forecastDate.setMonth(forecastDate.getMonth() + m);
      const dateStr = forecastDate.toISOString().split('T')[0].substring(0, 7);

      // Projected calls from pacing model
      const callMonth = callForecast.monthlyForecast.find(f => f.month === m);
      const projectedCall = callMonth ? callMonth.projectedCallAmount : 0;

      // Projected distributions: base rate + bump for mature investment exits
      // Assume mature investments have ~15% annual probability of exit, spread monthly
      const matureExitRate = totalMatureFairValue * (0.15 / 12);
      const projectedDistribution = parseFloat((avgMonthlyDistRate + matureExitRate).toFixed(2));

      const netCashFlow = projectedDistribution - projectedCall;
      cumulativeNetCashFlow += netCashFlow;

      monthlyForecast.push({
        month: m,
        date: dateStr,
        projectedCalls: parseFloat(projectedCall.toFixed(2)),
        projectedDistributions: parseFloat(projectedDistribution.toFixed(2)),
        netCashFlow: parseFloat(netCashFlow.toFixed(2)),
        cumulativeNetCashFlow: parseFloat(cumulativeNetCashFlow.toFixed(2))
      });
    }

    // Summarize by quarter
    const quarterlyForecast = [];
    for (let q = 0; q < 12; q++) {
      const qMonths = monthlyForecast.slice(q * 3, (q + 1) * 3);
      if (qMonths.length === 0) break;

      const qCalls = qMonths.reduce((sum, m) => sum + m.projectedCalls, 0);
      const qDists = qMonths.reduce((sum, m) => sum + m.projectedDistributions, 0);

      quarterlyForecast.push({
        quarter: `Q${(q % 4) + 1} ${new Date(now.getFullYear(), now.getMonth() + (q * 3) + 1, 1).getFullYear()}`,
        projectedCalls: parseFloat(qCalls.toFixed(2)),
        projectedDistributions: parseFloat(qDists.toFixed(2)),
        netCashFlow: parseFloat((qDists - qCalls).toFixed(2))
      });
    }

    // J-curve position
    const totalCalled = fund.called_capital || 0;
    const totalDistributed = db.query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM capital_activity
      WHERE fund_id = ? AND type = 'DISTRIBUTION'
    `, [fundId])[0]?.total || 0;
    const fundNav = fund.nav || 0;
    const tvpi = totalCalled > 0 ? (fundNav + totalDistributed) / totalCalled : 0;

    let jCurvePosition;
    if (tvpi < 1.0) jCurvePosition = 'TROUGH — Below cost basis, in J-curve trough';
    else if (tvpi < 1.5 && totalDistributed < totalCalled * 0.3) jCurvePosition = 'ASCENDING — Above cost basis, limited distributions';
    else if (totalDistributed > totalCalled * 0.5) jCurvePosition = 'HARVESTING — Significant distributions phase';
    else jCurvePosition = 'MATURE — Steady state';

    return {
      fundId,
      fundName: fund.name,
      asOfDate: now.toISOString().split('T')[0],
      assumptions: {
        avgMonthlyCallRate: callForecast.avgMonthlyDrawRate,
        avgMonthlyDistRate: parseFloat(avgMonthlyDistRate.toFixed(2)),
        matureInvestmentExitRate: parseFloat(matureExitRate.toFixed(2)),
        matureInvestments: matureInvestments.length,
        totalMatureFairValue: parseFloat(totalMatureFairValue.toFixed(2)),
        historicalDistDataPoints: distHistory.length
      },
      currentState: {
        totalCalled,
        totalDistributed: parseFloat(totalDistributed.toFixed(2)),
        fundNav,
        tvpi: parseFloat(tvpi.toFixed(4)),
        jCurvePosition
      },
      monthlyForecast,
      quarterlyForecast,
      summary: {
        next12MonthsCalls: parseFloat(monthlyForecast.slice(0, 12).reduce((sum, m) => sum + m.projectedCalls, 0).toFixed(2)),
        next12MonthsDistributions: parseFloat(monthlyForecast.slice(0, 12).reduce((sum, m) => sum + m.projectedDistributions, 0).toFixed(2)),
        next12MonthsNetCashFlow: parseFloat(monthlyForecast.slice(0, 12).reduce((sum, m) => sum + m.netCashFlow, 0).toFixed(2)),
        next36MonthsCalls: parseFloat(monthlyForecast.reduce((sum, m) => sum + m.projectedCalls, 0).toFixed(2)),
        next36MonthsDistributions: parseFloat(monthlyForecast.reduce((sum, m) => sum + m.projectedDistributions, 0).toFixed(2)),
        next36MonthsNetCashFlow: parseFloat(cumulativeNetCashFlow.toFixed(2))
      }
    };
  }
}

module.exports = new CommitmentPacingService();
