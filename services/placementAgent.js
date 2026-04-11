/**
 * Placement Agent Fee Tracker
 * Trailing fees, fee schedules by LP vintage, offset calculations,
 * regulatory disclosure, placement agent compliance.
 */

class PlacementAgentService {

  /**
   * Track placement agent fees across fund lifecycle
   */
  trackFees({ placementAgents, lpIntroductions, fund }) {
    const agentSummaries = placementAgents.map(agent => {
      const introductions = lpIntroductions.filter(lp => lp.placementAgentId === agent.id);
      const totalRaised = introductions.reduce((s, lp) => s + lp.commitment, 0);

      // Calculate trailing fees
      const fees = introductions.map(lp => {
        const schedule = this._getFeeSchedule(agent, lp);
        const periodicFees = this._calculatePeriodicFees(schedule, lp, fund);

        return {
          investorName: lp.name,
          commitment: lp.commitment,
          closingDate: lp.closingDate,
          feeSchedule: schedule,
          periodicFees,
          totalFeesPaid: periodicFees.reduce((s, f) => s + f.paidAmount, 0),
          totalFeesRemaining: periodicFees.reduce((s, f) => s + f.remainingAmount, 0)
        };
      });

      const totalFees = fees.reduce((s, f) => s + f.totalFeesPaid + f.totalFeesRemaining, 0);

      return {
        agentId: agent.id,
        agentName: agent.name,
        contractDate: agent.contractDate,
        territory: agent.territory,
        introductionCount: introductions.length,
        totalCapitalRaised: totalRaised,
        effectiveFeeRate: totalRaised > 0
          ? parseFloat(((totalFees / totalRaised) * 100).toFixed(3)) + '%'
          : '0%',
        feesByInvestor: fees,
        totalFeesPaid: fees.reduce((s, f) => s + f.totalFeesPaid, 0),
        totalFeesRemaining: fees.reduce((s, f) => s + f.totalFeesRemaining, 0),
        totalFees: parseFloat(totalFees.toFixed(2))
      };
    });

    return {
      fundName: fund.name,
      agents: agentSummaries,
      totalPlacementFees: agentSummaries.reduce((s, a) => s + a.totalFees, 0),
      totalPaid: agentSummaries.reduce((s, a) => s + a.totalFeesPaid, 0),
      totalRemaining: agentSummaries.reduce((s, a) => s + a.totalFeesRemaining, 0),
      feeAsPercentOfFund: fund.totalCommitments > 0
        ? parseFloat(((agentSummaries.reduce((s, a) => s + a.totalFees, 0) / fund.totalCommitments) * 100).toFixed(3)) + '%'
        : '0%'
    };
  }

  /**
   * Calculate management fee offset from placement agent fees
   */
  calculateOffset({ placementFees, mgmtFeeOffsetPct = 1.0, reportingPeriod }) {
    const periodFees = placementFees.filter(f =>
      f.period === reportingPeriod || (f.startDate <= reportingPeriod && f.endDate >= reportingPeriod)
    );
    const totalPeriodFees = periodFees.reduce((s, f) => s + f.amount, 0);
    const offsetAmount = totalPeriodFees * mgmtFeeOffsetPct;

    return {
      reportingPeriod,
      placementFeesInPeriod: parseFloat(totalPeriodFees.toFixed(2)),
      offsetPercentage: (mgmtFeeOffsetPct * 100) + '%',
      offsetAmount: parseFloat(offsetAmount.toFixed(2)),
      periodFees,
      note: mgmtFeeOffsetPct >= 1.0
        ? 'Full offset — 100% of placement fees offset against management fees'
        : `Partial offset — ${(mgmtFeeOffsetPct * 100)}% of placement fees offset against management fees`
    };
  }

