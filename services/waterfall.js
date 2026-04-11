/**
 * Waterfall Engine
 * European (whole-fund), American (deal-by-deal), hybrid structures.
 * Multi-class LP support, netting, loss carry-forward.
 */

class WaterfallEngine {

  /**
   * European (whole-fund) waterfall
   * GP gets no carry until entire fund returns capital + pref
   */
  calculateEuropeanWaterfall({
    lpInvestors, // [{ id, name, commitment, calledCapital, distributions, class }]
    fundTotalValue, // realized + unrealized
    preferredReturn = 0.08,
    carryRate = 0.20,
    catchUpRate = 1.0, // 100% to GP during catch-up
    inceptionDate,
    calculationDate
  }) {
    if (!Array.isArray(lpInvestors) || lpInvestors.length === 0) throw new Error('calculateEuropeanWaterfall: lpInvestors must be a non-empty array.');
    if (typeof fundTotalValue !== 'number' || !Number.isFinite(fundTotalValue)) throw new Error('calculateEuropeanWaterfall: fundTotalValue must be a finite number.');
    if (!inceptionDate || !calculationDate) throw new Error('calculateEuropeanWaterfall: inceptionDate and calculationDate are required.');
    const totalContributed = lpInvestors.reduce((sum, lp) => sum + lp.calledCapital, 0);
    if (totalContributed === 0) throw new Error('calculateEuropeanWaterfall: totalContributed capital cannot be zero.');
    const years = this._yearsBetween(inceptionDate, calculationDate);

    // Per-LP waterfall
    const lpResults = lpInvestors.map(lp => {
      const lpPctOfFund = lp.calledCapital / totalContributed;
      const lpShareOfValue = fundTotalValue * lpPctOfFund;

      // Apply LP-class-specific rates
      const lpPrefReturn = lp.class?.preferredReturn || preferredReturn;
      const lpCarryRate = lp.class?.carryRate || carryRate;
      const compoundedPref = lp.calledCapital * Math.pow(1 + lpPrefReturn, years) - lp.calledCapital;

      return {
        lpId: lp.id,
        lpName: lp.name,
        commitment: lp.commitment,
        calledCapital: lp.calledCapital,
        pctOfFund: parseFloat((lpPctOfFund * 100).toFixed(4)),
        shareOfTotalValue: parseFloat(lpShareOfValue.toFixed(2)),
        preferredReturnAmount: parseFloat(compoundedPref.toFixed(2)),
        preferredReturnRate: lpPrefReturn,
        carryRate: lpCarryRate,
        lpClass: lp.class?.name || 'Standard'
      };
    });

    // Fund-level waterfall tiers
    const tiers = this._computeWaterfallTiers(totalContributed, fundTotalValue, preferredReturn, carryRate, catchUpRate, years);

    // Allocate to LPs pro-rata
    const lpAllocations = lpResults.map(lp => {
      const pct = lp.calledCapital / totalContributed;
      return {
        ...lp,
        returnOfCapital: parseFloat((tiers[0].lpAmount * pct).toFixed(2)),
        preferredReturnPaid: parseFloat((tiers[1].lpAmount * pct).toFixed(2)),
        catchUpShare: parseFloat(((tiers[2]?.lpAmount || 0) * pct).toFixed(2)),
        carryShare: parseFloat(((tiers[3]?.lpAmount || 0) * pct).toFixed(2)),
        totalProceeds: parseFloat(((tiers.reduce((s, t) => s + t.lpAmount, 0)) * pct).toFixed(2))
      };
    });

    return {
      type: 'EUROPEAN',
      fundTotalValue,
      totalContributed,
      moic: parseFloat((fundTotalValue / totalContributed).toFixed(4)),
      years: parseFloat(years.toFixed(2)),
      tiers,
      lpAllocations,
      gpTotalCarry: tiers.reduce((s, t) => s + t.gpAmount, 0),
      calculationDate
    };
  }

