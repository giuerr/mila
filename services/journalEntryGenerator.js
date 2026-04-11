/**
 * Auto Journal Entry Generator
 * Translates fund events into GL entries for Xero/QuickBooks/NetSuite.
 *
 * Chart of Accounts (PE/VC Fund):
 *   Assets: Cash (1000), Investments at FV (1100), Receivables (1200), Prepaid (1300)
 *   Liabilities: Payables (2000), Mgmt Fee Payable (2100), Carry Payable (2200), Credit Facility (2300)
 *   Partners Capital: LP Capital (3000), GP Capital (3100), Retained Earnings (3200)
 *   Revenue: Mgmt Fee Income (4000), Carry Income (4100), Interest Income (4200)
 *   Expense: Fund Expenses (5000), Org Expenses (5100), Placement Fees (5200)
 */

const db = require('../db/database');
const accounting = require('../connectors/accounting');

class JournalEntryGenerator {

  /**
   * Generate journal entries for a capital call
   */
  generateCapitalCallEntries({ fundId, callNumber, entries }) {
    const activities = entries || db.query(
      "SELECT ca.*, i.name as investor_name FROM capital_activity ca JOIN investors i ON ca.investor_id = i.id WHERE ca.fund_id = ? AND ca.call_number = ? AND ca.type = 'CAPITAL_CALL'",
      [fundId, callNumber]
    );

    const totalAmount = activities.reduce((sum, a) => sum + a.amount, 0);
    const fund = db.findById('funds', fundId);

    return {
      eventType: 'CAPITAL_CALL',
      fundId,
      fundName: fund?.name,
      callNumber,
      date: new Date().toISOString().split('T')[0],
      narration: `Capital Call #${callNumber} — ${fund?.name || fundId}`,
      lineItems: [
        // Debit: Cash (money coming in from LPs)
        { account: '1000', accountName: 'Cash — Fund Account', debit: totalAmount, credit: 0, description: `Capital call #${callNumber} receipts` },
        // Credit: LP Capital Contributions
        { account: '3000', accountName: 'LP Capital Contributions', debit: 0, credit: totalAmount, description: `${activities.length} LP(s) called` }
      ],
      // LP-level sub-ledger entries
      subLedger: activities.map(a => ({
        investorId: a.investor_id,
        investorName: a.investor_name,
        amount: a.amount,
        account: '3000',
        type: 'CREDIT'
      })),
      total: totalAmount,
      balanced: true
    };
  }

  /**
   * Generate journal entries for a distribution
   */
  generateDistributionEntries({ fundId, distributionType, distributions }) {
    const totalAmount = distributions.reduce((sum, d) => sum + d.amount, 0);
    const fund = db.findById('funds', fundId);

    const lineItems = [
      // Credit: Cash (money going out to LPs)
      { account: '1000', accountName: 'Cash — Fund Account', debit: 0, credit: totalAmount, description: `${distributionType || 'Distribution'} to ${distributions.length} LP(s)` }
    ];

    if (distributionType === 'RETURN_OF_CAPITAL') {
      lineItems.push({ account: '3000', accountName: 'LP Capital Contributions', debit: totalAmount, credit: 0, description: 'Return of capital' });
    } else if (distributionType === 'PROFIT') {
      lineItems.push({ account: '3200', accountName: 'Retained Earnings — Distributed', debit: totalAmount, credit: 0, description: 'Profit distribution' });
    } else {
      // Mixed — split between return of capital and profit
      lineItems.push({ account: '3000', accountName: 'LP Capital / Retained Earnings', debit: totalAmount, credit: 0, description: 'Distribution (allocation TBD)' });
    }

    return {
      eventType: 'DISTRIBUTION',
      fundId,
      fundName: fund?.name,
      date: new Date().toISOString().split('T')[0],
      narration: `Distribution — ${fund?.name || fundId}`,
      lineItems,
      subLedger: distributions.map(d => ({
        investorId: d.investorId,
        investorName: d.investorName,
        amount: d.amount,
        account: '3000',
        type: 'DEBIT'
      })),
      total: totalAmount,
      balanced: true
    };
  }

  /**
   * Generate journal entries for management fee accrual
   */
  generateMgmtFeeEntries({ fundId, feeAmount, periodStart, periodEnd }) {
    const fund = db.findById('funds', fundId);

    return {
      eventType: 'MGMT_FEE_ACCRUAL',
      fundId,
      fundName: fund?.name,
      date: periodEnd || new Date().toISOString().split('T')[0],
      narration: `Management fee accrual ${periodStart} to ${periodEnd} — ${fund?.name || fundId}`,
      lineItems: [
        { account: '5000', accountName: 'Management Fee Expense', debit: feeAmount, credit: 0, description: `Mgmt fee ${periodStart}-${periodEnd}` },
        { account: '2100', accountName: 'Management Fee Payable', debit: 0, credit: feeAmount, description: 'Accrued to GP' }
      ],
      total: feeAmount,
      balanced: true
    };
  }

