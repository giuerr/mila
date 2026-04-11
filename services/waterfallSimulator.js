/**
 * Waterfall Simulator
 * Pulls real fund data from DB and runs waterfall calculations
 * with actual commitments, investments, and NAV.
 */

const db = require('../db/database');
const waterfall = require('./waterfall');

class WaterfallSimulator {

  /**
   * Simulate waterfall for a fund using real DB data
   */
  simulate({ fundId, waterfallType = 'european', calculationDate, overrides = {} }) {
    if (!fundId) throw new Error('fundId is required');
    if (!db.db) throw new Error('Database not initialized');

    const fund = db.findById('funds', fundId);
    if (!fund) throw new Error(`Fund ${fundId} not found`);

    // Get all commitments with investor details
    const commitments = db.query(`
      SELECT c.*, i.name as investor_name, i.entity_type
      FROM commitments c
      JOIN investors i ON c.investor_id = i.id
      WHERE c.fund_id = ? AND c.status = 'ACTIVE'
      ORDER BY c.commitment DESC
    `, [fundId]);

    if (commitments.length === 0) throw new Error(`No active commitments found for fund ${fundId}`);

    // Get investments for deal-by-deal (American)
    const investments = db.query(
      'SELECT * FROM investments WHERE fund_id = ? ORDER BY investment_date ASC',
      [fundId]
    );

    // Get capital activity for distribution history
    const distributions = db.query(
      "SELECT * FROM capital_activity WHERE fund_id = ? AND type = 'DISTRIBUTION'",
      [fundId]
    );

    // Calculate fund metrics from real data
    const totalCommitments = commitments.reduce((sum, c) => sum + c.commitment, 0);
    const totalCalled = commitments.reduce((sum, c) => sum + c.called_capital, 0);
    const totalDistributed = distributions.reduce((sum, d) => sum + d.amount, 0);
    const investmentCost = investments.reduce((sum, i) => sum + (i.cost_basis || 0), 0);
    const investmentFairValue = investments.reduce((sum, i) => sum + (i.fair_value || 0), 0);
    const fundTotalValue = overrides.fundTotalValue || (investmentFairValue + (fund.nav - investmentFairValue));

    const calcDate = calculationDate || new Date().toISOString().split('T')[0];
    const inceptionDate = fund.created_at?.split('T')[0] || fund.created_at?.split(' ')[0] || '2020-01-01';

    // Build LP investor array
    const lpInvestors = commitments.map(c => ({
      id: c.investor_id,
      name: c.investor_name,
      commitment: c.commitment,
      calledCapital: c.called_capital,
      distributions: c.distributions || 0,
      class: c.lp_class || 'Standard',
      entityType: c.entity_type
    }));

    let waterfallResult;
    const preferredReturn = overrides.preferredReturn ?? fund.preferred_return ?? 0.08;
    const carryRate = overrides.carryRate ?? fund.carry_rate ?? 0.20;

    if (waterfallType === 'american') {
      // Deal-by-deal waterfall using actual investments
      const deals = investments.map(inv => ({
        id: inv.id,
        name: inv.company_name,
        costBasis: inv.cost_basis || 0,
        currentValue: inv.fair_value || 0,
        status: inv.status === 'FULLY_REALIZED' ? 'realized' : 'unrealized',
        realizedProceeds: inv.exit_proceeds || inv.fair_value || 0,
        holdPeriodYears: inv.investment_date
          ? this._yearsBetween(inv.investment_date, calcDate)
          : 3,
        sector: inv.sector,
        geography: inv.geography
      }));

      waterfallResult = waterfall.calculateAmericanWaterfall({
        deals,
        lpInvestors,
        preferredReturn,
        carryRate,
        lossCarryForward: overrides.lossCarryForward !== false
      });
    } else {
      // European whole-fund waterfall
      waterfallResult = waterfall.calculateEuropeanWaterfall({
        lpInvestors,
        fundTotalValue: overrides.fundTotalValue || fund.nav || fundTotalValue,
        preferredReturn,
        carryRate,
        catchUpRate: overrides.catchUpRate ?? 1.0,
        inceptionDate,
        calculationDate: calcDate
      });
    }

    // Enrich result with fund context
    return {
      simulation: true,
      fund: {
        id: fund.id,
        name: fund.name,
        jurisdiction: fund.jurisdiction,
        vehicleType: fund.vehicle_type,
        vintageYear: fund.vintage_year,
        status: fund.status
      },
      fundMetrics: {
        totalCommitments,
        totalCalled,
        totalDistributed,
        unfunded: totalCommitments - totalCalled,
        drawdownPct: totalCommitments > 0 ? ((totalCalled / totalCommitments) * 100).toFixed(1) + '%' : '0%',
        investmentCost,
        investmentFairValue,
        unrealizedGainLoss: investmentFairValue - investmentCost,
        nav: fund.nav,
        lpCount: commitments.length,
        investmentCount: investments.length
      },
      parameters: {
        waterfallType,
        preferredReturn,
        carryRate,
        calculationDate: calcDate,
        inceptionDate,
        fundTotalValue: overrides.fundTotalValue || fund.nav || fundTotalValue
      },
      ...waterfallResult,
      // LP detail with actual capital account data
      lpDetail: commitments.map(c => {
        const lpAlloc = waterfallResult.lpAllocations?.find(a => a.lpId === c.investor_id);
        return {
          investorId: c.investor_id,
          investorName: c.investor_name,
          entityType: c.entity_type,
          commitment: c.commitment,
          calledCapital: c.called_capital,
          priorDistributions: c.distributions || 0,
          capitalAccount: c.capital_account,
          unfunded: c.commitment - c.called_capital,
          pctOfFund: ((c.commitment / totalCommitments) * 100).toFixed(2) + '%',
          waterfallAllocation: lpAlloc || null
        };
      })
    };
  }

  /**
   * Run multiple scenarios with real data
   */
  scenarioAnalysis({ fundId, scenarios, waterfallType = 'european' }) {
    if (!fundId) throw new Error('fundId is required');
    if (!Array.isArray(scenarios) || scenarios.length === 0) throw new Error('scenarios must be a non-empty array');

    const results = {};
    for (const scenario of scenarios) {
      results[scenario.name] = this.simulate({
        fundId,
        waterfallType,
        calculationDate: scenario.calculationDate,
        overrides: {
          fundTotalValue: scenario.fundTotalValue,
          preferredReturn: scenario.preferredReturn,
          carryRate: scenario.carryRate
        }
      });
    }

    return {
      fundId,
      waterfallType,
      scenarioCount: scenarios.length,
      scenarios: results,
      comparison: scenarios.map(s => ({
        name: s.name,
        fundTotalValue: s.fundTotalValue,
        moic: results[s.name]?.moic,
        gpCarry: results[s.name]?.gpTotalCarry,
        lpNet: results[s.name]?.tiers?.reduce((sum, t) => sum + (t.lpAmount || 0), 0)
      }))
    };
  }

  _yearsBetween(start, end) {
    const d1 = new Date(start);
    const d2 = new Date(end);
    return Math.max(0, (d2 - d1) / (1000 * 60 * 60 * 24 * 365.25));
  }
}

module.exports = new WaterfallSimulator();
