/**
 * Multi-Fund Consolidated Reporting Service
 * Cross-fund views: aggregated NAV, total AUM, consolidated fee revenue,
 * GP carry across all funds, sector/geography exposure.
 */

const db = require('../db/database');

class ConsolidatedReportingService {

  /**
   * Generate consolidated dashboard across all active funds
   */
  dashboard(options = {}) {
    if (!db.db) throw new Error('Database not initialized');

    const funds = db.findAll('funds', options.status ? { status: options.status } : { status: 'ACTIVE' });

    // Aggregate fund-level metrics
    const totalAUM = funds.reduce((sum, f) => sum + (f.nav || 0), 0);
    const totalCommitments = funds.reduce((sum, f) => sum + (f.total_commitments || 0), 0);
    const totalCalled = funds.reduce((sum, f) => sum + (f.called_capital || 0), 0);
    const totalUncalled = totalCommitments - totalCalled;

    // Get all investments across funds
    const investments = db.query("SELECT * FROM investments WHERE status IN ('ACTIVE', 'PARTIALLY_REALIZED')");
    const totalCostBasis = investments.reduce((sum, i) => sum + (i.cost_basis || 0), 0);
    const totalFairValue = investments.reduce((sum, i) => sum + (i.fair_value || 0), 0);

    // Realized investments
    const realized = db.query("SELECT * FROM investments WHERE status = 'FULLY_REALIZED'");
    const totalRealizedProceeds = realized.reduce((sum, i) => sum + (i.exit_proceeds || 0), 0);
    const totalRealizedCost = realized.reduce((sum, i) => sum + (i.cost_basis || 0), 0);

    // Get all LPs (deduplicated across funds)
    const allCommitments = db.query(`
      SELECT c.investor_id, i.name as investor_name, i.entity_type,
             SUM(c.commitment) as total_commitment,
             SUM(c.called_capital) as total_called,
             SUM(c.distributions) as total_distributions,
             SUM(c.capital_account) as total_capital_account,
             COUNT(DISTINCT c.fund_id) as fund_count
      FROM commitments c
      JOIN investors i ON c.investor_id = i.id
      GROUP BY c.investor_id
      ORDER BY total_commitment DESC
    `);

    // Fee revenue estimation
    const feeRevenue = funds.reduce((sum, f) => {
      const feeBase = f.total_commitments || 0; // Simplified: fee on commitments during investment period
      const annualFee = feeBase * (f.mgmt_fee_rate || 0.02);
      return sum + annualFee;
    }, 0);

    // GP carry potential
    const carryPotential = funds.reduce((sum, f) => {
      const profit = (f.nav || 0) - (f.called_capital || 0);
      if (profit <= 0) return sum;
      return sum + (profit * (f.carry_rate || 0.20));
    }, 0);

    // Sector breakdown
    const sectorBreakdown = this._groupBy(investments, 'sector', 'fair_value');
    const geographyBreakdown = this._groupBy(investments, 'geography', 'fair_value');
    const fairValueLevelBreakdown = this._groupBy(investments, 'fair_value_level', 'fair_value');

    // Vintage year breakdown
    const vintageBreakdown = {};
    for (const fund of funds) {
      const vy = fund.vintage_year || 'Unknown';
      if (!vintageBreakdown[vy]) vintageBreakdown[vy] = { fundCount: 0, nav: 0, commitments: 0 };
      vintageBreakdown[vy].fundCount++;
      vintageBreakdown[vy].nav += fund.nav || 0;
      vintageBreakdown[vy].commitments += fund.total_commitments || 0;
    }

    return {
      reportType: 'CONSOLIDATED_DASHBOARD',
      generatedAt: new Date().toISOString(),
      entity: 'Antoninus Global SPC',

      // Platform-Level Metrics
      platformMetrics: {
        totalAUM,
        totalCommitments,
        totalCalled,
        totalUncalled,
        drawdownPct: totalCommitments > 0 ? parseFloat(((totalCalled / totalCommitments) * 100).toFixed(1)) : 0,
        activeFunds: funds.length,
        totalInvestments: investments.length,
        realizedExits: realized.length,
        uniqueLPs: allCommitments.length,
        estimatedAnnualFeeRevenue: parseFloat(feeRevenue.toFixed(0)),
        estimatedGpCarryPotential: parseFloat(carryPotential.toFixed(0))
      },

      // Portfolio Performance
      portfolioPerformance: {
        totalCostBasis,
        totalFairValue,
        unrealizedGainLoss: totalFairValue - totalCostBasis,
        grossMoic: totalCostBasis > 0 ? parseFloat((totalFairValue / totalCostBasis).toFixed(2)) : 0,
        totalRealizedProceeds,
        realizedMoic: totalRealizedCost > 0 ? parseFloat((totalRealizedProceeds / totalRealizedCost).toFixed(2)) : 0
      },

      // Fund-Level Summary
      funds: funds.map(f => {
        const fundInvestments = investments.filter(i => i.fund_id === f.id);
        const fundCost = fundInvestments.reduce((sum, i) => sum + (i.cost_basis || 0), 0);
        const fundFv = fundInvestments.reduce((sum, i) => sum + (i.fair_value || 0), 0);
        return {
          id: f.id,
          name: f.name,
          vintageYear: f.vintage_year,
          jurisdiction: f.jurisdiction,
          status: f.status,
          nav: f.nav || 0,
          totalCommitments: f.total_commitments || 0,
          calledCapital: f.called_capital || 0,
          investmentCount: fundInvestments.length,
          costBasis: fundCost,
          fairValue: fundFv,
          grossMoic: fundCost > 0 ? parseFloat((fundFv / fundCost).toFixed(2)) : 0,
          mgmtFeeRate: f.mgmt_fee_rate,
          carryRate: f.carry_rate,
          pctOfAUM: totalAUM > 0 ? parseFloat((((f.nav || 0) / totalAUM) * 100).toFixed(1)) : 0
        };
      }),

      // LP Base
      lpBase: {
        totalLPs: allCommitments.length,
        totalCommittedByLPs: allCommitments.reduce((sum, c) => sum + c.total_commitment, 0),
        topLPs: allCommitments.slice(0, 10).map(c => ({
          name: c.investor_name,
          entityType: c.entity_type,
          totalCommitment: c.total_commitment,
          totalCalled: c.total_called,
          fundCount: c.fund_count,
          pctOfPlatform: totalCommitments > 0 ? parseFloat(((c.total_commitment / totalCommitments) * 100).toFixed(1)) : 0
        })),
        byEntityType: this._groupBySum(allCommitments, 'entity_type', 'total_commitment')
      },

      // Diversification
      diversification: {
        bySector: sectorBreakdown,
        byGeography: geographyBreakdown,
        byFairValueLevel: fairValueLevelBreakdown,
        byVintage: vintageBreakdown
      }
    };
  }

