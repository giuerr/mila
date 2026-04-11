/**
 * Cap Table Service
 * Manages ownership, subscriptions, redemptions across funds.
 * Pulls from fund platforms, computes allocations.
 */

const fundPlatforms = require('../connectors/fund-platforms');
const accounting = require('../connectors/accounting');

class CapTableService {

  /**
   * Get consolidated cap table from fund platform
   */
  async getCapTable(fundId, connector = 'juniperSquare') {
    const platform = fundPlatforms[connector];
    const [capTable, commitments, investors] = await Promise.all([
      platform.getCapTable ? platform.getCapTable(fundId) : null,
      platform.getCommitments ? platform.getCommitments(fundId) : null,
      platform.getInvestors(fundId)
    ]);

    return {
      fundId,
      capTable,
      commitments,
      investors,
      retrievedAt: new Date().toISOString()
    };
  }

  /**
   * Compute LP ownership percentages from commitments
   */
  computeOwnership(commitments) {
    const totalCommitment = commitments.reduce((sum, c) => sum + c.amount, 0);
    return commitments.map(c => ({
      investorId: c.investorId,
      investorName: c.investorName,
      commitment: c.amount,
      ownershipPct: (c.amount / totalCommitment * 100).toFixed(4),
      calledAmount: c.calledAmount || 0,
      uncalledAmount: c.amount - (c.calledAmount || 0)
    }));
  }

  /**
   * Get capital account summary for an investor
   */
  async getInvestorCapitalAccount(fundId, investorId, connector = 'juniperSquare') {
    const platform = fundPlatforms[connector];

    if (platform.getCapitalAccounts) {
      return platform.getCapitalAccounts(fundId, investorId);
    }
    if (platform.getCapitalAccountStatement) {
      return platform.getCapitalAccountStatement(fundId, investorId);
    }

    // Fallback: compute from capital activity
    const [calls, distributions] = await Promise.all([
      platform.getCapitalCalls(fundId),
      platform.getDistributions(fundId)
    ]);

    const investorCalls = calls.filter(c => c.investorId === investorId);
    const investorDists = distributions.filter(d => d.investorId === investorId);
    const totalCalled = investorCalls.reduce((sum, c) => sum + c.amount, 0);
    const totalDistributed = investorDists.reduce((sum, d) => sum + d.amount, 0);

    return {
      investorId,
      totalCalled,
      totalDistributed,
      netContributed: totalCalled - totalDistributed,
      dpi: totalCalled > 0 ? (totalDistributed / totalCalled).toFixed(4) : 0,
      capitalCalls: investorCalls,
      distributions: investorDists
    };
  }

  /**
   * Sync cap table data to accounting system
   */
  async syncToAccounting(fundId, accountingSystem = 'xero', fundConnector = 'juniperSquare') {
    const capData = await this.getCapTable(fundId, fundConnector);
    const acc = accounting[accountingSystem];

    // Create/update contacts for each investor
    const syncResults = [];
    for (const investor of capData.investors || []) {
      const contact = {
        Name: investor.name,
        EmailAddress: investor.email,
        ContactNumber: investor.investorId
      };

      const result = await acc.createContact
        ? acc.createContact(contact)
        : acc.createCustomer(contact);
      syncResults.push({ investor: investor.name, status: 'synced' });
    }

    return { syncResults, syncedAt: new Date().toISOString() };
  }
  // ==================== DYNAMIC CAP TABLE (v5.0) ====================

