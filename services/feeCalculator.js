/**
 * Fee Calculator Service
 * Management fees, performance fees, hurdle rates, high water marks,
 * crystallization, catch-up, clawback, fee offsets.
 */

class FeeCalculatorService {

  // ==================== MANAGEMENT FEES ====================

  /**
   * Calculate management fees for a period
   */
  calculateManagementFee({ feeBase, feeRate, periodStart, periodEnd, fundStage, stepDownRate, investmentPeriodEnd, lpOverrides = [] }) {
    const days = this._daysBetween(periodStart, periodEnd);
    const daysInYear = 365;
    const effectiveRate = fundStage === 'post_investment' && stepDownRate
      ? stepDownRate
      : feeRate;

    // Base fee calculation
    const baseFee = feeBase * effectiveRate * (days / daysInYear);

    // LP-specific overrides (side letter discounts)
    const lpFees = lpOverrides.map(lp => {
      const lpRate = lp.discountedRate || effectiveRate;
      const lpFee = lp.commitment * lpRate * (days / daysInYear);
      const discount = (effectiveRate - lpRate) * lp.commitment * (days / daysInYear);
      return {
        lpId: lp.id,
        lpName: lp.name,
        commitment: lp.commitment,
        standardRate: effectiveRate,
        appliedRate: lpRate,
        fee: parseFloat(lpFee.toFixed(2)),
        discount: parseFloat(discount.toFixed(2)),
        sideLetterRef: lp.sideLetterRef
      };
    });

    return {
      period: { start: periodStart, end: periodEnd, days },
      feeBase,
      fundStage,
      standardRate: effectiveRate,
      grossFee: parseFloat(baseFee.toFixed(2)),
      lpFees,
      totalDiscounts: lpFees.reduce((sum, lp) => sum + lp.discount, 0),
      netFee: parseFloat((baseFee - lpFees.reduce((sum, lp) => sum + lp.discount, 0)).toFixed(2))
    };
  }

  /**
   * Calculate management fee with offsets (transaction fees, monitoring fees, etc.)
   */
  calculateFeeWithOffsets({ grossManagementFee, offsets, offsetPercentage = 0.80 }) {
    const totalOffsets = offsets.reduce((sum, o) => sum + o.amount, 0);
    const applicableOffset = totalOffsets * offsetPercentage;
    const netFee = Math.max(0, grossManagementFee - applicableOffset);

    return {
      grossManagementFee,
      offsets: offsets.map(o => ({ ...o, applicableAmount: o.amount * offsetPercentage })),
      totalOffsets,
      offsetPercentage: (offsetPercentage * 100) + '%',
      applicableOffset: parseFloat(applicableOffset.toFixed(2)),
      netManagementFee: parseFloat(netFee.toFixed(2)),
      offsetExcess: Math.max(0, applicableOffset - grossManagementFee) // Carry forward
    };
  }

  // ==================== PERFORMANCE FEES ====================

  /**
   * Calculate performance fee with high water mark (hedge fund style)
   */
  calculatePerformanceFee({ currentNav, previousHwm, sharesOutstanding, perfFeeRate, crystallizationFreq = 'annual' }) {
    const navPerShare = currentNav / sharesOutstanding;
    const gain = Math.max(0, navPerShare - previousHwm);
    const performanceFee = gain * sharesOutstanding * perfFeeRate;
    const newHwm = Math.max(previousHwm, navPerShare);

    return {
      currentNav,
      navPerShare: parseFloat(navPerShare.toFixed(6)),
      previousHwm: parseFloat(previousHwm.toFixed(6)),
      newHwm: parseFloat(newHwm.toFixed(6)),
      gainPerShare: parseFloat(gain.toFixed(6)),
      sharesOutstanding,
      perfFeeRate,
      crystallizationFreq,
      performanceFee: parseFloat(performanceFee.toFixed(2)),
      investorNetGain: parseFloat((gain * sharesOutstanding - performanceFee).toFixed(2))
    };
  }

  /**
   * Calculate performance fee per series (multi-series equalization)
   */
  calculateMultiSeriesPerformanceFee(series) {
    const results = series.map(s => {
      const gain = Math.max(0, s.currentNavPerShare - s.hwm);
      const fee = gain * s.shares * s.perfFeeRate;
      return {
        seriesId: s.id,
        seriesName: s.name,
        closingDate: s.closingDate,
        shares: s.shares,
        currentNavPerShare: s.currentNavPerShare,
        hwm: s.hwm,
        gainPerShare: parseFloat(gain.toFixed(6)),
        performanceFee: parseFloat(fee.toFixed(2)),
        newHwm: Math.max(s.hwm, s.currentNavPerShare)
      };
    });

    return {
      series: results,
      totalPerformanceFee: results.reduce((sum, r) => sum + r.performanceFee, 0),
      seriesCount: results.length
    };
  }

  // ==================== CARRIED INTEREST ====================

