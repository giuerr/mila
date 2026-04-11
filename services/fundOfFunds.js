/**
 * Fund-of-Funds Service
 * Look-through analysis, multi-manager aggregation, consolidated exposure,
 * J-curve blending, fee layering, re-up tracking.
 */

class FundOfFundsService {

  /**
   * Look-through analysis — aggregate exposure across underlying funds
   */
  lookThroughAnalysis({ fofFund, underlyingFunds }) {
    const totalNav = underlyingFunds.reduce((s, f) => s + f.nav, 0);
    const totalCommitted = underlyingFunds.reduce((s, f) => s + f.commitment, 0);

    // Aggregate sector exposure
    const sectorExposure = {};
    const geoExposure = {};
    const managerExposure = {};

    for (const fund of underlyingFunds) {
      const weight = fund.nav / totalNav;
      managerExposure[fund.manager] = (managerExposure[fund.manager] || 0) + fund.nav;

      for (const holding of fund.holdings || []) {
        const sector = holding.sector || 'Other';
        const geo = holding.geography || 'Other';
        const holdingValue = holding.fairValue * weight;

        sectorExposure[sector] = (sectorExposure[sector] || 0) + holdingValue;
        geoExposure[geo] = (geoExposure[geo] || 0) + holdingValue;
      }
    }

    return {
      fofName: fofFund.name,
      totalNav,
      totalCommitted,
      underlyingFundCount: underlyingFunds.length,
      uniqueManagers: Object.keys(managerExposure).length,
      underlyingCompanyCount: underlyingFunds.reduce((s, f) => s + (f.holdings?.length || 0), 0),
      sectorExposure: this._toSortedPctArray(sectorExposure, totalNav),
      geographyExposure: this._toSortedPctArray(geoExposure, totalNav),
      managerConcentration: this._toSortedPctArray(managerExposure, totalNav),
      top10Holdings: this._getTopHoldings(underlyingFunds, 10),
      overlapAnalysis: this._detectOverlap(underlyingFunds)
    };
  }

  /**
   * Consolidated performance across underlying funds
   */
  consolidatedPerformance({ underlyingFunds }) {
    const totalContributed = underlyingFunds.reduce((s, f) => s + f.calledCapital, 0);
    const totalDistributed = underlyingFunds.reduce((s, f) => s + f.distributions, 0);
    const totalNav = underlyingFunds.reduce((s, f) => s + f.nav, 0);

    const tvpi = (totalDistributed + totalNav) / totalContributed;
    const dpi = totalDistributed / totalContributed;
    const rvpi = totalNav / totalContributed;

    return {
      aggregateMetrics: {
        tvpi: parseFloat(tvpi.toFixed(4)),
        dpi: parseFloat(dpi.toFixed(4)),
        rvpi: parseFloat(rvpi.toFixed(4)),
        totalContributed,
        totalDistributed,
        totalNav,
        totalValue: totalDistributed + totalNav
      },
      byFund: underlyingFunds.map(f => ({
        name: f.name,
        manager: f.manager,
        strategy: f.strategy,
        vintage: f.vintageYear,
        commitment: f.commitment,
        calledCapital: f.calledCapital,
        distributions: f.distributions,
        nav: f.nav,
        tvpi: parseFloat(((f.distributions + f.nav) / f.calledCapital).toFixed(4)),
        dpi: parseFloat((f.distributions / f.calledCapital).toFixed(4)),
        irr: f.irr,
        quartile: f.quartile,
        pctOfFof: parseFloat(((f.nav / totalNav) * 100).toFixed(1)) + '%'
      })),
      byStrategy: this._groupByStrategy(underlyingFunds),
      byVintage: this._groupByVintage(underlyingFunds)
    };
  }

  /**
   * Fee layering analysis (FoF fee on top of underlying fund fees)
   */
  feeLayeringAnalysis({ fofFees, underlyingFunds }) {
    const underlyingWeightedMgmtFee = underlyingFunds.reduce((s, f) =>
      s + (f.mgmtFeeRate * (f.nav / underlyingFunds.reduce((t, uf) => t + uf.nav, 0))), 0);
    const underlyingWeightedCarry = underlyingFunds.reduce((s, f) =>
      s + (f.carryRate * (f.nav / underlyingFunds.reduce((t, uf) => t + uf.nav, 0))), 0);

    const totalMgmtFeeLayer = fofFees.mgmtFeeRate + underlyingWeightedMgmtFee;
    const totalCarryLayer = fofFees.carryRate + underlyingWeightedCarry;

    return {
      fofLevel: {
        mgmtFeeRate: fofFees.mgmtFeeRate,
        carryRate: fofFees.carryRate
      },
      underlyingLevel: {
        weightedAvgMgmtFee: parseFloat((underlyingWeightedMgmtFee * 100).toFixed(2)) + '%',
        weightedAvgCarry: parseFloat((underlyingWeightedCarry * 100).toFixed(2)) + '%'
      },
      totalFeeLoad: {
        totalMgmtFee: parseFloat((totalMgmtFeeLayer * 100).toFixed(2)) + '%',
        totalCarry: parseFloat((totalCarryLayer * 100).toFixed(2)) + '%',
        estimatedAnnualDrag: parseFloat((totalMgmtFeeLayer * 100).toFixed(2)) + '% + carry'
      },
      byFund: underlyingFunds.map(f => ({
        name: f.name,
        mgmtFee: (f.mgmtFeeRate * 100).toFixed(2) + '%',
        carry: (f.carryRate * 100).toFixed(2) + '%',
        allInMgmtFee: ((f.mgmtFeeRate + fofFees.mgmtFeeRate) * 100).toFixed(2) + '%'
      }))
    };
  }

