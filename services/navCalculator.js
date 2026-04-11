/**
 * NAV Calculator Service
 * Net Asset Value calculation with side pockets, equalization,
 * multi-series support, and component valuation.
 */

class NavCalculatorService {

  /**
   * Calculate fund-level NAV
   */
  calculateNav({ assets, liabilities, asOfDate }) {
    if (!assets || typeof assets !== 'object') throw new Error('calculateNav: assets object is required.');
    if (!liabilities || typeof liabilities !== 'object') throw new Error('calculateNav: liabilities object is required.');
    if (!asOfDate) throw new Error('calculateNav: asOfDate is required.');
    const totalAssets = this._sumAssets(assets);
    const totalLiabilities = this._sumLiabilities(liabilities);
    const nav = totalAssets - totalLiabilities;

    return {
      asOfDate,
      assets: {
        investmentsAtFairValue: assets.investments || 0,
        cash: assets.cash || 0,
        receivables: assets.receivables || 0,
        accruedIncome: assets.accruedIncome || 0,
        otherAssets: assets.other || 0,
        total: parseFloat(totalAssets.toFixed(2))
      },
      liabilities: {
        accruedExpenses: liabilities.accruedExpenses || 0,
        managementFeePayable: liabilities.managementFee || 0,
        carriedInterestPayable: liabilities.carriedInterest || 0,
        creditFacilityBalance: liabilities.creditFacility || 0,
        redemptionsPayable: liabilities.redemptionsPayable || 0,
        otherLiabilities: liabilities.other || 0,
        total: parseFloat(totalLiabilities.toFixed(2))
      },
      nav: parseFloat(nav.toFixed(2))
    };
  }

  /**
   * Calculate NAV per share with multi-series support
   */
  calculateNavPerShare({ nav, series, sidePockets = [] }) {
    if (typeof nav !== 'number' || !Number.isFinite(nav)) throw new Error('calculateNavPerShare: nav must be a finite number.');
    if (!Array.isArray(series) || series.length === 0) throw new Error('calculateNavPerShare: series must be a non-empty array.');
    // Separate side pocket NAV
    const sidePocketNav = sidePockets.reduce((sum, sp) => sum + (sp.currentValue || 0), 0);
    const mainBookNav = nav - sidePocketNav;

    // Calculate per-series
    const totalShares = series.reduce((sum, s) => sum + s.sharesOutstanding, 0);
    if (totalShares === 0) throw new Error('calculateNavPerShare: totalShares cannot be zero.');
    const seriesResults = series.map(s => {
      const seriesNav = mainBookNav * (s.sharesOutstanding / totalShares);
      const navPerShare = seriesNav / s.sharesOutstanding;

      // Side pocket allocation — only for LPs who were in when side pocket was created
      const spAllocation = sidePockets.reduce((sum, sp) => {
        if (sp.eligibleSeries?.includes(s.id)) {
          return sum + (sp.currentValue * (s.sharesOutstanding / sp.totalEligibleShares));
        }
        return sum;
      }, 0);

      return {
        seriesId: s.id,
        seriesName: s.name,
        closingDate: s.closingDate,
        sharesOutstanding: s.sharesOutstanding,
        mainBookNav: parseFloat(seriesNav.toFixed(2)),
        sidePocketAllocation: parseFloat(spAllocation.toFixed(2)),
        totalSeriesNav: parseFloat((seriesNav + spAllocation).toFixed(2)),
        navPerShare: parseFloat(navPerShare.toFixed(6)),
        totalNavPerShare: parseFloat(((seriesNav + spAllocation) / s.sharesOutstanding).toFixed(6)),
        hwm: s.hwm,
        aboveHwm: navPerShare > (s.hwm || 0)
      };
    });

    return {
      totalNav: nav,
      mainBookNav: parseFloat(mainBookNav.toFixed(2)),
      sidePocketNav: parseFloat(sidePocketNav.toFixed(2)),
      totalSharesOutstanding: totalShares,
      series: seriesResults,
      sidePockets: sidePockets.map(sp => ({
        id: sp.id,
        name: sp.name,
        originalCost: sp.originalCost,
        currentValue: sp.currentValue,
        unrealizedGainLoss: sp.currentValue - sp.originalCost,
        createdDate: sp.createdDate,
        eligibleSeries: sp.eligibleSeries
      }))
    };
  }