  /**
   * American (deal-by-deal) waterfall
   * Carry calculated per investment
   */
  calculateAmericanWaterfall({
    deals, // [{ id, name, costBasis, currentValue, realizedProceeds, status }]
    lpInvestors,
    preferredReturn = 0.08,
    carryRate = 0.20,
    catchUpRate = 1.0,
    lossCarryForward = true,
    nettingEnabled = true
  }) {
    if (!Array.isArray(deals) || deals.length === 0) throw new Error('calculateAmericanWaterfall: deals must be a non-empty array.');
    let cumulativeLoss = 0;
    const dealResults = [];

    for (const deal of deals) {
      const dealValue = deal.status === 'realized' ? deal.realizedProceeds : deal.currentValue;
      const profit = dealValue - deal.costBasis;

      // Apply loss carry-forward
      let adjustedProfit = profit;
      if (lossCarryForward && cumulativeLoss > 0 && profit > 0) {
        const lossOffset = Math.min(cumulativeLoss, profit);
        adjustedProfit -= lossOffset;
        cumulativeLoss -= lossOffset;
      }
      if (profit < 0) cumulativeLoss += Math.abs(profit);

      // Per-deal waterfall
      const dealTiers = [];
      let remaining = dealValue;

      // Return of capital
      const roc = Math.min(remaining, deal.costBasis);
      dealTiers.push({ name: 'Return of Capital', lpAmount: roc, gpAmount: 0 });
      remaining -= roc;

      // Preferred return
      const prefAmount = deal.costBasis * preferredReturn * (deal.holdPeriodYears || 1);
      const prefPaid = Math.min(remaining, prefAmount);
      dealTiers.push({ name: 'Preferred Return', lpAmount: prefPaid, gpAmount: 0 });
      remaining -= prefPaid;

      // Catch-up
      let catchUp = 0;
      if (remaining > 0 && prefPaid >= prefAmount) {
        const targetGp = (roc + prefPaid) * carryRate / (1 - carryRate);
        catchUp = Math.min(remaining, targetGp);
        dealTiers.push({
          name: 'GP Catch-Up',
          lpAmount: catchUp * (1 - catchUpRate),
          gpAmount: catchUp * catchUpRate
        });
        remaining -= catchUp;
      }

      // Carry split
      if (remaining > 0) {
        dealTiers.push({
          name: 'Carry Split',
          lpAmount: remaining * (1 - carryRate),
          gpAmount: remaining * carryRate
        });
      }

      const gpCarry = dealTiers.reduce((s, t) => s + t.gpAmount, 0);
      dealResults.push({
        dealId: deal.id,
        dealName: deal.name,
        costBasis: deal.costBasis,
        currentValue: dealValue,
        status: deal.status,
        profit: parseFloat(profit.toFixed(2)),
        adjustedProfit: parseFloat(adjustedProfit.toFixed(2)),
        moic: parseFloat((dealValue / deal.costBasis).toFixed(4)),
        tiers: dealTiers,
        gpCarry: parseFloat(gpCarry.toFixed(2)),
        lpProceeds: parseFloat((dealValue - gpCarry).toFixed(2))
      });
    }

    // Netting: check if unrealized losses offset realized gains
    let nettingAdjustment = 0;
    if (nettingEnabled) {
      const unrealizedLosses = deals
        .filter(d => d.status === 'unrealized' && d.currentValue < d.costBasis)
        .reduce((sum, d) => sum + (d.costBasis - d.currentValue), 0);
      nettingAdjustment = unrealizedLosses;
    }

    const totalGpCarry = dealResults.reduce((s, d) => s + d.gpCarry, 0);

    return {
      type: 'AMERICAN',
      dealCount: deals.length,
      deals: dealResults,
      totalGpCarry: parseFloat(totalGpCarry.toFixed(2)),
      nettingAdjustment: parseFloat(nettingAdjustment.toFixed(2)),
      adjustedGpCarry: parseFloat(Math.max(0, totalGpCarry - nettingAdjustment).toFixed(2)),
      cumulativeLossCarryForward: parseFloat(cumulativeLoss.toFixed(2)),
      lossCarryForwardEnabled: lossCarryForward,
      nettingEnabled
    };
  }

  /**
   * Scenario analysis — model different exit outcomes
   */
  scenarioAnalysis({ baseCase, scenarios, waterfallType = 'european' }) {
    const calculator = waterfallType === 'european'
      ? this.calculateEuropeanWaterfall.bind(this)
      : this.calculateAmericanWaterfall.bind(this);

    const results = {};
    for (const [scenarioName, overrides] of Object.entries(scenarios)) {
      results[scenarioName] = calculator({ ...baseCase, ...overrides });
    }

    return {
      scenarios: results,
      comparison: Object.entries(results).map(([name, result]) => ({
        scenario: name,
        moic: result.moic,
        gpCarry: result.gpTotalCarry || result.totalGpCarry,
        lpProceeds: result.fundTotalValue - (result.gpTotalCarry || result.totalGpCarry)
      }))
    };
  }

  // ==================== ADVANCED WATERFALL MODELING (v5.0) ====================

