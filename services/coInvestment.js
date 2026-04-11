/**
 * Co-Investment Management Service
 * Deal flow, LP allocation, SPV economics, fee terms,
 * co-invest reporting, side letter rights tracking.
 */

class CoInvestmentService {

  /**
   * Create a co-investment opportunity
   */
  createOpportunity({ deal, fund, eligibleLps, terms }) {
    const qualifyingLps = eligibleLps.filter(lp =>
      lp.coInvestRight &&
      (!lp.coInvestMinDealSize || deal.dealSize >= lp.coInvestMinDealSize)
    );

    const totalCoInvestCapacity = deal.coInvestAmount;
    const oversubscribed = qualifyingLps.reduce((s, lp) => s + (lp.coInvestMax || Infinity), 0) > totalCoInvestCapacity;

    return {
      opportunityId: `COINV-${Date.now()}`,
      dealName: deal.name,
      dealSize: deal.dealSize,
      fundAllocation: deal.fundAllocation,
      coInvestAmount: totalCoInvestCapacity,
      coInvestPctOfDeal: parseFloat(((totalCoInvestCapacity / deal.dealSize) * 100).toFixed(1)) + '%',
      terms: {
        managementFee: terms.managementFee || 0, // Usually 0%
        carriedInterest: terms.carriedInterest || 0, // Usually 0%
        preferredReturn: terms.preferredReturn || null,
        expenses: terms.expensePassthrough || 'Pro-rata share of deal expenses',
        lockup: terms.lockup || 'Co-terminus with main fund',
        governance: terms.governance || 'Fund GP has sole discretion'
      },
      eligibleLps: qualifyingLps.map(lp => ({
        investorId: lp.id,
        investorName: lp.name,
        coInvestRight: lp.coInvestRightSource, // SIDE_LETTER, LPA, DISCRETIONARY
        maxAllocation: lp.coInvestMax || 'No limit',
        indicatedInterest: null,
        status: 'INVITED'
      })),
      eligibleCount: qualifyingLps.length,
      oversubscribed,
      allocationMethod: oversubscribed ? 'PRO_RATA_BY_COMMITMENT' : 'FIRST_COME_FIRST_SERVED',
      timeline: {
        invitationDate: new Date().toISOString().split('T')[0],
        responseDeadline: this._addDays(new Date(), terms.responseDays || 5),
        expectedClosing: terms.expectedClosing
      },
      status: 'OPEN'
    };
  }

  /**
   * Allocate co-investment among interested LPs
   */
  allocateCoInvest({ opportunity, interestedLps, method = 'pro_rata' }) {
    const totalRequested = interestedLps.reduce((s, lp) => s + lp.requestedAmount, 0);
    const available = opportunity.coInvestAmount;
    const oversubscribed = totalRequested > available;

    let allocations;
    if (method === 'pro_rata' && oversubscribed) {
      const scaleFactor = available / totalRequested;
      allocations = interestedLps.map(lp => ({
        investorId: lp.id,
        investorName: lp.name,
        requested: lp.requestedAmount,
        allocated: parseFloat((lp.requestedAmount * scaleFactor).toFixed(2)),
        scaledDown: true,
        scaleFactor: parseFloat(scaleFactor.toFixed(4))
      }));
    } else if (method === 'commitment_weighted') {
      const totalCommitment = interestedLps.reduce((s, lp) => s + lp.fundCommitment, 0);
      allocations = interestedLps.map(lp => ({
        investorId: lp.id,
        investorName: lp.name,
        requested: lp.requestedAmount,
        allocated: parseFloat((available * (lp.fundCommitment / totalCommitment)).toFixed(2)),
        commitmentWeight: parseFloat(((lp.fundCommitment / totalCommitment) * 100).toFixed(2)) + '%'
      }));
    } else {
      allocations = interestedLps.map(lp => ({
        investorId: lp.id,
        investorName: lp.name,
        requested: lp.requestedAmount,
        allocated: Math.min(lp.requestedAmount, available),
        fullAllocation: true
      }));
    }

    const totalAllocated = allocations.reduce((s, a) => s + a.allocated, 0);

    return {
      opportunityId: opportunity.opportunityId,
      dealName: opportunity.dealName,
      totalCoInvestAmount: available,
      totalRequested,
      oversubscribed,
      allocationMethod: method,
      allocations,
      totalAllocated: parseFloat(totalAllocated.toFixed(2)),
      unallocated: parseFloat((available - totalAllocated).toFixed(2)),
      participantCount: allocations.filter(a => a.allocated > 0).length
    };
  }