  /**
   * Calculate equalization for new investor entering at different NAV
   */
  calculateEqualization({ newInvestor, currentNavPerShare, hwmPerShare, perfFeeRate }) {
    if (!newInvestor || typeof newInvestor.amount !== 'number') throw new Error('calculateEqualization: newInvestor with numeric amount is required.');
    if (typeof currentNavPerShare !== 'number' || currentNavPerShare <= 0) throw new Error('calculateEqualization: currentNavPerShare must be a positive number.');
    if (typeof perfFeeRate !== 'number') throw new Error('calculateEqualization: perfFeeRate must be a number.');
    const subscriptionAmount = newInvestor.amount;
    const sharesIssued = subscriptionAmount / currentNavPerShare;

    // If current NAV > HWM, new investor would owe equalization
    // (performance fee on the gain from HWM to current NAV that they didn't experience)
    const equalizationGain = Math.max(0, currentNavPerShare - hwmPerShare);
    const equalizationCredit = equalizationGain * sharesIssued * perfFeeRate;

    // If current NAV < HWM, new investor gets equalization debit
    // (they shouldn't pay perf fee on gains up to HWM that they didn't lose)
    const equalizationLoss = Math.max(0, hwmPerShare - currentNavPerShare);
    const equalizationDebit = equalizationLoss * sharesIssued * perfFeeRate;

    return {
      investor: newInvestor.name,
      subscriptionAmount,
      currentNavPerShare: parseFloat(currentNavPerShare.toFixed(6)),
      hwmPerShare: parseFloat(hwmPerShare.toFixed(6)),
      sharesIssued: parseFloat(sharesIssued.toFixed(6)),
      equalizationCredit: parseFloat(equalizationCredit.toFixed(2)),
      equalizationDebit: parseFloat(equalizationDebit.toFixed(2)),
      netEqualization: parseFloat((equalizationCredit - equalizationDebit).toFixed(2)),
      explanation: equalizationCredit > 0
        ? `New investor deposits ${equalizationCredit.toFixed(2)} equalization credit. If NAV stays above HWM at crystallization, this is paid to GP as performance fee. If NAV drops, a portion is refunded to investor.`
        : equalizationDebit > 0
        ? `New investor receives ${equalizationDebit.toFixed(2)} equalization debit protection. They will not pay performance fees until NAV recovers above their effective HWM.`
        : 'No equalization needed — NAV equals HWM.'
    };
  }

  /**
   * Side pocket creation
   */
  createSidePocket({ assetName, costBasis, currentValue, reason, fundSeries, createdDate }) {
    if (!assetName) throw new Error('createSidePocket: assetName is required.');
    if (typeof costBasis !== 'number') throw new Error('createSidePocket: costBasis must be a number.');
    if (!Array.isArray(fundSeries)) throw new Error('createSidePocket: fundSeries must be an array.');
    const eligibleSeries = fundSeries.filter(s =>
      new Date(s.closingDate) <= new Date(createdDate)
    );
    const totalEligibleShares = eligibleSeries.reduce((sum, s) => sum + s.sharesOutstanding, 0);
    if (totalEligibleShares === 0) throw new Error('createSidePocket: no eligible shares found — totalEligibleShares is zero.');

    return {
      id: `SP-${Date.now()}`,
      assetName,
      costBasis,
      currentValue,
      unrealizedGainLoss: currentValue - costBasis,
      reason,
      createdDate,
      eligibleSeries: eligibleSeries.map(s => s.id),
      totalEligibleShares,
      allocationPerShare: parseFloat((currentValue / totalEligibleShares).toFixed(6)),
      status: 'ACTIVE',
      rules: {
        excludedFromMainBookNav: true,
        excludedFromPerformanceFee: true,
        excludedFromRedemptions: true,
        realizedOnLiquidation: true
      }
    };
  }

  /**
   * Component valuation breakdown by fair value hierarchy
   */
  valuationHierarchy(investments) {
    if (!Array.isArray(investments) || investments.length === 0) throw new Error('valuationHierarchy: investments must be a non-empty array.');
    const levels = { 1: [], 2: [], 3: [] };

    for (const inv of investments) {
      levels[inv.fairValueLevel].push(inv);
    }

    const summary = {};
    for (const [level, items] of Object.entries(levels)) {
      const totalFv = items.reduce((sum, i) => sum + i.fairValue, 0);
      const totalCost = items.reduce((sum, i) => sum + i.costBasis, 0);
      summary[`level${level}`] = {
        count: items.length,
        totalFairValue: parseFloat(totalFv.toFixed(2)),
        totalCostBasis: parseFloat(totalCost.toFixed(2)),
        unrealizedGainLoss: parseFloat((totalFv - totalCost).toFixed(2)),
        items: items.map(i => ({
          name: i.name,
          costBasis: i.costBasis,
          fairValue: i.fairValue,
          gainLoss: parseFloat((i.fairValue - i.costBasis).toFixed(2)),
          valuationMethod: i.valuationMethod
        }))
      };
    }

    const totalFv = investments.reduce((sum, i) => sum + i.fairValue, 0);
    summary.total = parseFloat(totalFv.toFixed(2));
    summary.level3Pct = totalFv > 0
      ? parseFloat(((summary.level3.totalFairValue / totalFv) * 100).toFixed(2)) + '%'
      : '0%';

    return summary;
  }

  // --- Private ---

  _sumAssets(a) {
    return (a.investments || 0) + (a.cash || 0) + (a.receivables || 0) + (a.accruedIncome || 0) + (a.other || 0);
  }

  _sumLiabilities(l) {
    return (l.accruedExpenses || 0) + (l.managementFee || 0) + (l.carriedInterest || 0) + (l.creditFacility || 0) + (l.redemptionsPayable || 0) + (l.other || 0);
  }
}

module.exports = new NavCalculatorService();
