/**
 * LP Investor Portal Service
 * Secure, investor-facing dashboard providing:
 *   - Capital account summary & historical roll-forward
 *   - Performance metrics (IRR, TVPI, DPI, RVPI) with time-series
 *   - Document vault (K-1s, quarterly reports, capital calls, distributions)
 *   - Commitment & unfunded tracking
 *   - Notification centre & preferences
 *   - Secure per-investor access (row-level isolation)
 */

class InvestorPortalService {

  // ==================== DASHBOARD ====================

  /**
   * Generate full LP dashboard for a single investor
   */
  getDashboard({ investorId, fund, asOfDate }) {
    return {
      investorId,
      fundName: fund.name,
      asOfDate,
      generatedAt: new Date().toISOString(),

      // Header
      welcome: {
        investorName: fund.investors.find(i => i.id === investorId)?.name,
        lastLogin: null, // Populated by auth layer
        unreadNotifications: 0
      },

      // Sections
      capitalAccount: this.getCapitalAccountSummary({ investorId, fund, asOfDate }),
      performance: this.getPerformanceMetrics({ investorId, fund, asOfDate }),
      documents: this.getDocumentVault({ investorId, fundId: fund.id }),
      commitmentTracker: this.getCommitmentTracker({ investorId, fund }),
      recentActivity: this.getRecentActivity({ investorId, fund }),
      notifications: this.getNotifications({ investorId })
    };
  }

  // ==================== CAPITAL ACCOUNT ====================

  /**
   * Capital account summary with period-over-period comparison
   */
  getCapitalAccountSummary({ investorId, fund, asOfDate }) {
    const lp = fund.investors.find(i => i.id === investorId);
    if (!lp) return null;

    return {
      commitment: lp.commitment,
      totalContributions: lp.totalContributions,
      totalDistributions: lp.totalDistributions,
      netContributedCapital: lp.totalContributions - lp.totalDistributions,
      currentNAV: lp.capitalAccount,
      unrealisedGain: lp.capitalAccount - (lp.totalContributions - lp.totalDistributions),
      unfundedCommitment: lp.commitment - lp.totalContributions + (lp.recallableDistributions || 0),
      pctCalled: parseFloat(((lp.totalContributions / lp.commitment) * 100).toFixed(1)),
      totalValue: lp.totalDistributions + lp.capitalAccount,

      // Period activity
      periodActivity: {
        period: fund.currentPeriod,
        contributions: lp.periodContributions || 0,
        distributions: lp.periodDistributions || 0,
        netIncome: lp.periodNetIncome || 0,
        unrealisedChange: lp.periodUnrealisedChange || 0,
        mgmtFees: lp.periodMgmtFees || 0,
        carryAllocation: lp.periodCarry || 0
      },

      // Historical roll-forward (quarterly)
      historicalBalances: (lp.historicalBalances || []).map(h => ({
        date: h.date,
        balance: h.balance,
        contributions: h.contributions,
        distributions: h.distributions
      }))
    };
  }

  // ==================== PERFORMANCE ====================

  /**
   * Performance metrics with time-series for charting
   */
  getPerformanceMetrics({ investorId, fund, asOfDate }) {
    const lp = fund.investors.find(i => i.id === investorId);
    if (!lp) return null;

    const totalValue = lp.totalDistributions + lp.capitalAccount;
    const tvpi = lp.totalContributions > 0 ? parseFloat((totalValue / lp.totalContributions).toFixed(2)) : 0;
    const dpi = lp.totalContributions > 0 ? parseFloat((lp.totalDistributions / lp.totalContributions).toFixed(2)) : 0;
    const rvpi = lp.totalContributions > 0 ? parseFloat((lp.capitalAccount / lp.totalContributions).toFixed(2)) : 0;

    return {
      current: {
        netIrr: lp.netIrr || null,
        grossIrr: fund.grossIrr || null,
        tvpi,
        dpi,
        rvpi,
        moic: tvpi // For PE, TVPI = MOIC at investor level
      },

      // Time-series for charts (quarterly data points)
      timeSeries: {
        labels: (fund.performanceHistory || []).map(p => p.date),
        netIrr: (fund.performanceHistory || []).map(p => p.netIrr),
        tvpi: (fund.performanceHistory || []).map(p => p.tvpi),
        dpi: (fund.performanceHistory || []).map(p => p.dpi),
        nav: (lp.historicalBalances || []).map(h => h.balance)
      },

      // Benchmarks
      benchmarks: {
        pmeIndex: fund.pmeIndex || 'MSCI World',
        pmeFactor: fund.pmeFactor || null,
        quartile: fund.quartile || null,
        vintageYear: fund.vintageYear,
        peerMedianIrr: fund.peerMedianIrr || null,
        peerUpperQuartileIrr: fund.peerUpperQuartileIrr || null
      },

      // J-curve data
      jCurve: (lp.historicalBalances || []).map(h => ({
        date: h.date,
        cumulativeCashFlow: h.cumulativeContributions - h.cumulativeDistributions,
        nav: h.balance,
        totalValue: h.cumulativeDistributions + h.balance
      }))
    };
  }