  /**
   * Full in-memory cap table with versioning, multi-class, and per-LP metrics
   */
  buildCapTable({ investors, fund, asOfDate }) {
    const totalCommitment = investors.reduce((s, i) => s + i.commitment, 0);
    const version = `v${Date.now()}`;

    const table = investors.map(lp => {
      const totalValue = (lp.totalDistributions || 0) + (lp.capitalAccount || 0);
      const tvpi = lp.totalContributions > 0 ? parseFloat((totalValue / lp.totalContributions).toFixed(4)) : 0;
      const dpi = lp.totalContributions > 0 ? parseFloat(((lp.totalDistributions || 0) / lp.totalContributions).toFixed(4)) : 0;
      const rvpi = lp.totalContributions > 0 ? parseFloat(((lp.capitalAccount || 0) / lp.totalContributions).toFixed(4)) : 0;

      return {
        investorId: lp.id,
        investorName: lp.name,
        entityType: lp.entityType,
        lpClass: lp.class || 'Standard',
        jurisdiction: lp.jurisdiction,

        commitment: lp.commitment,
        ownershipPct: parseFloat(((lp.commitment / totalCommitment) * 100).toFixed(4)),
        calledCapital: lp.totalContributions || 0,
        pctCalled: lp.commitment > 0 ? parseFloat((((lp.totalContributions || 0) / lp.commitment) * 100).toFixed(1)) : 0,
        unfunded: lp.commitment - (lp.totalContributions || 0) + (lp.recallableDistributions || 0),

        totalDistributions: lp.totalDistributions || 0,
        capitalAccount: lp.capitalAccount || 0,
        totalValue,

        // Per-LP performance
        tvpi, dpi, rvpi,
        netIrr: lp.netIrr || null,

        // Class-specific terms
        preferredReturnRate: lp.preferredReturnRate || fund.preferredReturn || 0.08,
        carryRate: lp.carryRate || fund.carryRate || 0.20,
        mgmtFeeRate: lp.mgmtFeeRate || fund.mgmtFeeRate || 0.02,

        // Side letter overrides
        hasSideLetter: lp.hasSideLetter || false,
        sideLetterTerms: lp.sideLetterTerms || null,

        // Classification
        isGp: lp.isGp || false,
        isKeyPerson: lp.isKeyPerson || false,
        isLpac: lp.isLpac || false,
        isBenefitPlan: lp.isBenefitPlan || false,
        fatcaStatus: lp.fatcaStatus || null,
        accreditedInvestor: lp.accreditedInvestor || true
      };
    });

    return {
      fundId: fund.id,
      fundName: fund.name,
      version,
      asOfDate,
      generatedAt: new Date().toISOString(),
      totalCommitment,
      totalCalled: table.reduce((s, lp) => s + lp.calledCapital, 0),
      totalDistributed: table.reduce((s, lp) => s + lp.totalDistributions, 0),
      totalNAV: table.reduce((s, lp) => s + lp.capitalAccount, 0),
      investorCount: table.length,
      gpCount: table.filter(lp => lp.isGp).length,
      lpacMembers: table.filter(lp => lp.isLpac).map(lp => lp.investorName),
      benefitPlanPct: parseFloat(((table.filter(lp => lp.isBenefitPlan).reduce((s, lp) => s + lp.commitment, 0) / totalCommitment) * 100).toFixed(2)),
      classSummary: this._classSummary(table),
      investors: table
    };
  }

  /**
   * Cap table version history — track changes over time
   */
  trackCapTableChange({ previousVersion, currentVersion, changeType, changedBy, reason }) {
    const changes = [];
    const prevMap = new Map((previousVersion?.investors || []).map(i => [i.investorId, i]));
    const currMap = new Map((currentVersion?.investors || []).map(i => [i.investorId, i]));

    // Detect new investors
    for (const [id, curr] of currMap) {
      if (!prevMap.has(id)) {
        changes.push({ type: 'INVESTOR_ADDED', investorId: id, name: curr.investorName, commitment: curr.commitment });
      }
    }

    // Detect removed investors
    for (const [id, prev] of prevMap) {
      if (!currMap.has(id)) {
        changes.push({ type: 'INVESTOR_REMOVED', investorId: id, name: prev.investorName });
      }
    }

    // Detect changes
    for (const [id, curr] of currMap) {
      const prev = prevMap.get(id);
      if (!prev) continue;
      const fields = ['commitment', 'calledCapital', 'capitalAccount', 'lpClass', 'preferredReturnRate', 'carryRate', 'mgmtFeeRate'];
      for (const field of fields) {
        if (prev[field] !== curr[field]) {
          changes.push({ type: 'FIELD_CHANGED', investorId: id, name: curr.investorName, field, oldValue: prev[field], newValue: curr[field] });
        }
      }
    }

    return {
      changeId: `CHG-${Date.now()}`,
      previousVersion: previousVersion?.version,
      currentVersion: currentVersion?.version,
      changeType, // SUBSCRIPTION, TRANSFER, REDEMPTION, CAPITAL_CALL, DISTRIBUTION, AMENDMENT
      changedBy,
      reason,
      timestamp: new Date().toISOString(),
      changes,
      totalChanges: changes.length
    };
  }