  /**
   * J-curve blending — model aggregate FoF cash flow profile
   */
  jCurveBlending({ underlyingFunds, forecastYears = 10 }) {
    const years = [];
    for (let y = 0; y <= forecastYears; y++) {
      let totalCalls = 0;
      let totalDistributions = 0;

      for (const fund of underlyingFunds) {
        const fundAge = y - (fund.vintageOffset || 0);
        if (fundAge < 0 || fundAge > 12) continue;

        // Simplified J-curve model
        const callRate = fundAge <= 4 ? 0.25 : 0; // Deploy over 4 years
        const distRate = fundAge <= 3 ? 0 : fundAge <= 6 ? 0.10 : fundAge <= 10 ? 0.25 : 0.15;

        totalCalls += fund.commitment * callRate;
        totalDistributions += fund.commitment * fund.expectedMoic * distRate;
      }

      const netCashFlow = totalDistributions - totalCalls;
      years.push({
        year: y,
        capitalCalls: parseFloat(totalCalls.toFixed(2)),
        distributions: parseFloat(totalDistributions.toFixed(2)),
        netCashFlow: parseFloat(netCashFlow.toFixed(2)),
        cumulativeNet: 0 // Calculated below
      });
    }

    let cumulative = 0;
    for (const year of years) {
      cumulative += year.netCashFlow;
      year.cumulativeNet = parseFloat(cumulative.toFixed(2));
    }

    return {
      forecastYears,
      underlyingFundCount: underlyingFunds.length,
      cashFlowProfile: years,
      jCurveTrough: years.reduce((min, y) => y.cumulativeNet < min.cumulativeNet ? y : min),
      breakEvenYear: years.find(y => y.cumulativeNet >= 0 && y.year > 0)?.year || 'Beyond forecast'
    };
  }

  /**
   * Re-up / commitment pacing plan
   */
  pacingPlan({ targetAllocation, currentPortfolio, annualBudget, strategies }) {
    const currentByStrategy = {};
    for (const fund of currentPortfolio) {
      const strat = fund.strategy || 'Other';
      currentByStrategy[strat] = (currentByStrategy[strat] || 0) + fund.nav;
    }

    const totalNav = currentPortfolio.reduce((s, f) => s + f.nav, 0);

    return {
      totalPortfolioNav: totalNav,
      annualCommitmentBudget: annualBudget,
      targetAllocation: strategies.map(s => ({
        strategy: s.name,
        targetPct: s.targetPct,
        currentPct: parseFloat(((currentByStrategy[s.name] || 0) / totalNav * 100).toFixed(1)),
        currentNav: currentByStrategy[s.name] || 0,
        targetNav: totalNav * (s.targetPct / 100),
        gap: parseFloat((totalNav * (s.targetPct / 100) - (currentByStrategy[s.name] || 0)).toFixed(2)),
        recommendedCommitment: Math.max(0, parseFloat((annualBudget * (s.targetPct / 100)).toFixed(2))),
        overUnderweight: (currentByStrategy[s.name] || 0) / totalNav * 100 > s.targetPct ? 'OVERWEIGHT' : 'UNDERWEIGHT'
      })),
      upcomingReUps: currentPortfolio
        .filter(f => f.expectedNextFund)
        .map(f => ({
          manager: f.manager,
          currentFund: f.name,
          expectedNextFund: f.expectedNextFund,
          expectedTiming: f.nextFundTiming,
          currentCommitment: f.commitment,
          recommendedReUp: f.reUpRecommendation || f.commitment
        }))
    };
  }

  // --- Private ---

  _toSortedPctArray(obj, total) {
    return Object.entries(obj)
      .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)), pct: parseFloat(((value / total) * 100).toFixed(1)) + '%' }))
      .sort((a, b) => b.value - a.value);
  }

  _getTopHoldings(funds, count) {
    const allHoldings = [];
    for (const fund of funds) {
      for (const h of fund.holdings || []) {
        const existing = allHoldings.find(a => a.name === h.name);
        if (existing) {
          existing.totalValue += h.fairValue;
          existing.fundCount++;
          existing.funds.push(fund.name);
        } else {
          allHoldings.push({ name: h.name, sector: h.sector, totalValue: h.fairValue, fundCount: 1, funds: [fund.name] });
        }
      }
    }
    return allHoldings.sort((a, b) => b.totalValue - a.totalValue).slice(0, count);
  }

  _detectOverlap(funds) {
    const holdingMap = {};
    for (const fund of funds) {
      for (const h of fund.holdings || []) {
        if (!holdingMap[h.name]) holdingMap[h.name] = [];
        holdingMap[h.name].push(fund.name);
      }
    }
    return Object.entries(holdingMap)
      .filter(([, funds]) => funds.length > 1)
      .map(([name, fundList]) => ({ company: name, appearsIn: fundList, overlapCount: fundList.length }))
      .sort((a, b) => b.overlapCount - a.overlapCount);
  }

  _groupByStrategy(funds) {
    const groups = {};
    for (const f of funds) {
      const s = f.strategy || 'Other';
      if (!groups[s]) groups[s] = { count: 0, totalNav: 0, totalCommitted: 0 };
      groups[s].count++;
      groups[s].totalNav += f.nav;
      groups[s].totalCommitted += f.commitment;
    }
    return groups;
  }

  _groupByVintage(funds) {
    const groups = {};
    for (const f of funds) {
      const v = f.vintageYear || 'Unknown';
      if (!groups[v]) groups[v] = { count: 0, totalNav: 0 };
      groups[v].count++;
      groups[v].totalNav += f.nav;
    }
    return groups;
  }
}

module.exports = new FundOfFundsService();