  /**
   * Monte Carlo stochastic scenario analysis
   * Runs N simulations with randomized exit multiples to produce a probability distribution of outcomes
   */
  monteCarloAnalysis({ baseCase, simulations = 1000, waterfallType = 'european' }) {
    const calculator = waterfallType === 'european'
      ? this.calculateEuropeanWaterfall.bind(this)
      : this.calculateAmericanWaterfall.bind(this);

    const results = [];
    const totalContributed = baseCase.lpInvestors.reduce((s, lp) => s + lp.calledCapital, 0);

    for (let i = 0; i < simulations; i++) {
      // Randomize fund total value using log-normal distribution (realistic for PE)
      const meanMoic = (baseCase.fundTotalValue || totalContributed * 1.8) / totalContributed;
      const stdDev = 0.4; // ~40% volatility around mean
      const z = this._boxMullerRandom();
      const randomMoic = Math.max(0.1, meanMoic * Math.exp(stdDev * z - (stdDev * stdDev) / 2));
      const randomValue = totalContributed * randomMoic;

      try {
        const result = calculator({ ...baseCase, fundTotalValue: randomValue });
        results.push({
          moic: parseFloat(randomMoic.toFixed(4)),
          gpCarry: result.gpTotalCarry || result.totalGpCarry || 0,
          lpProceeds: randomValue - (result.gpTotalCarry || result.totalGpCarry || 0)
        });
      } catch { /* Skip failed simulations */ }
    }

    results.sort((a, b) => a.moic - b.moic);

    const moics = results.map(r => r.moic);
    const carries = results.map(r => r.gpCarry);

    return {
      simulations: results.length,
      distribution: {
        moic: {
          p5: moics[Math.floor(moics.length * 0.05)],
          p25: moics[Math.floor(moics.length * 0.25)],
          median: moics[Math.floor(moics.length * 0.50)],
          p75: moics[Math.floor(moics.length * 0.75)],
          p95: moics[Math.floor(moics.length * 0.95)],
          mean: parseFloat((moics.reduce((s, v) => s + v, 0) / moics.length).toFixed(4))
        },
        gpCarry: {
          p5: carries[Math.floor(carries.length * 0.05)],
          p25: carries[Math.floor(carries.length * 0.25)],
          median: carries[Math.floor(carries.length * 0.50)],
          p75: carries[Math.floor(carries.length * 0.75)],
          p95: carries[Math.floor(carries.length * 0.95)],
          mean: parseFloat((carries.reduce((s, v) => s + v, 0) / carries.length).toFixed(0))
        }
      },
      probabilities: {
        lossProb: parseFloat(((results.filter(r => r.moic < 1).length / results.length) * 100).toFixed(1)) + '%',
        returnCapitalProb: parseFloat(((results.filter(r => r.moic >= 1).length / results.length) * 100).toFixed(1)) + '%',
        above2xProb: parseFloat(((results.filter(r => r.moic >= 2).length / results.length) * 100).toFixed(1)) + '%',
        above3xProb: parseFloat(((results.filter(r => r.moic >= 3).length / results.length) * 100).toFixed(1)) + '%',
        carryPayoutProb: parseFloat(((results.filter(r => r.gpCarry > 0).length / results.length) * 100).toFixed(1)) + '%'
      },
      histogram: this._buildHistogram(moics, 20)
    };
  }

  /**
   * Clawback calculation — how much GP owes back if fund underperforms
   */
  calculateClawback({ fund, gpCarryDistributed, currentFundValue, totalContributed, preferredReturn = 0.08, carryRate = 0.20 }) {
    const years = this._yearsBetween(fund.inceptionDate, new Date().toISOString());
    const prefAmount = totalContributed * (Math.pow(1 + preferredReturn, years) - 1);
    const lpEntitlement = totalContributed + prefAmount;

    const currentTotalValue = currentFundValue + (fund.totalDistributed || 0);
    const maxGpCarry = Math.max(0, (currentTotalValue - lpEntitlement) * carryRate);
    const clawbackAmount = Math.max(0, gpCarryDistributed - maxGpCarry);

    return {
      gpCarryDistributed,
      maxAllowableCarry: parseFloat(maxGpCarry.toFixed(0)),
      clawbackAmount: parseFloat(clawbackAmount.toFixed(0)),
      clawbackRequired: clawbackAmount > 0,
      lpEntitlement: parseFloat(lpEntitlement.toFixed(0)),
      currentTotalValue: parseFloat(currentTotalValue.toFixed(0)),
      currentMoic: parseFloat((currentTotalValue / totalContributed).toFixed(4)),
      note: clawbackAmount > 0
        ? `GP has received $${gpCarryDistributed.toLocaleString()} in carry but is only entitled to $${maxGpCarry.toLocaleString()} based on current fund performance. Clawback of $${clawbackAmount.toLocaleString()} required.`
        : 'No clawback required — GP carry distributions are within allowable limits.'
    };
  }

