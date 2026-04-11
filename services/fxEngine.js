/**
 * Multi-Currency / FX Engine
 * Exposure identification, hedging strategy, hedge accounting,
 * LP-level currency hedging, FX transaction optimization.
 */

class FxEngineService {

  /**
   * Calculate net FX exposure across the fund
   */
  calculateExposure({ positions, hedges, baseCurrency = 'USD' }) {
    const exposureByFx = {};

    // Long positions
    for (const pos of positions) {
      if (pos.currency === baseCurrency) continue;
      if (!exposureByFx[pos.currency]) {
        exposureByFx[pos.currency] = { gross: 0, hedged: 0, net: 0 };
      }
      exposureByFx[pos.currency].gross += pos.valueInLocalCurrency;
    }

    // Hedges
    for (const hedge of hedges) {
      if (exposureByFx[hedge.currency]) {
        exposureByFx[hedge.currency].hedged += hedge.notional;
      }
    }

    // Net exposure
    for (const [ccy, exp] of Object.entries(exposureByFx)) {
      exp.net = exp.gross - exp.hedged;
      exp.hedgeRatio = exp.gross > 0
        ? parseFloat(((exp.hedged / exp.gross) * 100).toFixed(2)) + '%'
        : '0%';
    }

    const totalGross = Object.values(exposureByFx).reduce((sum, e) => sum + e.gross, 0);
    const totalHedged = Object.values(exposureByFx).reduce((sum, e) => sum + e.hedged, 0);

    return {
      baseCurrency,
      exposureByCurrency: exposureByFx,
      totalGrossExposure: parseFloat(totalGross.toFixed(2)),
      totalHedged: parseFloat(totalHedged.toFixed(2)),
      totalNetExposure: parseFloat((totalGross - totalHedged).toFixed(2)),
      overallHedgeRatio: parseFloat(((totalHedged / totalGross) * 100).toFixed(2)) + '%'
    };
  }

  /**
   * Calculate translation gain/loss for the period
   */
  calculateTranslationGainLoss({ foreignAssets, beginningRates, endingRates }) {
    const results = [];
    let totalGainLoss = 0;

    for (const asset of foreignAssets) {
      const beginRate = beginningRates[asset.currency];
      const endRate = endingRates[asset.currency];
      const rateChange = endRate - beginRate;
      const gainLoss = asset.localCurrencyValue * rateChange;

      results.push({
        assetName: asset.name,
        currency: asset.currency,
        localValue: asset.localCurrencyValue,
        beginningRate: beginRate,
        endingRate: endRate,
        rateChange: parseFloat(rateChange.toFixed(6)),
        translationGainLoss: parseFloat(gainLoss.toFixed(2))
      });
      totalGainLoss += gainLoss;
    }

    return {
      period: { beginningRates, endingRates },
      assets: results,
      totalTranslationGainLoss: parseFloat(totalGainLoss.toFixed(2))
    };
  }

  /**
   * Hedge effectiveness testing (ASC 815)
   */
  testHedgeEffectiveness({ hedgeValueChange, hedgedItemValueChange }) {
    const ratio = hedgedItemValueChange !== 0
      ? Math.abs(hedgeValueChange / hedgedItemValueChange)
      : 0;

    return {
      hedgeValueChange,
      hedgedItemValueChange,
      effectivenessRatio: parseFloat(ratio.toFixed(4)),
      effective: ratio >= 0.80 && ratio <= 1.25,
      qualifiesForHedgeAccounting: ratio >= 0.80 && ratio <= 1.25,
      ineffectiveness: parseFloat(Math.abs(hedgeValueChange + hedgedItemValueChange).toFixed(2)),
      note: ratio < 0.80 || ratio > 1.25
        ? 'HEDGE INEFFECTIVE — must discontinue hedge accounting and recognize gains/losses in P&L'
        : 'Hedge is effective — qualifies for hedge accounting treatment'
    };
  }

  /**
   * Calculate hedging cost for forward contracts
   */
  calculateHedgingCost({ notional, spotRate, forwardRate, tenorDays }) {
    const forwardPoints = forwardRate - spotRate;
    const annualizedCost = (forwardPoints / spotRate) * (365 / tenorDays);
    const periodCost = notional * Math.abs(forwardPoints);

    return {
      notional,
      spotRate,
      forwardRate,
      forwardPoints: parseFloat(forwardPoints.toFixed(6)),
      tenorDays,
      periodCost: parseFloat(periodCost.toFixed(2)),
      annualizedCostPct: parseFloat((annualizedCost * 100).toFixed(4)) + '%',
      recommendation: Math.abs(annualizedCost) > 0.03
        ? 'Hedging cost >3% annualized — consider options or partial hedge'
        : 'Hedging cost reasonable'
    };
  }

  /**
   * LP-level currency hedged share class
   */
  calculateHedgedShareClass({ fundNav, shareCurrency, baseCurrency, spotRate, hedgeCost, shares }) {
    const baseNavPerShare = fundNav / shares;
    const localNavPerShare = baseNavPerShare * spotRate;
    const hedgedNavPerShare = localNavPerShare - (hedgeCost / shares);

    return {
      shareClass: `${shareCurrency}-Hedged`,
      baseCurrency,
      shareCurrency,
      spotRate,
      baseNavPerShare: parseFloat(baseNavPerShare.toFixed(6)),
      localNavPerShare: parseFloat(localNavPerShare.toFixed(6)),
      hedgedNavPerShare: parseFloat(hedgedNavPerShare.toFixed(6)),
      hedgeCostPerShare: parseFloat((hedgeCost / shares).toFixed(6)),
      hedgeCostPct: parseFloat(((hedgeCost / fundNav) * 100).toFixed(4)) + '%'
    };
  }
}

module.exports = new FxEngineService();
