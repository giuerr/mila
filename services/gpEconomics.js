/**
 * GP Economics & Carry Allocation Service
 * Individual carry splits, vesting schedules, departure provisions,
 * carry escrow, GP commitment management, ManCo budgeting.
 */

class GpEconomicsService {

  /**
   * Allocate carried interest among GP partners
   */
  allocateCarry({ totalCarry, partners, vestingDate }) {
    const vestedPartners = partners.filter(p => this._isVested(p, vestingDate));
    const totalPoints = vestedPartners.reduce((s, p) => s + p.carryPoints, 0);

    return {
      totalCarry,
      allocationDate: vestingDate || new Date().toISOString().split('T')[0],
      totalCarryPoints: partners.reduce((s, p) => s + p.carryPoints, 0),
      vestedPoints: totalPoints,
      unvestedPoints: partners.reduce((s, p) => s + p.carryPoints, 0) - totalPoints,
      allocations: partners.map(p => {
        const vested = this._isVested(p, vestingDate);
        const vestedPct = this._vestedPercentage(p, vestingDate);
        const points = p.carryPoints;
        const effectivePoints = points * vestedPct;
        const allocation = totalPoints > 0 ? (effectivePoints / totalPoints) * totalCarry : 0;

        return {
          partnerId: p.id,
          partnerName: p.name,
          title: p.title,
          carryPoints: points,
          vestedPercentage: parseFloat((vestedPct * 100).toFixed(1)) + '%',
          effectivePoints: parseFloat(effectivePoints.toFixed(4)),
          pctOfPool: parseFloat(((effectivePoints / Math.max(totalPoints, 1)) * 100).toFixed(2)) + '%',
          grossAllocation: parseFloat(allocation.toFixed(2)),
          escrowHoldback: parseFloat((allocation * (p.escrowRate || 0.30)).toFixed(2)),
          netDistribution: parseFloat((allocation * (1 - (p.escrowRate || 0.30))).toFixed(2)),
          vestingSchedule: p.vestingSchedule,
          grantDate: p.grantDate,
          cliffDate: p.cliffDate,
          fullyVestedDate: p.fullyVestedDate,
          isActive: p.status === 'ACTIVE'
        };
      }),
      escrowSummary: {
        totalHeldInEscrow: parseFloat((partners.reduce((s, p) => {
          const vestedPct = this._vestedPercentage(p, vestingDate);
          const effectivePoints = p.carryPoints * vestedPct;
          const allocation = totalPoints > 0 ? (effectivePoints / totalPoints) * totalCarry : 0;
          return s + allocation * (p.escrowRate || 0.30);
        }, 0)).toFixed(2)),
        escrowPurpose: 'Held pending final fund liquidation to cover potential GP clawback'
      }
    };
  }

  /**
   * Model vesting schedules
   */
  modelVestingSchedule(partner) {
    const grantDate = new Date(partner.grantDate);
    const cliffMonths = partner.cliffMonths || 12;
    const vestingMonths = partner.vestingMonths || 48;
    const totalPoints = partner.carryPoints;

    const schedule = [];
    for (let month = 0; month <= vestingMonths; month++) {
      const date = new Date(grantDate);
      date.setMonth(date.getMonth() + month);

      let vestedPct;
      if (month < cliffMonths) {
        vestedPct = 0;
      } else if (month === cliffMonths) {
        vestedPct = cliffMonths / vestingMonths; // Cliff vest
      } else {
        vestedPct = month / vestingMonths;
      }
      vestedPct = Math.min(vestedPct, 1);

      if (month === 0 || month === cliffMonths || month === vestingMonths || month % 12 === 0) {
        schedule.push({
          month,
          date: date.toISOString().split('T')[0],
          vestedPct: parseFloat((vestedPct * 100).toFixed(2)) + '%',
          vestedPoints: parseFloat((totalPoints * vestedPct).toFixed(4)),
          unvestedPoints: parseFloat((totalPoints * (1 - vestedPct)).toFixed(4)),
          milestone: month === 0 ? 'Grant' : month === cliffMonths ? 'Cliff' : month === vestingMonths ? 'Fully Vested' : 'Anniversary'
        });
      }
    }

    return {
      partnerName: partner.name,
      totalPoints: totalPoints,
      cliffMonths,
      vestingMonths,
      grantDate: partner.grantDate,
      cliffDate: schedule.find(s => s.milestone === 'Cliff')?.date,
      fullyVestedDate: schedule.find(s => s.milestone === 'Fully Vested')?.date,
      schedule
    };
  }