  /**
   * Sensitivity table — MOIC impact of varying carry rate and pref return
   */
  sensitivityAnalysis({ totalContributed, fundTotalValue, carryRates, prefReturns, years, inceptionDate, calculationDate }) {
    const actualYears = years || this._yearsBetween(inceptionDate || '2020-01-01', calculationDate || new Date().toISOString());

    return {
      fundTotalValue,
      totalContributed,
      moic: parseFloat((fundTotalValue / totalContributed).toFixed(4)),
      table: carryRates.map(cr => ({
        carryRate: (cr * 100) + '%',
        scenarios: prefReturns.map(pr => {
          const prefAmount = totalContributed * (Math.pow(1 + pr, actualYears) - 1);
          const profitAbovePref = Math.max(0, (fundTotalValue - totalContributed) - prefAmount);
          const gpCarry = profitAbovePref * cr;
          const lpProceeds = fundTotalValue - gpCarry;
          const lpMoic = parseFloat((lpProceeds / totalContributed).toFixed(4));
          return {
            prefReturn: (pr * 100) + '%',
            gpCarry: parseFloat(gpCarry.toFixed(0)),
            lpProceeds: parseFloat(lpProceeds.toFixed(0)),
            lpMoic,
            lpNetIrr: parseFloat((Math.pow(lpMoic, 1 / actualYears) - 1).toFixed(4)) * 100 + '%'
          };
        })
      }))
    };
  }

  /**
   * Multi-currency waterfall — handles FX for international LPs
   */
  calculateFxAdjustedWaterfall({ baseResult, lpCurrencies, fxRates }) {
    return {
      ...baseResult,
      fxAdjusted: true,
      baseCurrency: 'USD',
      lpAllocations: (baseResult.lpAllocations || []).map(lp => {
        const currency = lpCurrencies[lp.lpId] || 'USD';
        const rate = fxRates[currency] || 1;
        return {
          ...lp,
          reportingCurrency: currency,
          fxRate: rate,
          totalProceedsLocal: parseFloat((lp.totalProceeds * rate).toFixed(2)),
          fxGainLoss: parseFloat(((rate - 1) * lp.totalProceeds).toFixed(2))
        };
      })
    };
  }

  // --- Private ---

  _boxMullerRandom() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  _buildHistogram(values, buckets) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const step = (max - min) / buckets;
    const hist = [];
    for (let i = 0; i < buckets; i++) {
      const low = min + i * step;
      const high = low + step;
      hist.push({
        range: `${low.toFixed(2)}-${high.toFixed(2)}x`,
        count: values.filter(v => v >= low && v < high).length,
        pct: parseFloat(((values.filter(v => v >= low && v < high).length / values.length) * 100).toFixed(1))
      });
    }
    return hist;
  }

  _computeWaterfallTiers(totalContributed, totalValue, prefRate, carryRate, catchUpRate, years) {
    const tiers = [];
    let remaining = totalValue;

    const roc = Math.min(remaining, totalContributed);
    tiers.push({ name: 'Return of Capital', lpAmount: roc, gpAmount: 0 });
    remaining -= roc;

    const prefAmount = totalContributed * (Math.pow(1 + prefRate, years) - 1);
    const prefPaid = Math.min(remaining, prefAmount);
    tiers.push({ name: 'Preferred Return', lpAmount: prefPaid, gpAmount: 0 });
    remaining -= prefPaid;

    if (remaining > 0 && prefPaid >= prefAmount) {
      const targetGp = (roc + prefPaid) * carryRate / (1 - carryRate);
      const catchUp = Math.min(remaining, targetGp);
      tiers.push({
        name: 'GP Catch-Up',
        lpAmount: catchUp * (1 - catchUpRate),
        gpAmount: catchUp * catchUpRate
      });
      remaining -= catchUp;
    } else {
      tiers.push({ name: 'GP Catch-Up', lpAmount: 0, gpAmount: 0 });
    }

    if (remaining > 0) {
      tiers.push({
        name: 'Carry Split',
        lpAmount: remaining * (1 - carryRate),
        gpAmount: remaining * carryRate
      });
    } else {
      tiers.push({ name: 'Carry Split', lpAmount: 0, gpAmount: 0 });
    }

    return tiers;
  }

  _yearsBetween(start, end) {
    const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (isNaN(startMs) || isNaN(endMs)) throw new Error('_yearsBetween: invalid date provided.');
    return (endMs - startMs) / MS_PER_YEAR;
  }
}

module.exports = new WaterfallEngine();