  // ==================== DOCUMENT VAULT ====================

  /**
   * Investor-specific document vault — all downloadable documents
   */
  getDocumentVault({ investorId, fundId }) {
    // In production, query document store filtered by investorId
    const categories = [
      {
        category: 'Tax Documents',
        icon: 'tax',
        documents: [
          { type: 'K-1', name: 'Schedule K-1', years: [], format: 'PDF' },
          { type: 'K-1_STATE', name: 'State K-1s', years: [], format: 'PDF' },
          { type: 'WITHHOLDING', name: 'Withholding Tax Certificates (1042-S)', years: [], format: 'PDF' }
        ]
      },
      {
        category: 'Quarterly Reports',
        icon: 'report',
        documents: [
          { type: 'QUARTERLY_LETTER', name: 'Quarterly Letter', periods: [], format: 'PDF' },
          { type: 'CAPITAL_ACCOUNT', name: 'Capital Account Statement', periods: [], format: 'PDF' }
        ]
      },
      {
        category: 'Capital Activity',
        icon: 'capital',
        documents: [
          { type: 'CAPITAL_CALL', name: 'Capital Call Notices', items: [], format: 'PDF' },
          { type: 'DISTRIBUTION', name: 'Distribution Notices', items: [], format: 'PDF' }
        ]
      },
      {
        category: 'Fund Documents',
        icon: 'legal',
        documents: [
          { type: 'LPA', name: 'Limited Partnership Agreement', format: 'PDF' },
          { type: 'SUBSCRIPTION', name: 'Subscription Agreement', format: 'PDF' },
          { type: 'SIDE_LETTER', name: 'Side Letter (if applicable)', format: 'PDF' },
          { type: 'PPM', name: 'Private Placement Memorandum', format: 'PDF' }
        ]
      },
      {
        category: 'Financial Statements',
        icon: 'financials',
        documents: [
          { type: 'AUDITED_FS', name: 'Audited Financial Statements', years: [], format: 'PDF' },
          { type: 'INTERIM_FS', name: 'Interim Financial Statements', periods: [], format: 'PDF' }
        ]
      },
      {
        category: 'ESG & Impact',
        icon: 'esg',
        documents: [
          { type: 'ESG_ANNUAL', name: 'ESG Annual Report', years: [], format: 'PDF' },
          { type: 'SFDR_DISCLOSURE', name: 'SFDR Periodic Disclosure', years: [], format: 'PDF' }
        ]
      },
      {
        category: 'Valuation',
        icon: 'valuation',
        documents: [
          { type: 'VALUATION_REPORT', name: 'Quarterly Valuation Report', periods: [], format: 'PDF' }
        ]
      }
    ];

    return {
      investorId,
      fundId,
      categories,
      totalDocuments: categories.reduce((sum, c) => sum + c.documents.length, 0),
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Generate download URL for a specific document
   */
  getDocumentDownloadUrl({ investorId, fundId, documentType, period }) {
    // In production: generate signed URL with expiry
    const token = Buffer.from(`${investorId}:${fundId}:${documentType}:${period}:${Date.now()}`).toString('base64');
    return {
      url: `/api/portal/download/${fundId}/${documentType}/${period}?token=${token}`,
      expiresIn: '1 hour',
      fileName: `${documentType}_${period}.pdf`
    };
  }

  // ==================== COMMITMENT TRACKER ====================

  /**
   * Visual commitment tracker — how much called, unfunded, recallable
   */
  getCommitmentTracker({ investorId, fund }) {
    const lp = fund.investors.find(i => i.id === investorId);
    if (!lp) return null;

    const recallable = lp.recallableDistributions || 0;
    const unfunded = lp.commitment - lp.totalContributions + recallable;
    const calledPct = (lp.totalContributions / lp.commitment) * 100;
    const distributedPct = (lp.totalDistributions / lp.commitment) * 100;

    return {
      commitment: lp.commitment,
      called: lp.totalContributions,
      calledPct: parseFloat(calledPct.toFixed(1)),
      distributed: lp.totalDistributions,
      distributedPct: parseFloat(distributedPct.toFixed(1)),
      recallable,
      unfunded,
      unfundedPct: parseFloat(((unfunded / lp.commitment) * 100).toFixed(1)),

      // Call schedule (upcoming expected calls)
      upcomingCalls: (fund.expectedCalls || []).map(c => ({
        expectedDate: c.date,
        estimatedAmount: parseFloat((c.totalAmount * (lp.commitment / fund.totalCommitments)).toFixed(2)),
        purpose: c.purpose
      })),

      // Investment period status
      investmentPeriod: {
        start: fund.investmentPeriodStart,
        end: fund.investmentPeriodEnd,
        active: new Date() < new Date(fund.investmentPeriodEnd),
        remainingMonths: Math.max(0, Math.ceil((new Date(fund.investmentPeriodEnd) - new Date()) / (1000 * 60 * 60 * 24 * 30)))
      }
    };
  }

  // ==================== RECENT ACTIVITY ====================

  /**
   * Recent activity feed for the investor
   */
  getRecentActivity({ investorId, fund }) {
    const lp = fund.investors.find(i => i.id === investorId);
    if (!lp) return null;

    // Merge all activity types and sort chronologically
    const activities = [];

    // Capital calls
    for (const call of (lp.capitalCalls || [])) {
      activities.push({
        type: 'CAPITAL_CALL',
        date: call.date,
        description: `Capital Call #${call.number}`,
        amount: -call.amount, // Negative = outflow
        status: call.status, // FUNDED, PENDING, OVERDUE
        documentAvailable: true
      });
    }

    // Distributions
    for (const dist of (lp.distributions || [])) {
      activities.push({
        type: 'DISTRIBUTION',
        date: dist.date,
        description: `Distribution — ${dist.source || 'Fund proceeds'}`,
        amount: dist.netAmount, // Positive = inflow
        status: 'COMPLETED',
        documentAvailable: true
      });
    }

    // Documents published
    for (const doc of (lp.documentsPublished || [])) {
      activities.push({
        type: 'DOCUMENT',
        date: doc.date,
        description: `${doc.name} published`,
        documentType: doc.type,
        documentAvailable: true
      });
    }

    // Sort most recent first
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
      activities: activities.slice(0, 50), // Last 50 activities
      totalActivities: activities.length
    };
  }

  // ==================== NOTIFICATIONS ====================

  /**
   * Notification centre for the investor
   */
  getNotifications({ investorId }) {
    // In production, query notification store
    return {
      unread: 0,
      notifications: [],
      preferences: {
        capitalCallAlerts: true,
        distributionAlerts: true,
        documentPublished: true,
        quarterlyReportReady: true,
        taxDocumentReady: true,
        valuationUpdate: false,
        complianceReminders: true,
        deliveryMethod: 'EMAIL' // EMAIL, SMS, PORTAL_ONLY
      }
    };
  }

  /**
   * Update notification preferences
   */
  updateNotificationPreferences({ investorId, preferences }) {
    return {
      investorId,
      preferences,
      updatedAt: new Date().toISOString()
    };
  }

  // ==================== MULTI-FUND VIEW ====================

  /**
   * Aggregate dashboard across all funds an investor participates in
   */
  getMultiFundDashboard({ investorId, funds }) {
    const fundSummaries = funds.map(fund => {
      const lp = fund.investors.find(i => i.id === investorId);
      if (!lp) return null;

      return {
        fundName: fund.name,
        fundId: fund.id,
        vintageYear: fund.vintageYear,
        strategy: fund.strategy,
        commitment: lp.commitment,
        called: lp.totalContributions,
        distributed: lp.totalDistributions,
        nav: lp.capitalAccount,
        totalValue: lp.totalDistributions + lp.capitalAccount,
        tvpi: lp.totalContributions > 0 ? parseFloat(((lp.totalDistributions + lp.capitalAccount) / lp.totalContributions).toFixed(2)) : 0,
        netIrr: lp.netIrr,
        unfunded: lp.commitment - lp.totalContributions + (lp.recallableDistributions || 0),
        status: fund.status // FUNDRAISING, INVESTING, HARVESTING, WINDING_DOWN
      };
    }).filter(Boolean);

    const totals = fundSummaries.reduce((acc, f) => {
      acc.commitment += f.commitment;
      acc.called += f.called;
      acc.distributed += f.distributed;
      acc.nav += f.nav;
      acc.totalValue += f.totalValue;
      acc.unfunded += f.unfunded;
      return acc;
    }, { commitment: 0, called: 0, distributed: 0, nav: 0, totalValue: 0, unfunded: 0 });

    totals.tvpi = totals.called > 0 ? parseFloat((totals.totalValue / totals.called).toFixed(2)) : 0;
    totals.dpi = totals.called > 0 ? parseFloat((totals.distributed / totals.called).toFixed(2)) : 0;

    return {
      investorId,
      totalFunds: fundSummaries.length,
      aggregateTotals: totals,
      funds: fundSummaries,
      diversification: {
        byStrategy: this._groupBy(fundSummaries, 'strategy', 'commitment'),
        byVintage: this._groupBy(fundSummaries, 'vintageYear', 'commitment'),
        byStatus: this._groupBy(fundSummaries, 'status', 'commitment')
      }
    };
  }

  // ==================== PRIVATE ====================

  _groupBy(items, key, valueKey) {
    const groups = {};
    for (const item of items) {
      const k = item[key] || 'Other';
      groups[k] = (groups[k] || 0) + item[valueKey];
    }
    return groups;
  }
}

module.exports = new InvestorPortalService();