  /**
   * Process partner departure
   */
  processDeparture({ partner, departureType, departureDate, fund }) {
    const vestedPct = this._vestedPercentage(partner, departureDate);
    const vestedPoints = partner.carryPoints * vestedPct;
    const forfeitedPoints = partner.carryPoints * (1 - vestedPct);

    const treatments = {
      GOOD_LEAVER: {
        vestedCarry: 'Retained — continues to receive distributions on vested carry',
        unvestedCarry: 'Forfeited — reallocated to remaining partners',
        gpCommitment: 'Remains invested — no forced redemption',
        nonCompete: '12-24 months typically',
        clawback: 'Remains subject to clawback obligations'
      },
      BAD_LEAVER: {
        vestedCarry: 'Forfeited or purchased at discount (typically 50-75% of value)',
        unvestedCarry: 'Forfeited immediately — reallocated to remaining partners',
        gpCommitment: 'May be subject to forced sale at discount',
        nonCompete: 'Extended non-compete (24-36 months)',
        clawback: 'Full clawback obligations remain'
      },
      RETIREMENT: {
        vestedCarry: 'Fully retained — continues to receive distributions',
        unvestedCarry: 'May accelerate vesting per retirement provisions',
        gpCommitment: 'Remains invested until fund liquidation',
        nonCompete: 'Reduced or waived',
        clawback: 'Remains subject to clawback obligations'
      },
      DEATH_DISABILITY: {
        vestedCarry: 'Transfers to estate/beneficiary — full retention',
        unvestedCarry: 'Typically accelerates to full vesting',
        gpCommitment: 'Remains invested — estate/beneficiary becomes passive partner',
        nonCompete: 'Waived',
        clawback: 'Estate remains subject to clawback'
      }
    };

    const treatment = treatments[departureType] || treatments.GOOD_LEAVER;

    // Reallocation of forfeited points
    const remainingPartners = fund.partners.filter(p => p.id !== partner.id && p.status === 'ACTIVE');
    const totalRemainingPoints = remainingPartners.reduce((s, p) => s + p.carryPoints, 0);

    return {
      partner: partner.name,
      departureType,
      departureDate,
      carryPoints: partner.carryPoints,
      vestedPercentage: parseFloat((vestedPct * 100).toFixed(1)) + '%',
      vestedPoints: parseFloat(vestedPoints.toFixed(4)),
      forfeitedPoints: parseFloat(forfeitedPoints.toFixed(4)),
      treatment,
      reallocation: forfeitedPoints > 0 ? remainingPartners.map(p => ({
        name: p.name,
        existingPoints: p.carryPoints,
        additionalPoints: parseFloat((forfeitedPoints * (p.carryPoints / totalRemainingPoints)).toFixed(4)),
        newTotalPoints: parseFloat((p.carryPoints + forfeitedPoints * (p.carryPoints / totalRemainingPoints)).toFixed(4))
      })) : [],
      keyPersonImplication: partner.isKeyPerson
        ? 'KEY PERSON EVENT — may trigger investment period suspension per LPA. LPAC notification required.'
        : 'Not a key person — no LPA trigger'
    };
  }

