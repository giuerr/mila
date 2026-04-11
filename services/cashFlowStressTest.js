/**
 * Cash Flow Stress Test Service
 * Monte Carlo simulation on fund cash flows: random capital call timing,
 * exit timing, exit multiples, with percentile statistics and
 * deterministic scenario analysis.
 */

const db = require('../db/database');

class CashFlowStressTestService {

  // ==================== MONTE CARLO SIMULATION ====================

  /**
   * Run Monte Carlo simulation projecting fund cash flows.
   * @param {string} fundId - Fund identifier
   * @param {number} simulations - Number of simulation runs (default 1000)
   * @param {number} forecastYears - Projection horizon in years (default 5)
   * @returns {Object} Percentile statistics, histogram, and probability analysis
   */
  simulate({ fundId, simulations = 1000, forecastYears = 5 }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId) throw new Error('fundId is required');

    const fund = db.findById('funds', fundId);
    if (!fund) throw new Error(`Fund ${fundId} not found`);

    const numSims = Math.min(Math.max(parseInt(simulations, 10) || 1000, 100), 50000);
    const years = Math.min(Math.max(parseInt(forecastYears, 10) || 5, 1), 15);

    // Current fund state
    const totalCommitments = fund.total_commitments || 0;
    const calledCapital = fund.called_capital || 0;
    const unfundedCapital = totalCommitments - calledCapital;

    // Active investments
    const investments = db.query(`
      SELECT * FROM investments WHERE fund_id = ? AND status = 'ACTIVE'
    `, [fundId]);

    const totalCostBasis = investments.reduce((sum, inv) => sum + (inv.cost_basis || 0), 0);
    const totalFairValue = investments.reduce((sum, inv) => sum + (inv.fair_value || 0), 0);

    // Historical call pattern (for calibration)
    const historicalCalls = db.query(`
      SELECT amount, created_at FROM capital_activity
      WHERE fund_id = ? AND type = 'CAPITAL_CALL' AND status IN ('RECEIVED', 'RECONCILED', 'PENDING')
      ORDER BY created_at ASC
    `, [fundId]);

    // Run simulations
    const results = [];
    for (let i = 0; i < numSims; i++) {
      results.push(this._runSingleSimulation({
        totalCommitments,
        calledCapital,
        unfundedCapital,
        investments,
        totalCostBasis,
        totalFairValue,
        years,
        historicalCallCount: historicalCalls.length
      }));
    }

    // Extract metrics arrays
    const dpiValues = results.map(r => r.dpi).sort((a, b) => a - b);
    const rvpiValues = results.map(r => r.rvpi).sort((a, b) => a - b);
    const tvpiValues = results.map(r => r.tvpi).sort((a, b) => a - b);
    const irrValues = results.map(r => r.irr).sort((a, b) => a - b);

    // Percentile statistics
    const percentiles = {
      dpi: this._percentiles(dpiValues),
      rvpi: this._percentiles(rvpiValues),
      tvpi: this._percentiles(tvpiValues),
      irr: this._percentiles(irrValues)
    };

    // Histogram buckets for TVPI
    const histogram = this._buildHistogram(tvpiValues, 20);

    // Probability of achieving target returns
    const targetProbabilities = {
      '1.5x': this._probabilityAbove(tvpiValues, 1.5),
      '2.0x': this._probabilityAbove(tvpiValues, 2.0),
      '2.5x': this._probabilityAbove(tvpiValues, 2.5)
    };