  /**
   * Process secondary transfer (LP interest transfer)
   */
  processSecondaryTransfer({ seller, buyer, transferAmount, transferPrice, fund, consentDate }) {
    const discountPct = transferAmount > 0 ? parseFloat((((transferAmount - transferPrice) / transferAmount) * 100).toFixed(2)) : 0;

    return {
      transferId: `TXF-${Date.now()}`,
      type: 'SECONDARY_TRANSFER',
      seller: { id: seller.id, name: seller.name, commitmentBefore: seller.commitment, commitmentAfter: seller.commitment - transferAmount },
      buyer: { id: buyer.id, name: buyer.name, commitmentBefore: buyer.commitment || 0, commitmentAfter: (buyer.commitment || 0) + transferAmount },
      transferAmount,
      transferPrice,
      discountToNAV: discountPct + '%',
      consentDate,
      rofrExpired: true, // Right of First Refusal
      lpacNotified: true,
      gpConsent: true,
      effectiveDate: consentDate,
      capitalAccountTransfer: {
        fromAccount: seller.capitalAccount,
        transferredValue: (seller.capitalAccount || 0) * (transferAmount / seller.commitment),
        toAccount: (buyer.capitalAccount || 0) + (seller.capitalAccount || 0) * (transferAmount / seller.commitment)
      },
      taxImplications: 'Buyer assumes seller\'s cost basis for tax purposes (Section 743(b) adjustment may apply)',
      requiredNotices: ['ROFR notice to all LPs', 'GP consent letter', 'LPAC notification', 'Amendment to LP register', 'Updated subscription agreement']
    };
  }

  /**
   * Waterfall scenario per LP — what each LP gets at a given fund exit value
   */
  waterfallScenarioByLp({ investors, fund, exitValues }) {
    const totalCommitment = investors.reduce((s, i) => s + i.commitment, 0);
    const totalCalled = investors.reduce((s, i) => s + (i.totalContributions || 0), 0);

    return exitValues.map(exitValue => {
      const moic = totalCalled > 0 ? parseFloat((exitValue / totalCalled).toFixed(2)) : 0;
      const lpResults = investors.map(lp => {
        const pct = (lp.totalContributions || 0) / totalCalled;
        const lpShare = exitValue * pct;
        const lpCarry = Math.max(0, (lpShare - (lp.totalContributions || 0)) * (lp.carryRate || fund.carryRate || 0.20));
        const lpNet = lpShare - lpCarry;
        return {
          investorName: lp.name,
          grossProceeds: parseFloat(lpShare.toFixed(2)),
          carry: parseFloat(lpCarry.toFixed(2)),
          netProceeds: parseFloat(lpNet.toFixed(2)),
          moic: (lp.totalContributions || 0) > 0 ? parseFloat((lpNet / (lp.totalContributions || 0)).toFixed(2)) : 0
        };
      });

      return { exitValue, fundMoic: moic, lpResults };
    });
  }

  _classSummary(table) {
    const classes = {};
    for (const lp of table) {
      const cls = lp.lpClass;
      if (!classes[cls]) classes[cls] = { count: 0, totalCommitment: 0, prefReturn: lp.preferredReturnRate, carryRate: lp.carryRate };
      classes[cls].count++;
      classes[cls].totalCommitment += lp.commitment;
    }
    return classes;
  }
}

module.exports = new CapTableService();
