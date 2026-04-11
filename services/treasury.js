/**
 * Treasury & Cash Management Service
 * Daily cash positions, sweep optimization, credit facility management,
 * counterparty risk, liquidity buffers.
 */

const accounting = require('../connectors/accounting');

class TreasuryService {

  /**
   * Get consolidated cash position across all accounts
   */
  async getConsolidatedCashPosition(accounts, accountingSystem = 'netsuite') {
    const acc = accounting[accountingSystem];
    const positions = [];
    let totalCash = 0;

    for (const account of accounts) {
      const balance = acc.suiteql
        ? await acc.suiteql(`
            SELECT a.acctnumber, a.acctname, a.currency, SUM(tal.amount) as balance
            FROM transactionaccountingline tal
            JOIN account a ON tal.account = a.id
            WHERE a.id = ${account.id} AND a.accttype = 'Bank'
            GROUP BY a.acctnumber, a.acctname, a.currency
          `)
        : await acc.getBankTransactions();

      positions.push({
        accountId: account.id,
        accountName: account.name,
        currency: account.currency,
        balance: balance,
        custodian: account.custodian
      });
      totalCash += typeof balance === 'number' ? balance : 0;
    }

    return {
      totalCash,
      positions,
      asOf: new Date().toISOString()
    };
  }

  /**
   * Credit facility tracker
   */
  trackCreditFacility(facility) {
    const utilizationRatio = facility.outstandingDraws / facility.totalSize;
    const availableCapacity = facility.totalSize - facility.outstandingDraws;
    const dailyInterest = (facility.outstandingDraws * (facility.sofrRate + facility.spread)) / 365;

    const covenantStatus = {};
    for (const [covenant, { limit, current }] of Object.entries(facility.covenants || {})) {
      covenantStatus[covenant] = {
        limit,
        current,
        compliant: current <= limit,
        headroom: limit - current
      };
    }

    return {
      facilityName: facility.name,
      totalSize: facility.totalSize,
      outstandingDraws: facility.outstandingDraws,
      availableCapacity,
      utilizationRatio: (utilizationRatio * 100).toFixed(2) + '%',
      dailyInterestAccrual: dailyInterest.toFixed(2),
      annualizedCost: (dailyInterest * 365).toFixed(2),
      maturityDate: facility.maturityDate,
      covenantStatus,
      allCovenantsCompliant: Object.values(covenantStatus).every(c => c.compliant)
    };
  }

  /**
   * Sweep optimization — calculate optimal cash allocation
   */
  calculateSweepOptimization(cashBalance, sweepOptions) {
    // Sort by yield descending
    const sorted = [...sweepOptions].sort((a, b) => b.yield - a.yield);
    let remaining = cashBalance;
    const allocations = [];

    // Reserve operating minimum
    const operatingReserve = cashBalance * 0.05; // 5% minimum operating cash
    remaining -= operatingReserve;

    for (const option of sorted) {
      if (remaining <= 0) break;
      const allocation = Math.min(remaining, option.maxCapacity || Infinity);
      allocations.push({
        vehicle: option.name,
        type: option.type, // money_market, tbill, reverse_repo
        amount: allocation,
        yield: option.yield,
        expectedDailyIncome: (allocation * option.yield / 365).toFixed(2),
        liquidity: option.liquidity, // T+0, T+1, T+2
        counterparty: option.counterparty
      });
      remaining -= allocation;
    }

    const totalYield = allocations.reduce((sum, a) => sum + (a.amount * a.yield), 0) / cashBalance;

    return {
      totalCash: cashBalance,
      operatingReserve,
      allocations,
      weightedAverageYield: (totalYield * 100).toFixed(4) + '%',
      expectedAnnualIncome: allocations.reduce((sum, a) => sum + parseFloat(a.expectedDailyIncome) * 365, 0).toFixed(2)
    };
  }

  /**
   * Counterparty risk monitoring
   */
  assessCounterpartyRisk(counterparties) {
    return counterparties.map(cp => {
      const riskScore = this._calculateRiskScore(cp);
      return {
        name: cp.name,
        totalExposure: cp.exposure,
        exposurePctOfNav: ((cp.exposure / cp.fundNav) * 100).toFixed(2) + '%',
        creditRating: cp.creditRating,
        cdsSpread: cp.cdsSpread,
        riskScore,
        riskLevel: riskScore > 7 ? 'HIGH' : riskScore > 4 ? 'MEDIUM' : 'LOW',
        diversificationNote: cp.exposure / cp.fundNav > 0.25
          ? 'CONCENTRATION WARNING: >25% of NAV with single counterparty'
          : null
      };
    });
  }

  /**
   * Liquidity buffer calculator
   */
  calculateLiquidityBuffer(fundData) {
    const unfundedCommitments = fundData.totalCommitments - fundData.calledCapital;
    const pendingDistributions = fundData.pendingDistributions || 0;
    const operatingExpenses = fundData.quarterlyOpex || 0;
    const clawbackReserve = fundData.gpClawbackObligation || 0;

    const requiredBuffer = unfundedCommitments * 0.03 // 3% of unfunded
      + pendingDistributions
      + operatingExpenses * 4 // 4 quarters reserve
      + clawbackReserve;

    return {
      components: {
        unfundedReserve: unfundedCommitments * 0.03,
        pendingDistributions,
        operatingReserve: operatingExpenses * 4,
        clawbackReserve
      },
      requiredBuffer,
      currentCash: fundData.cashBalance,
      surplus: fundData.cashBalance - requiredBuffer,
      adequate: fundData.cashBalance >= requiredBuffer,
      daysOfCashOnHand: Math.floor(fundData.cashBalance / (operatingExpenses / 90))
    };
  }

  _calculateRiskScore(cp) {
    let score = 0;
    const ratingScores = { 'AAA': 0, 'AA+': 1, 'AA': 1, 'AA-': 2, 'A+': 2, 'A': 3, 'A-': 3, 'BBB+': 4, 'BBB': 5, 'BBB-': 6, 'BB+': 7, 'BB': 8, 'B': 9 };
    score += ratingScores[cp.creditRating] || 5;
    if (cp.cdsSpread > 200) score += 3;
    else if (cp.cdsSpread > 100) score += 2;
    else if (cp.cdsSpread > 50) score += 1;
    return Math.min(score, 10);
  }
}

module.exports = new TreasuryService();
