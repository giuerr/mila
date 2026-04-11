/**
 * Performance Attribution Service
 * Break down fund returns by sector, geography, deal size, hold period, and status.
 * Rank investments by contribution to fund value. Uses real investment data from DB.
 */

const db = require('../db/database');

class PerformanceAttributionService {

  /**
   * Full return attribution breakdown
   * @param {Object} params
   * @param {string} params.fundId - Fund identifier
   * @returns {Object} Attribution by sector, geography, dealSize, holdPeriod, status
   */
  attributeReturns({ fundId }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId) throw new Error('fundId is required');

    const fund = db.findById('funds', fundId);
    if (!fund) throw new Error(`Fund ${fundId} not found`);

    const investments = db.query(`
      SELECT * FROM investments WHERE fund_id = ?
    `, [fundId]);

    if (investments.length === 0) throw new Error(`No investments found for fund ${fundId}`);

    const totalCostBasis = investments.reduce((sum, inv) => sum + (inv.cost_basis || 0), 0);
    const totalCurrentValue = investments.reduce((sum, inv) => {
      return sum + this._currentValue(inv);
    }, 0);
    const totalGainLoss = totalCurrentValue - totalCostBasis;

    // --- By Sector ---
    const bySector = this._attributeByField(investments, 'sector', totalGainLoss);

    // --- By Geography ---
    const byGeography = this._attributeByField(investments, 'geography', totalGainLoss);

    // --- By Deal Size Buckets ---
    const dealSizeBuckets = [
      { label: '<$5M', min: 0, max: 5000000 },
      { label: '$5M-$25M', min: 5000000, max: 25000000 },
      { label: '$25M-$100M', min: 25000000, max: 100000000 },
      { label: '>$100M', min: 100000000, max: Infinity }
    ];
    const byDealSize = this._attributeByBucket(investments, 'cost_basis', dealSizeBuckets, totalGainLoss);

    // --- By Hold Period Buckets ---
    const holdPeriodBuckets = [
      { label: '<2 years', min: 0, max: 2 },
      { label: '2-5 years', min: 2, max: 5 },
      { label: '>5 years', min: 5, max: Infinity }
    ];
    const investmentsWithHold = investments.map(inv => ({
      ...inv,
      _holdYears: this._holdPeriodYears(inv)
    }));
    const byHoldPeriod = this._attributeByBucket(investmentsWithHold, '_holdYears', holdPeriodBuckets, totalGainLoss);

    // --- By Status (realized vs unrealized) ---
    const realized = investments.filter(inv => inv.status === 'FULLY_REALIZED' || inv.status === 'WRITTEN_OFF');
    const unrealized = investments.filter(inv => inv.status === 'ACTIVE' || inv.status === 'PARTIALLY_REALIZED');

    const realizedCost = realized.reduce((sum, inv) => sum + (inv.cost_basis || 0), 0);
    const realizedValue = realized.reduce((sum, inv) => sum + (inv.exit_proceeds || 0), 0);
    const realizedGain = realizedValue - realizedCost;

    const unrealizedCost = unrealized.reduce((sum, inv) => sum + (inv.cost_basis || 0), 0);
    const unrealizedValue = unrealized.reduce((sum, inv) => sum + (inv.fair_value || 0), 0);
    const unrealizedGain = unrealizedValue - unrealizedCost;

    const byStatus = {
      realized: {
        count: realized.length,
        costBasis: realizedCost,
        currentValue: realizedValue,
        gainLoss: parseFloat(realizedGain.toFixed(2)),
        moic: realizedCost > 0 ? parseFloat((realizedValue / realizedCost).toFixed(4)) : 0,
        contributionPct: totalGainLoss !== 0 ? parseFloat(((realizedGain / totalGainLoss) * 100).toFixed(1)) : 0
      },
      unrealized: {
        count: unrealized.length,
        costBasis: unrealizedCost,
        currentValue: unrealizedValue,
        gainLoss: parseFloat(unrealizedGain.toFixed(2)),
        moic: unrealizedCost > 0 ? parseFloat((unrealizedValue / unrealizedCost).toFixed(4)) : 0,
        contributionPct: totalGainLoss !== 0 ? parseFloat(((unrealizedGain / totalGainLoss) * 100).toFixed(1)) : 0
      }
    };

