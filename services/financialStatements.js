/**
 * Financial Statement Generator
 * GAAP/IFRS compliant: balance sheet, income statement, partners' capital,
 * cash flow statement, notes to financial statements.
 */

const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic();

class FinancialStatementsService {

  /**
   * Generate complete set of fund financial statements
   */
  async generateFullStatements({ fund, period, standard = 'US_GAAP', auditor }) {
    const balanceSheet = this.generateBalanceSheet(fund, period);
    const incomeStatement = this.generateIncomeStatement(fund, period);
    const partnersCapital = this.generatePartnersCapitalStatement(fund, period);
    const cashFlow = this.generateCashFlowStatement(fund, period);
    const notes = await this.generateNotes({ fund, period, standard, balanceSheet, incomeStatement });

    return {
      fund: fund.name,
      period,
      standard,
      auditor: auditor || null,
      statements: {
        balanceSheet,
        incomeStatement,
        partnersCapital,
        cashFlow,
        notes
      },
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Statement of Assets and Liabilities (Balance Sheet)
   */
  generateBalanceSheet(fund, period) {
    const investments = fund.investments || [];
    const investmentsFv = investments.reduce((sum, i) => sum + i.fairValue, 0);
    const investmentsCost = investments.reduce((sum, i) => sum + i.costBasis, 0);

    const assets = {
      investments: {
        atFairValue: investmentsFv,
        atCost: investmentsCost,
        unrealizedAppreciation: investmentsFv - investmentsCost,
        byLevel: {
          level1: investments.filter(i => i.level === 1).reduce((s, i) => s + i.fairValue, 0),
          level2: investments.filter(i => i.level === 2).reduce((s, i) => s + i.fairValue, 0),
          level3: investments.filter(i => i.level === 3).reduce((s, i) => s + i.fairValue, 0)
        }
      },
      cash: fund.cash || 0,
      cashEquivalents: fund.cashEquivalents || 0,
      interestReceivable: fund.interestReceivable || 0,
      dividendsReceivable: fund.dividendsReceivable || 0,
      dueFromBrokers: fund.dueFromBrokers || 0,
      prepaidExpenses: fund.prepaidExpenses || 0,
      deferredFinancingCosts: fund.deferredFinancingCosts || 0,
      otherAssets: fund.otherAssets || 0
    };

    const totalAssets = Object.values(assets).reduce((sum, v) => {
      if (typeof v === 'object' && v.atFairValue !== undefined) return sum + v.atFairValue;
      if (typeof v === 'number') return sum + v;
      return sum;
    }, 0);

    const liabilities = {
      creditFacilityPayable: fund.creditFacility?.outstandingDraws || 0,
      managementFeePayable: fund.accruedMgmtFee || 0,
      performanceAllocationPayable: fund.accruedPerfFee || 0,
      accruedExpenses: fund.accruedExpenses || 0,
      dueToAffiliates: fund.dueToAffiliates || 0,
      distributionsPayable: fund.distributionsPayable || 0,
      capitalCallsReceived: fund.advanceCapitalCalls || 0,
      otherLiabilities: fund.otherLiabilities || 0
    };

    const totalLiabilities = Object.values(liabilities).reduce((sum, v) => sum + v, 0);
    const partnersCapital = totalAssets - totalLiabilities;

    return {
      title: 'Statement of Assets and Liabilities',
      asOf: period.endDate,
      assets: {
        ...assets,
        totalAssets: parseFloat(totalAssets.toFixed(2))
      },
      liabilities: {
        ...liabilities,
        totalLiabilities: parseFloat(totalLiabilities.toFixed(2))
      },
      partnersCapital: parseFloat(partnersCapital.toFixed(2)),
      totalLiabilitiesAndCapital: parseFloat(totalAssets.toFixed(2))
    };
  }

  /**
   * Statement of Operations (Income Statement)
   */
  generateIncomeStatement(fund, period) {
    const investmentIncome = {
      interestIncome: fund.interestIncome || 0,
      dividendIncome: fund.dividendIncome || 0,
      otherIncome: fund.otherIncome || 0,
      total: (fund.interestIncome || 0) + (fund.dividendIncome || 0) + (fund.otherIncome || 0)
    };

    const expenses = {
      managementFees: fund.managementFees || 0,
      administrationFees: fund.adminFees || 0,
      custodyFees: fund.custodyFees || 0,
      auditFees: fund.auditFees || 0,
      legalFees: fund.legalFees || 0,
      interestExpense: fund.interestExpense || 0,
      organizationalExpenses: fund.orgExpenseAmortization || 0,
      insuranceExpense: fund.insuranceExpense || 0,
      otherExpenses: fund.otherExpenses || 0,
      total: 0
    };
    expenses.total = Object.entries(expenses).filter(([k]) => k !== 'total').reduce((sum, [, v]) => sum + v, 0);

    const netInvestmentIncome = investmentIncome.total - expenses.total;

    const realizedGains = {
      netRealizedGain: fund.netRealizedGain || 0,
      realizedGainOnInvestments: fund.realizedGainInvestments || 0,
      realizedGainOnFx: fund.realizedGainFx || 0
    };

    const unrealizedGains = {
      netChangeInUnrealized: fund.netChangeUnrealized || 0,
      unrealizedOnInvestments: fund.unrealizedChangeInvestments || 0,
      unrealizedOnFx: fund.unrealizedChangeFx || 0
    };

    const netGain = realizedGains.netRealizedGain + unrealizedGains.netChangeInUnrealized;
    const netIncrease = netInvestmentIncome + netGain;

    // Performance allocation
    const performanceAllocation = fund.performanceAllocation || 0;
    const netIncreaseAfterPerf = netIncrease - performanceAllocation;

    return {
      title: 'Statement of Operations',
      period: { from: period.startDate, to: period.endDate },
      investmentIncome,
      expenses,
      netInvestmentIncome: parseFloat(netInvestmentIncome.toFixed(2)),
      realizedGains,
      unrealizedGains,
      netGainOnInvestments: parseFloat(netGain.toFixed(2)),
      netIncreaseBeforePerformanceAllocation: parseFloat(netIncrease.toFixed(2)),
      performanceAllocation,
      netIncreaseInPartnersCapital: parseFloat(netIncreaseAfterPerf.toFixed(2))
    };
  }

  /**
   * Statement of Changes in Partners' Capital
   */
  generatePartnersCapitalStatement(fund, period) {
    const partners = fund.partners || [];
    const gpPartner = partners.find(p => p.isGp) || { name: 'General Partner', beginningCapital: 0 };
    const lpPartners = partners.filter(p => !p.isGp);

    const buildPartnerRow = (partner) => {
      const beginning = partner.beginningCapital || 0;
      const contributions = partner.contributions || 0;
      const withdrawals = partner.withdrawals || 0;
      const netIncome = partner.netIncomeAllocation || 0;
      const realizedGain = partner.realizedGainAllocation || 0;
      const unrealizedGain = partner.unrealizedGainAllocation || 0;
      const performanceAlloc = partner.performanceAllocation || 0;
      const ending = beginning + contributions - withdrawals + netIncome + realizedGain + unrealizedGain - performanceAlloc;

      return {
        name: partner.name,
        isGp: partner.isGp || false,
        beginningCapital: beginning,
        contributions,
        withdrawals,
        netInvestmentIncomeAllocation: netIncome,
        netRealizedGainAllocation: realizedGain,
        netUnrealizedGainAllocation: unrealizedGain,
        performanceAllocation: performanceAlloc,
        endingCapital: parseFloat(ending.toFixed(2))
      };
    };

    const gpRow = buildPartnerRow(gpPartner);
    const lpRows = lpPartners.map(buildPartnerRow);
    const totalRow = {
      name: 'TOTAL',
      beginningCapital: gpRow.beginningCapital + lpRows.reduce((s, r) => s + r.beginningCapital, 0),
      contributions: gpRow.contributions + lpRows.reduce((s, r) => s + r.contributions, 0),
      withdrawals: gpRow.withdrawals + lpRows.reduce((s, r) => s + r.withdrawals, 0),
      netInvestmentIncomeAllocation: gpRow.netInvestmentIncomeAllocation + lpRows.reduce((s, r) => s + r.netInvestmentIncomeAllocation, 0),
      netRealizedGainAllocation: gpRow.netRealizedGainAllocation + lpRows.reduce((s, r) => s + r.netRealizedGainAllocation, 0),
      netUnrealizedGainAllocation: gpRow.netUnrealizedGainAllocation + lpRows.reduce((s, r) => s + r.netUnrealizedGainAllocation, 0),
      performanceAllocation: gpRow.performanceAllocation + lpRows.reduce((s, r) => s + r.performanceAllocation, 0),
      endingCapital: gpRow.endingCapital + lpRows.reduce((s, r) => s + r.endingCapital, 0)
    };

    return {
      title: 'Statement of Changes in Partners\' Capital',
      period: { from: period.startDate, to: period.endDate },
      generalPartner: gpRow,
      limitedPartners: lpRows,
      total: totalRow,
      lpCount: lpRows.length
    };
  }

  /**
   * Statement of Cash Flows
   */
  generateCashFlowStatement(fund, period) {
    const operating = {
      netIncrease: fund.netIncreasePartnersCapital || 0,
      adjustments: {
        unrealizedGainLoss: -(fund.netChangeUnrealized || 0),
        realizedGainLoss: -(fund.netRealizedGain || 0),
        amortizationDeferredFinancing: fund.amortDeferredFinancing || 0,
        amortizationOrgCosts: fund.orgExpenseAmortization || 0,
        changeInReceivables: fund.changeInReceivables || 0,
        changeInPrepaid: fund.changeInPrepaid || 0,
        changeInAccruedExpenses: fund.changeInAccruedExpenses || 0,
        changeInMgmtFeePayable: fund.changeInMgmtFeePayable || 0,
        changeInPerfAllocationPayable: fund.changeInPerfAllocPayable || 0
      }
    };
    const adjustmentsTotal = Object.values(operating.adjustments).reduce((s, v) => s + v, 0);
    const netOperating = operating.netIncrease + adjustmentsTotal;

    const investing = {
      purchaseOfInvestments: -(fund.investmentPurchases || 0),
      proceedsFromSales: fund.investmentProceeds || 0,
      returnOfCapitalFromInvestments: fund.returnOfCapitalInvestments || 0
    };
    const netInvesting = Object.values(investing).reduce((s, v) => s + v, 0);

    const financing = {
      capitalContributions: fund.totalContributions || 0,
      capitalDistributions: -(fund.totalDistributions || 0),
      creditFacilityDrawdowns: fund.creditFacilityDrawdowns || 0,
      creditFacilityRepayments: -(fund.creditFacilityRepayments || 0),
      deferredFinancingCostsPaid: -(fund.deferredFinancingCostsPaid || 0)
    };
    const netFinancing = Object.values(financing).reduce((s, v) => s + v, 0);

    const netChange = netOperating + netInvesting + netFinancing;

    return {
      title: 'Statement of Cash Flows',
      period: { from: period.startDate, to: period.endDate },
      operatingActivities: {
        ...operating,
        adjustmentsTotal: parseFloat(adjustmentsTotal.toFixed(2)),
        netCashFromOperating: parseFloat(netOperating.toFixed(2))
      },
      investingActivities: {
        ...investing,
        netCashFromInvesting: parseFloat(netInvesting.toFixed(2))
      },
      financingActivities: {
        ...financing,
        netCashFromFinancing: parseFloat(netFinancing.toFixed(2))
      },
      netChangeInCash: parseFloat(netChange.toFixed(2)),
      beginningCash: fund.beginningCash || 0,
      endingCash: parseFloat(((fund.beginningCash || 0) + netChange).toFixed(2)),
      supplemental: {
        interestPaid: fund.interestExpense || 0
      }
    };
  }

  /**
   * AI-generated notes to financial statements
   */
  async generateNotes({ fund, period, standard, balanceSheet, incomeStatement }) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      messages: [{
        role: 'user',
        content: `You are preparing notes to the financial statements for ${fund.name}, a Cayman Islands SPC, for the period ending ${period.endDate}. Standard: ${standard}.

Balance Sheet total assets: ${balanceSheet.assets.totalAssets}
Net income: ${incomeStatement.netIncreaseInPartnersCapital}
Investment fair value: ${balanceSheet.assets.investments.atFairValue}
Level 3 investments: ${balanceSheet.assets.investments.byLevel.level3}

Generate comprehensive notes including:
1. Organization and Nature of Operations
2. Summary of Significant Accounting Policies (basis of presentation, use of estimates, investment valuation, income recognition, fund expenses, organizational costs, income taxes)
3. Fair Value Measurements (ASC 820 hierarchy, Level 3 reconciliation)
4. Investments (schedule of investments by sector/geography)
5. Partners' Capital (commitments, contributions, distributions)
6. Management Fee and Performance Allocation
7. Related Party Transactions
8. Credit Facility
9. Financial Highlights (per unit data, total return, expense ratios)
10. Subsequent Events
11. Indemnification and Contingencies
12. Tax Status (Cayman exempted partnership)

Write in formal audit-ready language. Be thorough.`
      }]
    });

    return {
      title: 'Notes to Financial Statements',
      content: response.content[0].text,
      standard,
      noteCount: 12
    };
  }

  /**
   * Financial highlights (per-unit performance data)
   */
  calculateFinancialHighlights({ navPerUnit, period, incomeStatement, expenseRatio, turnover }) {
    return {
      title: 'Financial Highlights',
      period: { from: period.startDate, to: period.endDate },
      perUnitData: {
        navPerUnitBeginning: navPerUnit.beginning,
        netInvestmentIncome: navPerUnit.netInvestmentIncome,
        netRealizedAndUnrealizedGain: navPerUnit.netGain,
        performanceAllocation: navPerUnit.performanceAllocation,
        navPerUnitEnding: navPerUnit.ending,
        totalReturn: parseFloat(((navPerUnit.ending / navPerUnit.beginning - 1) * 100).toFixed(2)) + '%'
      },
      ratios: {
        expenseRatioGross: expenseRatio.gross,
        expenseRatioNet: expenseRatio.net,
        netInvestmentIncomeRatio: expenseRatio.netInvestmentIncome,
        portfolioTurnoverRate: turnover
      }
    };
  }
}

module.exports = new FinancialStatementsService();