  /**
   * GP commitment management
   */
  trackGpCommitment({ fund, gpPartners }) {
    const totalFundCommitment = fund.totalCommitments;
    const gpCommitmentRequired = totalFundCommitment * (fund.gpCommitmentPct || 0.02); // Typically 1-5%

    const contributions = gpPartners.map(p => ({
      name: p.name,
      committedAmount: p.gpCommitAmount,
      paidIn: p.gpCommitPaidIn || 0,
      unfunded: p.gpCommitAmount - (p.gpCommitPaidIn || 0),
      source: p.gpCommitSource, // PERSONAL, MANAGEMENT_FEE_WAIVER, FIRM_BALANCE_SHEET
      feeWaiver: p.gpCommitSource === 'MANAGEMENT_FEE_WAIVER'
    }));

    const totalCommitted = contributions.reduce((s, c) => s + c.committedAmount, 0);
    const totalPaidIn = contributions.reduce((s, c) => s + c.paidIn, 0);

    return {
      fundName: fund.name,
      totalFundCommitments: totalFundCommitment,
      gpCommitmentPct: (fund.gpCommitmentPct || 0.02) * 100 + '%',
      gpCommitmentRequired: gpCommitmentRequired,
      gpCommitmentActual: totalCommitted,
      meetsRequirement: totalCommitted >= gpCommitmentRequired,
      totalPaidIn,
      totalUnfunded: totalCommitted - totalPaidIn,
      contributions,
      feeWaiverAmount: contributions.filter(c => c.feeWaiver).reduce((s, c) => s + c.committedAmount, 0),
      alignmentNote: totalCommitted / totalFundCommitment >= 0.02
        ? 'GP commitment meets market standard of 2%+ of fund size — strong alignment signal'
        : 'GP commitment below 2% market standard — may raise LP concerns'
    };
  }

  /**
   * Management company budget & P&L forecast
   */
  forecastManCoEconomics({ funds, managementCompany, forecastYears = 3 }) {
    const years = [];
    const currentYear = new Date().getFullYear();

    for (let i = 0; i < forecastYears; i++) {
      const year = currentYear + i;
      let totalMgmtFees = 0;

      for (const fund of funds) {
        const feeBase = fund.stage === 'investment_period'
          ? fund.totalCommitments
          : fund.investedCapital;
        const feeRate = fund.stage === 'investment_period'
          ? fund.mgmtFeeRate
          : fund.mgmtFeeRatePostInvestment || fund.mgmtFeeRate * 0.75;
        totalMgmtFees += feeBase * feeRate;
      }

      const revenue = {
        managementFees: totalMgmtFees,
        advisoryFees: managementCompany.advisoryFees || 0,
        transactionFees: managementCompany.transactionFees || 0
      };
      const totalRevenue = Object.values(revenue).reduce((s, v) => s + v, 0);

      const expenses = {
        compensation: totalRevenue * (managementCompany.compRatio || 0.55),
        rent: managementCompany.rent || 0,
        technology: managementCompany.techBudget || 0,
        travel: managementCompany.travelBudget || 0,
        professional: managementCompany.professionalFees || 0,
        insurance: managementCompany.insuranceCost || 0,
        other: managementCompany.otherExpenses || 0
      };
      const totalExpenses = Object.values(expenses).reduce((s, v) => s + v, 0);

      years.push({
        year,
        revenue,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        expenses,
        totalExpenses: parseFloat(totalExpenses.toFixed(2)),
        netIncome: parseFloat((totalRevenue - totalExpenses).toFixed(2)),
        margin: parseFloat(((totalRevenue - totalExpenses) / totalRevenue * 100).toFixed(1)) + '%',
        headcountBudget: managementCompany.headcount
      });
    }

    return {
      managementCompany: managementCompany.name,
      forecastYears,
      forecast: years,
      breakEvenAum: parseFloat((years[0].totalExpenses / (funds[0]?.mgmtFeeRate || 0.02)).toFixed(0))
    };
  }

  // ==================== CARRY SCENARIO ANALYSIS (v5.0) ====================