  /**
   * Generate regulatory disclosure for placement agents
   */
  generateDisclosure(agent) {
    return {
      agentName: agent.name,
      registrationStatus: {
        secRegistered: agent.secRegistered,
        finraRegistered: agent.finraMember,
        fcaRegistered: agent.fcaRegistered,
        registrationNumbers: agent.registrationNumbers || []
      },
      disclosure: {
        formAdv: 'Placement agent fees are disclosed in Part 2A of Form ADV, Item 14',
        ppm: 'Placement agent arrangement is disclosed in the Private Placement Memorandum',
        lpNotice: 'LPs introduced by placement agents are notified of the arrangement at subscription',
        feeArrangement: {
          type: agent.feeType, // UPFRONT, TRAILING, HYBRID
          upfrontRate: agent.upfrontRate,
          trailingRate: agent.trailingRate,
          trailingDuration: agent.trailingYears + ' years',
          feeBase: agent.feeBase, // COMMITMENT, CALLED_CAPITAL
          offsetProvision: agent.offsetProvision
        }
      },
      complianceChecklist: [
        { item: 'Placement agent agreement executed', status: agent.agreementSigned ? 'COMPLETE' : 'PENDING' },
        { item: 'FINRA/SEC registration verified', status: agent.registrationVerified ? 'COMPLETE' : 'PENDING' },
        { item: 'Anti-corruption / pay-to-play compliance', status: agent.payToPlayCompliant ? 'COMPLETE' : 'PENDING' },
        { item: 'Disclosed in Form ADV', status: agent.advDisclosed ? 'COMPLETE' : 'PENDING' },
        { item: 'Disclosed in PPM', status: agent.ppmDisclosed ? 'COMPLETE' : 'PENDING' },
        { item: 'LP notification provided', status: agent.lpNotified ? 'COMPLETE' : 'PENDING' },
        { item: 'Background check completed', status: agent.backgroundCheck ? 'COMPLETE' : 'PENDING' }
      ],
      payToPlayRisk: agent.governmentalLpIntroductions > 0
        ? 'ELEVATED — Placement agent introduced governmental plan investors. Verify compliance with SEC Rule 206(4)-5 and state/local pay-to-play rules.'
        : 'LOW — No governmental plan investors introduced'
    };
  }

  // --- Private ---

  _getFeeSchedule(agent, lp) {
    if (agent.feeType === 'UPFRONT') {
      return {
        type: 'UPFRONT',
        rate: agent.upfrontRate,
        amount: lp.commitment * agent.upfrontRate,
        dueDate: lp.closingDate
      };
    }
    if (agent.feeType === 'TRAILING') {
      return {
        type: 'TRAILING',
        rate: agent.trailingRate,
        years: agent.trailingYears || 4,
        frequency: 'QUARTERLY',
        base: agent.feeBase || 'COMMITMENT'
      };
    }
    // HYBRID
    return {
      type: 'HYBRID',
      upfrontRate: agent.upfrontRate,
      upfrontAmount: lp.commitment * (agent.upfrontRate || 0),
      trailingRate: agent.trailingRate,
      trailingYears: agent.trailingYears || 4,
      base: agent.feeBase || 'COMMITMENT'
    };
  }

  _calculatePeriodicFees(schedule, lp, fund) {
    const fees = [];
    if (schedule.type === 'UPFRONT' || schedule.type === 'HYBRID') {
      fees.push({
        period: lp.closingDate,
        type: 'UPFRONT',
        amount: schedule.upfrontAmount || schedule.amount,
        paidAmount: schedule.upfrontAmount || schedule.amount,
        remainingAmount: 0,
        status: 'PAID'
      });
    }
    if (schedule.type === 'TRAILING' || schedule.type === 'HYBRID') {
      const rate = schedule.trailingRate || schedule.rate;
      const years = schedule.trailingYears || schedule.years || 4;
      const base = schedule.base === 'CALLED_CAPITAL' ? lp.calledCapital || lp.commitment : lp.commitment;
      const quarterlyFee = (base * rate) / 4;

      for (let q = 0; q < years * 4; q++) {
        const date = new Date(lp.closingDate);
        date.setMonth(date.getMonth() + (q + 1) * 3);
        const isPaid = date < new Date();

        fees.push({
          period: date.toISOString().split('T')[0],
          type: 'TRAILING',
          amount: parseFloat(quarterlyFee.toFixed(2)),
          paidAmount: isPaid ? parseFloat(quarterlyFee.toFixed(2)) : 0,
          remainingAmount: isPaid ? 0 : parseFloat(quarterlyFee.toFixed(2)),
          status: isPaid ? 'PAID' : 'SCHEDULED'
        });
      }
    }
    return fees;
  }
}

module.exports = new PlacementAgentService();