  /**
   * Generate journal entries for management fee payment
   */
  generateMgmtFeePaymentEntries({ fundId, feeAmount, period }) {
    const fund = db.findById('funds', fundId);

    return {
      eventType: 'MGMT_FEE_PAYMENT',
      fundId,
      fundName: fund?.name,
      date: new Date().toISOString().split('T')[0],
      narration: `Management fee payment ${period} — ${fund?.name || fundId}`,
      lineItems: [
        { account: '2100', accountName: 'Management Fee Payable', debit: feeAmount, credit: 0, description: 'Clear accrual' },
        { account: '1000', accountName: 'Cash — Fund Account', debit: 0, credit: feeAmount, description: 'Payment to GP' }
      ],
      total: feeAmount,
      balanced: true
    };
  }

  /**
   * Generate journal entries for investment purchase
   */
  generateInvestmentEntries({ fundId, companyName, amount, investmentId }) {
    const fund = db.findById('funds', fundId);

    return {
      eventType: 'INVESTMENT_PURCHASE',
      fundId,
      fundName: fund?.name,
      date: new Date().toISOString().split('T')[0],
      narration: `Investment in ${companyName} — ${fund?.name || fundId}`,
      lineItems: [
        { account: '1100', accountName: 'Investments at Fair Value', debit: amount, credit: 0, description: `Acquisition: ${companyName}` },
        { account: '1000', accountName: 'Cash — Fund Account', debit: 0, credit: amount, description: `Wire to ${companyName}` }
      ],
      total: amount,
      balanced: true
    };
  }

  /**
   * Generate journal entries for fair value adjustment
   */
  generateFairValueAdjustmentEntries({ fundId, companyName, previousValue, newValue }) {
    const fund = db.findById('funds', fundId);
    const adjustment = newValue - previousValue;
    const isGain = adjustment > 0;

    return {
      eventType: 'FAIR_VALUE_ADJUSTMENT',
      fundId,
      fundName: fund?.name,
      date: new Date().toISOString().split('T')[0],
      narration: `Fair value ${isGain ? 'gain' : 'loss'}: ${companyName} — ${fund?.name || fundId}`,
      lineItems: [
        {
          account: '1100', accountName: 'Investments at Fair Value',
          debit: isGain ? Math.abs(adjustment) : 0,
          credit: isGain ? 0 : Math.abs(adjustment),
          description: `${companyName}: ${previousValue} → ${newValue}`
        },
        {
          account: '3200', accountName: 'Unrealized Gain/Loss',
          debit: isGain ? 0 : Math.abs(adjustment),
          credit: isGain ? Math.abs(adjustment) : 0,
          description: `${isGain ? 'Unrealized gain' : 'Unrealized loss'}: ${companyName}`
        }
      ],
      total: Math.abs(adjustment),
      balanced: true
    };
  }

  /**
   * Generate journal entries for carried interest accrual
   */
  generateCarryAccrualEntries({ fundId, carryAmount, period }) {
    const fund = db.findById('funds', fundId);

    return {
      eventType: 'CARRY_ACCRUAL',
      fundId,
      fundName: fund?.name,
      date: new Date().toISOString().split('T')[0],
      narration: `Carried interest accrual ${period} — ${fund?.name || fundId}`,
      lineItems: [
        { account: '3200', accountName: 'Retained Earnings', debit: carryAmount, credit: 0, description: `Carry accrual ${period}` },
        { account: '2200', accountName: 'Carried Interest Payable', debit: 0, credit: carryAmount, description: 'Accrued to GP' }
      ],
      total: carryAmount,
      balanced: true
    };
  }

  /**
   * Push journal entry to Xero
   */
  async pushToXero(journalEntry) {
    const xeroJournal = {
      Date: journalEntry.date,
      Narration: journalEntry.narration,
      Status: 'POSTED',
      JournalLines: journalEntry.lineItems.map(li => ({
        AccountCode: li.account,
        Description: li.description,
        LineAmount: li.debit > 0 ? li.debit : -li.credit,
        TaxType: 'NONE'
      }))
    };
    return accounting.xero.createManualJournal(xeroJournal);
  }

  /**
   * Push journal entry to QuickBooks
   */
  async pushToQuickBooks(journalEntry) {
    const qbEntry = {
      TxnDate: journalEntry.date,
      PrivateNote: journalEntry.narration,
      Line: journalEntry.lineItems.map((li, idx) => ({
        Id: String(idx + 1),
        Description: li.description,
        Amount: li.debit || li.credit,
        DetailType: 'JournalEntryLineDetail',
        JournalEntryLineDetail: {
          PostingType: li.debit > 0 ? 'Debit' : 'Credit',
          AccountRef: { value: li.account, name: li.accountName }
        }
      }))
    };
    return accounting.quickbooks.createJournalEntry(qbEntry);
  }
}

module.exports = new JournalEntryGenerator();