  /**
   * Model carry outcomes at multiple fund return scenarios
   */
  carryScenarioAnalysis({ fund, partners, scenarios }) {
    const targetIrrs = scenarios || [0, 0.05, 0.08, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40];
    const totalCommitment = fund.totalCommitments;
    const calledCapital = fund.calledCapital || totalCommitment;

    return targetIrrs.map(irr => {
      const years = fund.expectedLifeYears || 10;
      const fundTotalValue = calledCapital * Math.pow(1 + irr, years);
      const moic = parseFloat((fundTotalValue / calledCapital).toFixed(2));
      const totalProfit = Math.max(0, fundTotalValue - calledCapital);

      const prefReturnAmount = calledCapital * (Math.pow(1 + (fund.preferredReturn || 0.08), years) - 1);
      const profitAbovePref = Math.max(0, totalProfit - prefReturnAmount);
      const totalCarry = profitAbovePref * (fund.carryRate || 0.20);
      const escrow = totalCarry * (fund.escrowRate || 0.30);

      const partnerAllocations = this.allocateCarry({ totalCarry, partners, vestingDate: new Date().toISOString().split('T')[0] });

      return {
        targetIrr: (irr * 100) + '%',
        fundTotalValue: parseFloat(fundTotalValue.toFixed(0)),
        moic,
        totalProfit: parseFloat(totalProfit.toFixed(0)),
        prefReturnAmount: parseFloat(prefReturnAmount.toFixed(0)),
        profitAbovePref: parseFloat(profitAbovePref.toFixed(0)),
        totalCarry: parseFloat(totalCarry.toFixed(0)),
        escrowHoldback: parseFloat(escrow.toFixed(0)),
        netCarryDistributed: parseFloat((totalCarry - escrow).toFixed(0)),
        partnerBreakdown: partnerAllocations.allocations.map(a => ({
          name: a.partnerName,
          grossCarry: a.grossAllocation,
          escrow: a.escrowHoldback,
          net: a.netDistribution
        }))
      };
    });
  }

  /**
   * J-curve modeling — GP cash flow timeline
   */
  modelJCurve({ fund, deploymentSchedule, exitSchedule }) {
    const periods = [];
    const years = fund.expectedLifeYears || 10;
    let cumulativeCashFlow = 0;
    let cumulativeMgmtFees = 0;
    let cumulativeCarry = 0;

    for (let year = 0; year <= years; year++) {
      const deployment = (deploymentSchedule || []).find(d => d.year === year);
      const exits = (exitSchedule || []).filter(e => e.year === year);

      const gpCommitCall = year <= (fund.investmentPeriodYears || 5)
        ? (fund.gpCommitment || 0) * (1 / (fund.investmentPeriodYears || 5)) : 0;
      const mgmtFeeRevenue = fund.totalCommitments * (fund.mgmtFeeRate || 0.02);
      const exitProceeds = exits.reduce((s, e) => s + (e.proceeds || 0), 0);
      const carryFromExits = exits.reduce((s, e) => s + (e.carry || 0), 0);

      cumulativeCashFlow += -gpCommitCall + mgmtFeeRevenue + carryFromExits;
      cumulativeMgmtFees += mgmtFeeRevenue;
      cumulativeCarry += carryFromExits;

      periods.push({
        year,
        gpCommitmentCall: parseFloat(gpCommitCall.toFixed(0)),
        mgmtFeeRevenue: parseFloat(mgmtFeeRevenue.toFixed(0)),
        carryDistributed: parseFloat(carryFromExits.toFixed(0)),
        netCashFlow: parseFloat((-gpCommitCall + mgmtFeeRevenue + carryFromExits).toFixed(0)),
        cumulativeCashFlow: parseFloat(cumulativeCashFlow.toFixed(0)),
        cumulativeMgmtFees: parseFloat(cumulativeMgmtFees.toFixed(0)),
        cumulativeCarry: parseFloat(cumulativeCarry.toFixed(0)),
        phase: year <= (fund.investmentPeriodYears || 5) ? 'INVESTMENT' : 'HARVEST'
      });
    }

    const breakEvenYear = periods.find(p => p.cumulativeCashFlow > 0)?.year || null;

    return {
      fundName: fund.name,
      periods,
      breakEvenYear,
      totalMgmtFees: parseFloat(cumulativeMgmtFees.toFixed(0)),
      totalCarry: parseFloat(cumulativeCarry.toFixed(0)),
      totalGpCashFlow: parseFloat(cumulativeCashFlow.toFixed(0))
    };
  }