  /**
   * GP economics summary across all funds
   */
  gpEconomics() {
    if (!db.db) throw new Error('Database not initialized');
    const funds = db.findAll('funds', { status: 'ACTIVE' });

    const economics = funds.map(f => {
      const feeBase = f.total_commitments || 0;
      const annualMgmtFee = feeBase * (f.mgmt_fee_rate || 0.02);
      const profit = Math.max(0, (f.nav || 0) - (f.called_capital || 0));
      const estimatedCarry = profit * (f.carry_rate || 0.20);

      return {
        fundId: f.id,
        fundName: f.name,
        mgmtFeeRate: f.mgmt_fee_rate || 0.02,
        carryRate: f.carry_rate || 0.20,
        preferredReturn: f.preferred_return || 0.08,
        annualMgmtFee,
        estimatedCarry,
        totalGpRevenue: annualMgmtFee + estimatedCarry,
        feeBase,
        nav: f.nav || 0,
        calledCapital: f.called_capital || 0
      };
    });

    return {
      reportType: 'GP_ECONOMICS_CONSOLIDATED',
      generatedAt: new Date().toISOString(),
      totalAnnualMgmtFees: economics.reduce((sum, e) => sum + e.annualMgmtFee, 0),
      totalEstimatedCarry: economics.reduce((sum, e) => sum + e.estimatedCarry, 0),
      totalGpRevenue: economics.reduce((sum, e) => sum + e.totalGpRevenue, 0),
      funds: economics
    };
  }

  // --- Helpers ---

  _groupBy(items, key, valueKey) {
    const groups = {};
    for (const item of items) {
      const group = item[key] || 'Unknown';
      if (!groups[group]) groups[group] = { count: 0, totalValue: 0 };
      groups[group].count++;
      groups[group].totalValue += item[valueKey] || 0;
    }
    const total = Object.values(groups).reduce((sum, g) => sum + g.totalValue, 0);
    for (const g of Object.values(groups)) {
      g.pct = total > 0 ? parseFloat(((g.totalValue / total) * 100).toFixed(1)) : 0;
    }
    return groups;
  }

  _groupBySum(items, key, valueKey) {
    const groups = {};
    for (const item of items) {
      const group = item[key] || 'Unknown';
      if (!groups[group]) groups[group] = { count: 0, total: 0 };
      groups[group].count++;
      groups[group].total += item[valueKey] || 0;
    }
    return groups;
  }
}

module.exports = new ConsolidatedReportingService();