  /**
   * Calculate carried interest (PE-style with preferred return and catch-up)
   */
  calculateCarriedInterest({
    totalContributed, totalDistributed, unrealizedNav,
    preferredReturn = 0.08, carryRate = 0.20, catchUpRate = 1.0,
    compounding = 'annual', gpCommit = 0, gpCarryWaiver = false,
    tieredCarry = null // [{ threshold: 2.0, rate: 0.20 }, { threshold: 3.0, rate: 0.25 }]
  }) {
    const totalValue = totalDistributed + unrealizedNav;
    const totalProfit = totalValue - totalContributed;
    const moic = totalContributed > 0 ? totalValue / totalContributed : 0;

    // Calculate preferred return amount
    const prefReturnAmount = totalContributed * preferredReturn; // Simplified — should be time-weighted

    // Waterfall tiers
    const tiers = [];

    // Tier 1: Return of capital
    const tier1 = Math.min(totalValue, totalContributed);
    tiers.push({ name: 'Return of Capital', lpAmount: tier1, gpAmount: 0 });
    let remaining = totalValue - tier1;

    // Tier 2: Preferred return
    const tier2Lp = Math.min(remaining, prefReturnAmount);
    tiers.push({ name: 'Preferred Return', lpAmount: tier2Lp, gpAmount: 0 });
    remaining -= tier2Lp;

    // Tier 3: GP catch-up
    let catchUpAmount = 0;
    if (remaining > 0 && tier2Lp >= prefReturnAmount) {
      const targetGpShare = (tier1 + tier2Lp) * carryRate / (1 - carryRate);
      catchUpAmount = Math.min(remaining, targetGpShare);
      const gpCatchUp = catchUpAmount * catchUpRate;
      const lpCatchUp = catchUpAmount - gpCatchUp;
      tiers.push({ name: 'GP Catch-Up', lpAmount: lpCatchUp, gpAmount: gpCatchUp });
      remaining -= catchUpAmount;
    }

    // Tier 4: Carried interest split (or tiered carry)
    let gpCarry = 0;
    let lpShare = 0;
    if (remaining > 0) {
      if (tieredCarry) {
        // Tiered carry based on MOIC thresholds
        let prevThreshold = 1.0;
        for (const tier of tieredCarry) {
          const tierProfit = Math.max(0, Math.min(remaining, (tier.threshold - prevThreshold) * totalContributed));
          gpCarry += tierProfit * tier.rate;
          lpShare += tierProfit * (1 - tier.rate);
          remaining -= tierProfit;
          prevThreshold = tier.threshold;
        }
        // Remaining at highest tier rate
        if (remaining > 0) {
          const lastRate = tieredCarry[tieredCarry.length - 1].rate;
          gpCarry += remaining * lastRate;
          lpShare += remaining * (1 - lastRate);
        }
      } else {
        gpCarry = remaining * carryRate;
        lpShare = remaining * (1 - carryRate);
      }
      tiers.push({ name: 'Carry Split', lpAmount: lpShare, gpAmount: gpCarry });
    }

    const totalGp = tiers.reduce((sum, t) => sum + t.gpAmount, 0);
    const totalLp = tiers.reduce((sum, t) => sum + t.lpAmount, 0);

    return {
      totalContributed,
      totalDistributed,
      unrealizedNav,
      totalValue,
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      moic: parseFloat(moic.toFixed(4)),
      preferredReturn: (preferredReturn * 100) + '%',
      preferredReturnMet: tier2Lp >= prefReturnAmount,
      carryRate: (carryRate * 100) + '%',
      tiers,
      totalGpCarry: parseFloat(totalGp.toFixed(2)),
      totalLpProceeds: parseFloat(totalLp.toFixed(2)),
      netCarryRate: totalProfit > 0 ? parseFloat((totalGp / totalProfit * 100).toFixed(2)) + '%' : '0%'
    };
  }

  /**
   * Calculate clawback obligation
   */
  calculateClawback({ cumulativeCarryDistributed, currentCarryEntitlement, escrowBalance }) {
    const clawbackAmount = Math.max(0, cumulativeCarryDistributed - currentCarryEntitlement);
    const escrowCoverage = escrowBalance / Math.max(clawbackAmount, 1);

    return {
      cumulativeCarryDistributed,
      currentCarryEntitlement: parseFloat(currentCarryEntitlement.toFixed(2)),
      clawbackAmount: parseFloat(clawbackAmount.toFixed(2)),
      clawbackExists: clawbackAmount > 0,
      escrowBalance,
      escrowCoverage: parseFloat((escrowCoverage * 100).toFixed(2)) + '%',
      escrowAdequate: escrowBalance >= clawbackAmount * 0.30, // Typically 30% escrow
      additionalEscrowNeeded: Math.max(0, clawbackAmount * 0.30 - escrowBalance)
    };
  }

  // ==================== ORGANIZATIONAL EXPENSES ====================

  /**
   * Track organizational expenses against LPA cap
   */
  trackOrgExpenses({ expenses, lpaCap, amortizationPeriod = 60 }) {
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const overCap = Math.max(0, totalExpenses - lpaCap);
    const monthlyAmortization = Math.min(totalExpenses, lpaCap) / amortizationPeriod;

    return {
      expenses: expenses.map(e => ({ ...e })),
      totalExpenses: parseFloat(totalExpenses.toFixed(2)),
      lpaCap,
      withinCap: totalExpenses <= lpaCap,
      overCapAmount: parseFloat(overCap.toFixed(2)),
      gpBorneAmount: parseFloat(overCap.toFixed(2)),
      lpBorneAmount: parseFloat(Math.min(totalExpenses, lpaCap).toFixed(2)),
      monthlyAmortization: parseFloat(monthlyAmortization.toFixed(2)),
      amortizationPeriod: amortizationPeriod + ' months',
      byCategory: this._groupByCategory(expenses)
    };
  }

  // ==================== HELPERS ====================

  _daysBetween(start, end) {
    const s = new Date(start);
    const e = new Date(end);
    return Math.ceil((e - s) / (1000 * 60 * 60 * 24));
  }

  _groupByCategory(expenses) {
    const groups = {};
    for (const e of expenses) {
      if (!groups[e.category]) groups[e.category] = 0;
      groups[e.category] += e.amount;
    }
    return groups;
  }
}

module.exports = new FeeCalculatorService();