  /**
   * Clawback reserve analysis — is the escrow sufficient?
   */
  analyzeClawbackReserve({ fund, partners, currentEscrow, projectedFundValue }) {
    const calledCapital = fund.calledCapital || fund.totalCommitments;
    const totalDistributed = fund.totalDistributed || 0;
    const prefReturn = calledCapital * (fund.preferredReturn || 0.08) * (fund.yearsElapsed || 3);
    const lpEntitlement = calledCapital + prefReturn;
    const totalValue = projectedFundValue + totalDistributed;

    const maxLpReturn = totalValue * (1 - (fund.carryRate || 0.20));
    const potentialClawback = Math.max(0, lpEntitlement - maxLpReturn);

    return {
      currentEscrow,
      potentialClawback: parseFloat(potentialClawback.toFixed(0)),
      escrowSufficient: currentEscrow >= potentialClawback,
      shortfall: parseFloat(Math.max(0, potentialClawback - currentEscrow).toFixed(0)),
      escrowCoverageRatio: potentialClawback > 0 ? parseFloat((currentEscrow / potentialClawback).toFixed(2)) + 'x' : 'N/A (no clawback exposure)',
      carryDistributedToDate: fund.carryDistributedToDate || 0,
      analysis: potentialClawback > 0
        ? `Potential clawback of $${potentialClawback.toLocaleString()} identified. Escrow holds $${currentEscrow.toLocaleString()} (${((currentEscrow / potentialClawback) * 100).toFixed(0)}% coverage).`
        : 'No clawback exposure — fund is performing above preferred return threshold.',
      partnerExposure: partners.map(p => {
        const pShare = (p.carryPoints || 0) / partners.reduce((s, pp) => s + (pp.carryPoints || 0), 1);
        return {
          name: p.name,
          personalClawbackExposure: parseFloat((potentialClawback * pShare).toFixed(0)),
          escrowHeld: parseFloat((currentEscrow * pShare).toFixed(0))
        };
      })
    };
  }

  /**
   * GP commitment return modeling — how GP capital performs
   */
  gpCommitReturnAnalysis({ fund, gpCommitment, gpCallSchedule, gpDistSchedule }) {
    const calls = gpCallSchedule || [];
    const dists = gpDistSchedule || [];
    const totalCalled = calls.reduce((s, c) => s + c.amount, 0);
    const totalDistributed = dists.reduce((s, d) => s + d.amount, 0);
    const currentNav = fund.gpNav || 0;

    const tvpi = totalCalled > 0 ? parseFloat(((totalDistributed + currentNav) / totalCalled).toFixed(4)) : 0;
    const dpi = totalCalled > 0 ? parseFloat((totalDistributed / totalCalled).toFixed(4)) : 0;

    return {
      gpCommitment,
      totalCalled,
      totalDistributed,
      currentNav,
      totalValue: totalDistributed + currentNav,
      tvpi,
      dpi,
      rvpi: parseFloat(((currentNav) / totalCalled).toFixed(4)),
      netMultiple: tvpi,
      feeWaiverAmount: fund.gpFeeWaiver || 0,
      feeWaiverNote: fund.gpFeeWaiver ? 'GP commitment partially funded via management fee waiver — tax implications may differ' : null,
      comparison: {
        fundTvpi: fund.tvpi || null,
        gpVsFund: fund.tvpi ? parseFloat((tvpi - fund.tvpi).toFixed(4)) : null,
        note: 'GP commitment follows same economics as LPs (pro-rata of fund returns)'
      }
    };
  }

  // --- Private ---

  _isVested(partner, date) {
    return this._vestedPercentage(partner, date) > 0;
  }

  _vestedPercentage(partner, date) {
    if (!partner.grantDate || !partner.vestingMonths) return 1; // No vesting = fully vested
    const grantDate = new Date(partner.grantDate);
    const checkDate = new Date(date || new Date());
    const monthsElapsed = (checkDate.getFullYear() - grantDate.getFullYear()) * 12 + (checkDate.getMonth() - grantDate.getMonth());

    if (monthsElapsed < (partner.cliffMonths || 12)) return 0;
    return Math.min(1, monthsElapsed / partner.vestingMonths);
  }
}

module.exports = new GpEconomicsService();