    return {
      fundId,
      fundName: fund.name,
      asOfDate: new Date().toISOString().split('T')[0],
      summary: {
        totalInvestments: investments.length,
        totalCostBasis,
        totalCurrentValue: parseFloat(totalCurrentValue.toFixed(2)),
        totalGainLoss: parseFloat(totalGainLoss.toFixed(2)),
        grossMoic: totalCostBasis > 0 ? parseFloat((totalCurrentValue / totalCostBasis).toFixed(4)) : 0
      },
      attribution: {
        bySector,
        byGeography,
        byDealSize,
        byHoldPeriod,
        byStatus
      }
    };
  }

  /**
   * Top contributors to fund value (ranked by absolute gain)
   * @param {Object} params
   * @param {string} params.fundId - Fund identifier
   * @param {number} params.limit - Number of results (default 10)
   */
  topContributors({ fundId, limit = 10 }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId) throw new Error('fundId is required');

    const investments = db.query(`
      SELECT * FROM investments WHERE fund_id = ?
    `, [fundId]);

    if (investments.length === 0) throw new Error(`No investments found for fund ${fundId}`);

    const totalCostBasis = investments.reduce((sum, inv) => sum + (inv.cost_basis || 0), 0);
    const totalCurrentValue = investments.reduce((sum, inv) => sum + this._currentValue(inv), 0);
    const totalGainLoss = totalCurrentValue - totalCostBasis;

    const ranked = investments.map(inv => {
      const currentValue = this._currentValue(inv);
      const gainLoss = currentValue - (inv.cost_basis || 0);
      return {
        companyName: inv.company_name,
        sector: inv.sector || 'N/A',
        geography: inv.geography || 'N/A',
        investmentDate: inv.investment_date,
        costBasis: inv.cost_basis || 0,
        currentValue: parseFloat(currentValue.toFixed(2)),
        gainLoss: parseFloat(gainLoss.toFixed(2)),
        moic: inv.cost_basis > 0 ? parseFloat((currentValue / inv.cost_basis).toFixed(4)) : 0,
        contributionPct: totalGainLoss !== 0 ? parseFloat(((gainLoss / totalGainLoss) * 100).toFixed(1)) : 0,
        holdPeriodYears: parseFloat(this._holdPeriodYears(inv).toFixed(1)),
        status: inv.status
      };
    });

    ranked.sort((a, b) => b.gainLoss - a.gainLoss);

    return {
      fundId,
      asOfDate: new Date().toISOString().split('T')[0],
      topContributors: ranked.slice(0, limit),
      totalGainLoss: parseFloat(totalGainLoss.toFixed(2)),
      topContributorsTotalGain: parseFloat(ranked.slice(0, limit).reduce((sum, r) => sum + r.gainLoss, 0).toFixed(2)),
      topContributorsSharePct: totalGainLoss !== 0
        ? parseFloat(((ranked.slice(0, limit).reduce((sum, r) => sum + r.gainLoss, 0) / totalGainLoss) * 100).toFixed(1))
        : 0
    };
  }

  /**
   * Bottom contributors (largest losses / worst underperformers)
   * @param {Object} params
   * @param {string} params.fundId - Fund identifier
   * @param {number} params.limit - Number of results (default 10)
   */
  bottomContributors({ fundId, limit = 10 }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId) throw new Error('fundId is required');

    const investments = db.query(`
      SELECT * FROM investments WHERE fund_id = ?
    `, [fundId]);

    if (investments.length === 0) throw new Error(`No investments found for fund ${fundId}`);

    const totalCostBasis = investments.reduce((sum, inv) => sum + (inv.cost_basis || 0), 0);
    const totalCurrentValue = investments.reduce((sum, inv) => sum + this._currentValue(inv), 0);
    const totalGainLoss = totalCurrentValue - totalCostBasis;

    const ranked = investments.map(inv => {
      const currentValue = this._currentValue(inv);
      const gainLoss = currentValue - (inv.cost_basis || 0);
      return {
        companyName: inv.company_name,
        sector: inv.sector || 'N/A',
        geography: inv.geography || 'N/A',
        investmentDate: inv.investment_date,
        costBasis: inv.cost_basis || 0,
        currentValue: parseFloat(currentValue.toFixed(2)),
        gainLoss: parseFloat(gainLoss.toFixed(2)),
        moic: inv.cost_basis > 0 ? parseFloat((currentValue / inv.cost_basis).toFixed(4)) : 0,
        contributionPct: totalGainLoss !== 0 ? parseFloat(((gainLoss / totalGainLoss) * 100).toFixed(1)) : 0,
        holdPeriodYears: parseFloat(this._holdPeriodYears(inv).toFixed(1)),
        status: inv.status
      };
    });

    ranked.sort((a, b) => a.gainLoss - b.gainLoss);

    const bottomSlice = ranked.slice(0, limit);
    const totalLoss = bottomSlice.reduce((sum, r) => sum + r.gainLoss, 0);

    return {
      fundId,
      asOfDate: new Date().toISOString().split('T')[0],
      bottomContributors: bottomSlice,
      totalGainLoss: parseFloat(totalGainLoss.toFixed(2)),
      bottomContributorsTotalLoss: parseFloat(totalLoss.toFixed(2)),
      bottomContributorsSharePct: totalGainLoss !== 0
        ? parseFloat(((totalLoss / totalGainLoss) * 100).toFixed(1))
        : 0,
      writeOffs: investments.filter(inv => inv.status === 'WRITTEN_OFF').length
    };
  }

  // --- Private ---

  _currentValue(inv) {
    if (inv.status === 'FULLY_REALIZED' || inv.status === 'WRITTEN_OFF') {
      return inv.exit_proceeds || 0;
    }
    return inv.fair_value || 0;
  }

  _holdPeriodYears(inv) {
    const start = inv.investment_date ? new Date(inv.investment_date) : new Date();
    const end = inv.exit_date ? new Date(inv.exit_date) : new Date();
    const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
    return Math.max(0, (end.getTime() - start.getTime()) / msPerYear);
  }

  _attributeByField(investments, field, totalGainLoss) {
    const groups = {};
    for (const inv of investments) {
      const key = inv[field] || 'Other';
      if (!groups[key]) groups[key] = { investments: [], costBasis: 0, currentValue: 0 };
      groups[key].investments.push(inv);
      groups[key].costBasis += inv.cost_basis || 0;
      groups[key].currentValue += this._currentValue(inv);
    }

    return Object.entries(groups)
      .map(([label, data]) => {
        const gainLoss = data.currentValue - data.costBasis;
        return {
          label,
          count: data.investments.length,
          costBasis: parseFloat(data.costBasis.toFixed(2)),
          currentValue: parseFloat(data.currentValue.toFixed(2)),
          gainLoss: parseFloat(gainLoss.toFixed(2)),
          moic: data.costBasis > 0 ? parseFloat((data.currentValue / data.costBasis).toFixed(4)) : 0,
          contributionPct: totalGainLoss !== 0 ? parseFloat(((gainLoss / totalGainLoss) * 100).toFixed(1)) : 0
        };
      })
      .sort((a, b) => b.gainLoss - a.gainLoss);
  }

  _attributeByBucket(investments, field, buckets, totalGainLoss) {
    return buckets.map(bucket => {
      const matching = investments.filter(inv => {
        const val = inv[field] || 0;
        return val >= bucket.min && val < bucket.max;
      });

      const costBasis = matching.reduce((sum, inv) => sum + (inv.cost_basis || 0), 0);
      const currentValue = matching.reduce((sum, inv) => sum + this._currentValue(inv), 0);
      const gainLoss = currentValue - costBasis;

      return {
        label: bucket.label,
        count: matching.length,
        costBasis: parseFloat(costBasis.toFixed(2)),
        currentValue: parseFloat(currentValue.toFixed(2)),
        gainLoss: parseFloat(gainLoss.toFixed(2)),
        moic: costBasis > 0 ? parseFloat((currentValue / costBasis).toFixed(4)) : 0,
        contributionPct: totalGainLoss !== 0 ? parseFloat(((gainLoss / totalGainLoss) * 100).toFixed(1)) : 0
      };
    });
  }
}

module.exports = new PerformanceAttributionService();