    return {
      fundId,
      fundName: fund.name,
      simulatedAt: new Date().toISOString(),
      parameters: {
        simulations: numSims,
        forecastYears: years,
        totalCommitments,
        calledCapital,
        unfundedCapital,
        activeInvestments: investments.length,
        totalCostBasis: parseFloat(totalCostBasis.toFixed(2)),
        currentFairValue: parseFloat(totalFairValue.toFixed(2))
      },
      percentiles,
      histogram,
      targetProbabilities,
      summary: {
        medianTvpi: percentiles.tvpi.P50,
        medianIrr: percentiles.irr.P50,
        downside: {
          tvpiP10: percentiles.tvpi.P10,
          irrP10: percentiles.irr.P10
        },
        upside: {
          tvpiP90: percentiles.tvpi.P90,
          irrP90: percentiles.irr.P90
        },
        probabilityOfLoss: this._probabilityAbove(tvpiValues.map(v => -v), -1.0),
        expectedTvpi: parseFloat((tvpiValues.reduce((s, v) => s + v, 0) / tvpiValues.length).toFixed(4))
      }
    };
  }

  // ==================== DETERMINISTIC STRESS SCENARIOS ====================

  /**
   * Run deterministic stress scenarios on fund portfolio.
   * @param {string} fundId - Fund identifier
   * @param {Array} scenarios - Custom scenarios, or uses defaults (recession, base, bull)
   * @returns {Object} Results per scenario
   */
  scenarioStressTest({ fundId, scenarios }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId) throw new Error('fundId is required');

    const fund = db.findById('funds', fundId);
    if (!fund) throw new Error(`Fund ${fundId} not found`);

    const investments = db.query(`
      SELECT * FROM investments WHERE fund_id = ? AND status IN ('ACTIVE', 'PARTIALLY_REALIZED')
    `, [fundId]);

    const totalCost = investments.reduce((sum, inv) => sum + (inv.cost_basis || 0), 0);
    const totalFV = investments.reduce((sum, inv) => sum + (inv.fair_value || 0), 0);
    const calledCapital = fund.called_capital || 0;
    const distributions = fund.total_commitments ? (calledCapital * 0.1) : 0; // Estimate if not tracked

    const defaultScenarios = [
      { name: 'Severe Recession', markdownPct: -0.50, description: '50% markdown on all active positions' },
      { name: 'Recession', markdownPct: -0.30, description: '30% markdown on all active positions' },
      { name: 'Mild Downturn', markdownPct: -0.15, description: '15% markdown on all active positions' },
      { name: 'Base Case', markdownPct: 0.0, description: 'No change to current marks' },
      { name: 'Recovery', markdownPct: 0.15, description: '15% markup on all active positions' },
      { name: 'Bull Case', markdownPct: 0.50, description: '50% markup on all active positions' }
    ];

    const activeScenarios = scenarios || defaultScenarios;

    const results = activeScenarios.map(scenario => {
      const adjustedFV = totalFV * (1 + scenario.markdownPct);
      const adjustedNav = adjustedFV; // Simplified — full NAV would include cash, liabilities
      const unrealizedGainLoss = adjustedFV - totalCost;
      const tvpi = calledCapital > 0 ? (distributions + adjustedFV) / calledCapital : 0;
      const dpi = calledCapital > 0 ? distributions / calledCapital : 0;
      const rvpi = calledCapital > 0 ? adjustedFV / calledCapital : 0;

      // Per-investment impact
      const investmentImpact = investments.map(inv => {
        const currentFV = inv.fair_value || 0;
        const stressedFV = currentFV * (1 + scenario.markdownPct);
        return {
          companyName: inv.company_name,
          costBasis: parseFloat((inv.cost_basis || 0).toFixed(2)),
          currentFairValue: parseFloat(currentFV.toFixed(2)),
          stressedFairValue: parseFloat(stressedFV.toFixed(2)),
          impactAmount: parseFloat((stressedFV - currentFV).toFixed(2)),
          stressedMoic: inv.cost_basis > 0 ? parseFloat((stressedFV / inv.cost_basis).toFixed(4)) : 0
        };
      });

      return {
        scenario: scenario.name,
        description: scenario.description,
        markdownPct: (scenario.markdownPct * 100).toFixed(1) + '%',
        portfolioImpact: {
          currentFairValue: parseFloat(totalFV.toFixed(2)),
          stressedFairValue: parseFloat(adjustedFV.toFixed(2)),
          impactAmount: parseFloat((adjustedFV - totalFV).toFixed(2)),
          unrealizedGainLoss: parseFloat(unrealizedGainLoss.toFixed(2))
        },
        metrics: {
          tvpi: parseFloat(tvpi.toFixed(4)),
          dpi: parseFloat(dpi.toFixed(4)),
          rvpi: parseFloat(rvpi.toFixed(4))
        },
        investmentImpact
      };
    });

    return {
      fundId,
      fundName: fund.name,
      testedAt: new Date().toISOString(),
      baseline: {
        totalCommitments: fund.total_commitments,
        calledCapital,
        totalCostBasis: parseFloat(totalCost.toFixed(2)),
        currentFairValue: parseFloat(totalFV.toFixed(2)),
        activeInvestments: investments.length
      },
      scenarios: results
    };
  }

  // ==================== PRIVATE: SIMULATION ENGINE ====================

  _runSingleSimulation({ totalCommitments, calledCapital, unfundedCapital, investments, totalCostBasis, totalFairValue, years, historicalCallCount }) {
    let cumulativeDistributions = 0;
    let remainingUnfunded = unfundedCapital;
    let totalCalled = calledCapital;
    let portfolioValue = totalFairValue;

    // Simulate remaining capital calls (spread over investment period)
    const callsPerYear = Math.max(1, historicalCallCount > 0 ? historicalCallCount / 3 : 2);
    for (let year = 1; year <= Math.min(years, 3); year++) {
      if (remainingUnfunded <= 0) break;
      const callPct = 0.2 + this._gaussianRandom() * 0.1; // ~20% +/- 10% of remaining
      const callAmount = Math.min(remainingUnfunded, remainingUnfunded * Math.max(0.05, callPct));
      remainingUnfunded -= callAmount;
      totalCalled += callAmount;
    }

    // Simulate exits for each investment
    for (const inv of investments) {
      const costBasis = inv.cost_basis || 0;
      if (costBasis <= 0) continue;

      // Random exit year (uniform over remaining fund life)
      const exitYear = 1 + Math.floor(Math.random() * years);

      // Log-normal exit multiple: mean=1.8x, std=0.8
      const logMean = Math.log(1.8) - 0.5 * Math.pow(0.8 / 1.8, 2);
      const logStd = Math.sqrt(Math.log(1 + Math.pow(0.8 / 1.8, 2)));
      const exitMultiple = Math.max(0, Math.exp(logMean + logStd * this._gaussianRandom()));

      const exitProceeds = costBasis * exitMultiple;
      cumulativeDistributions += exitProceeds;
    }

    // Residual value for any unexited positions (apply random markup/markdown)
    const residualFactor = 0.8 + Math.random() * 0.8; // 0.8x to 1.6x
    const residualValue = (totalCalled - totalCostBasis) * residualFactor; // Cash not invested, with noise

    const totalValue = cumulativeDistributions + Math.max(0, residualValue);
    const dpi = totalCalled > 0 ? cumulativeDistributions / totalCalled : 0;
    const rvpi = totalCalled > 0 ? Math.max(0, residualValue) / totalCalled : 0;
    const tvpi = totalCalled > 0 ? totalValue / totalCalled : 0;

    // Simplified IRR approximation (assumes mid-period cash flows)
    const midYears = years / 2;
    const irr = totalCalled > 0 && midYears > 0
      ? Math.pow(totalValue / totalCalled, 1 / midYears) - 1
      : 0;

    return {
      dpi: parseFloat(dpi.toFixed(4)),
      rvpi: parseFloat(rvpi.toFixed(4)),
      tvpi: parseFloat(tvpi.toFixed(4)),
      irr: parseFloat((irr * 100).toFixed(2)), // as percentage
      totalDistributions: parseFloat(cumulativeDistributions.toFixed(2)),
      totalCalled: parseFloat(totalCalled.toFixed(2)),
      residualValue: parseFloat(Math.max(0, residualValue).toFixed(2))
    };
  }

  // ==================== PRIVATE: STATISTICAL HELPERS ====================

  /**
   * Box-Muller transform for Gaussian random numbers.
   */
  _gaussianRandom() {
    let u1, u2;
    do { u1 = Math.random(); } while (u1 === 0);
    u2 = Math.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  /**
   * Calculate percentile values (P10, P25, P50, P75, P90).
   */
  _percentiles(sortedValues) {
    const n = sortedValues.length;
    if (n === 0) return { P10: 0, P25: 0, P50: 0, P75: 0, P90: 0 };

    const pct = (p) => {
      const idx = (p / 100) * (n - 1);
      const lower = Math.floor(idx);
      const upper = Math.ceil(idx);
      const frac = idx - lower;
      if (lower === upper) return sortedValues[lower];
      return parseFloat((sortedValues[lower] * (1 - frac) + sortedValues[upper] * frac).toFixed(4));
    };

    return {
      P10: pct(10),
      P25: pct(25),
      P50: pct(50),
      P75: pct(75),
      P90: pct(90)
    };
  }

  /**
   * Build histogram with N buckets from sorted values.
   */
  _buildHistogram(sortedValues, numBuckets = 20) {
    if (sortedValues.length === 0) return [];

    const min = sortedValues[0];
    const max = sortedValues[sortedValues.length - 1];
    const range = max - min || 1;
    const bucketWidth = range / numBuckets;

    const buckets = [];
    for (let i = 0; i < numBuckets; i++) {
      const lower = min + i * bucketWidth;
      const upper = min + (i + 1) * bucketWidth;
      const count = sortedValues.filter(v => v >= lower && (i === numBuckets - 1 ? v <= upper : v < upper)).length;
      buckets.push({
        rangeStart: parseFloat(lower.toFixed(4)),
        rangeEnd: parseFloat(upper.toFixed(4)),
        count,
        frequency: parseFloat((count / sortedValues.length).toFixed(4))
      });
    }

    return buckets;
  }

  /**
   * Calculate probability that values exceed a threshold.
   */
  _probabilityAbove(sortedValues, threshold) {
    if (sortedValues.length === 0) return '0%';
    const above = sortedValues.filter(v => v >= threshold).length;
    return parseFloat(((above / sortedValues.length) * 100).toFixed(2)) + '%';
  }
}

module.exports = new CashFlowStressTestService();