  /**
   * Track co-invest SPV economics
   */
  trackSpvEconomics({ spvName, deal, investors, cashFlows }) {
    const totalInvested = investors.reduce((s, i) => s + i.invested, 0);
    const totalDistributed = cashFlows
      .filter(cf => cf.type === 'distribution')
      .reduce((s, cf) => s + cf.amount, 0);
    const currentValue = deal.currentValue || 0;

    const moic = (totalDistributed + currentValue) / totalInvested;
    const irr = this._simpleIrr(cashFlows, currentValue);

    return {
      spvName,
      dealName: deal.name,
      investmentDate: deal.investmentDate,
      status: deal.status, // ACTIVE, PARTIALLY_REALIZED, FULLY_REALIZED
      totalInvested,
      totalDistributed,
      currentValue,
      totalValue: totalDistributed + currentValue,
      moic: parseFloat(moic.toFixed(4)),
      irr: irr !== null ? parseFloat((irr * 100).toFixed(2)) + '%' : 'N/A',
      investors: investors.map(inv => ({
        name: inv.name,
        invested: inv.invested,
        pctOfSpv: parseFloat(((inv.invested / totalInvested) * 100).toFixed(2)) + '%',
        distributed: parseFloat((totalDistributed * (inv.invested / totalInvested)).toFixed(2)),
        currentValue: parseFloat((currentValue * (inv.invested / totalInvested)).toFixed(2)),
        moic: parseFloat(moic.toFixed(4)) // Same as fund MOIC since no fee/no carry
      })),
      feeTerms: {
        managementFee: '0%',
        carriedInterest: '0%',
        note: 'No fee / no carry co-investment'
      }
    };
  }

  /**
   * Co-invest program summary across all SPVs
   */
  programSummary(spvs) {
    const totalInvested = spvs.reduce((s, spv) => s + spv.totalInvested, 0);
    const totalValue = spvs.reduce((s, spv) => s + spv.totalValue, 0);
    const totalDistributed = spvs.reduce((s, spv) => s + spv.totalDistributed, 0);

    return {
      totalSpvs: spvs.length,
      activeSpvs: spvs.filter(s => s.status === 'ACTIVE').length,
      realizedSpvs: spvs.filter(s => s.status === 'FULLY_REALIZED').length,
      totalInvested,
      totalDistributed,
      totalCurrentValue: spvs.reduce((s, spv) => s + spv.currentValue, 0),
      totalValue,
      aggregateMoic: parseFloat((totalValue / totalInvested).toFixed(4)),
      uniqueCoInvestors: [...new Set(spvs.flatMap(s => s.investors?.map(i => i.name) || []))].length,
      spvDetails: spvs.map(s => ({
        name: s.spvName,
        deal: s.dealName,
        invested: s.totalInvested,
        moic: s.moic,
        status: s.status
      }))
    };
  }

  // --- Private ---

  _addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  _simpleIrr(cashFlows, currentValue) {
    if (cashFlows.length === 0) return null;
    const totalIn = cashFlows.filter(cf => cf.type === 'contribution').reduce((s, cf) => s + cf.amount, 0);
    const totalOut = cashFlows.filter(cf => cf.type === 'distribution').reduce((s, cf) => s + cf.amount, 0);
    if (totalIn === 0) return null;
    const years = (new Date() - new Date(cashFlows[0].date)) / (365.25 * 24 * 60 * 60 * 1000);
    if (years <= 0) return null;
    return Math.pow((totalOut + currentValue) / totalIn, 1 / years) - 1;
  }
}

module.exports = new CoInvestmentService();
