/**
 * Bank Reconciliation Service
 * 3-way reconciliation engine: matches expected amounts from capital_activity
 * against bank entries using fuzzy matching on amounts and wire references.
 */

const crypto = require('crypto');
const db = require('../db/database');

class BankReconciliationService {

  // ==================== 3-WAY RECONCILIATION ====================

  /**
   * Reconcile bank entries against capital_activity records.
   * @param {string} fundId - Fund identifier
   * @param {Array} bankEntries - [{date, amount, reference, type}]
   * @param {string} asOfDate - Reconciliation cutoff date (YYYY-MM-DD)
   * @returns {Object} matched pairs, unmatched entries, reconciliation summary
   */
  reconcile({ fundId, bankEntries, asOfDate }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId) throw new Error('fundId is required');
    if (!bankEntries || !Array.isArray(bankEntries)) throw new Error('bankEntries array is required');

    const cutoff = asOfDate || new Date().toISOString().split('T')[0];

    // Fetch expected amounts from capital_activity
    const fundRecords = db.query(`
      SELECT ca.*, i.name as investor_name
      FROM capital_activity ca
      LEFT JOIN investors i ON ca.investor_id = i.id
      WHERE ca.fund_id = ? AND ca.due_date <= ?
      ORDER BY ca.due_date ASC
    `, [fundId, cutoff]);

    const matched = [];
    const unmatchedBank = [...bankEntries];
    const unmatchedFund = [...fundRecords];

    // Pass 1: Exact match on amount (within tolerance) and wire reference
    for (let i = unmatchedBank.length - 1; i >= 0; i--) {
      const bank = unmatchedBank[i];
      const fundIdx = unmatchedFund.findIndex(fr =>
        Math.abs(fr.amount - bank.amount) <= 0.01 &&
        this._referenceMatch(bank.reference, fr.wire_reference)
      );
      if (fundIdx !== -1) {
        matched.push({
          bankEntry: bank,
          fundRecord: unmatchedFund[fundIdx],
          matchType: 'EXACT',
          confidence: 1.0,
          matchedAt: new Date().toISOString()
        });
        unmatchedBank.splice(i, 1);
        unmatchedFund.splice(fundIdx, 1);
      }
    }

    // Pass 2: Fuzzy amount match (within 0.01 tolerance) + date proximity (±3 days)
    for (let i = unmatchedBank.length - 1; i >= 0; i--) {
      const bank = unmatchedBank[i];
      const bankDate = new Date(bank.date);
      const fundIdx = unmatchedFund.findIndex(fr => {
        const frDate = new Date(fr.due_date || fr.payment_date);
        const daysDiff = Math.abs((frDate - bankDate) / (1000 * 60 * 60 * 24));
        return Math.abs(fr.amount - bank.amount) <= 0.01 && daysDiff <= 3;
      });
      if (fundIdx !== -1) {
        matched.push({
          bankEntry: bank,
          fundRecord: unmatchedFund[fundIdx],
          matchType: 'FUZZY_DATE',
          confidence: 0.85,
          matchedAt: new Date().toISOString()
        });
        unmatchedBank.splice(i, 1);
        unmatchedFund.splice(fundIdx, 1);
      }
    }

    // Pass 3: Amount-only match (within 0.01 tolerance), no date/reference constraint
    for (let i = unmatchedBank.length - 1; i >= 0; i--) {
      const bank = unmatchedBank[i];
      const fundIdx = unmatchedFund.findIndex(fr =>
        Math.abs(fr.amount - bank.amount) <= 0.01
      );
      if (fundIdx !== -1) {
        matched.push({
          bankEntry: bank,
          fundRecord: unmatchedFund[fundIdx],
          matchType: 'AMOUNT_ONLY',
          confidence: 0.65,
          matchedAt: new Date().toISOString()
        });
        unmatchedBank.splice(i, 1);
        unmatchedFund.splice(fundIdx, 1);
      }
    }

    const totalItems = bankEntries.length + fundRecords.length;
    const totalMatched = matched.length;
    const totalUnmatched = unmatchedBank.length + unmatchedFund.length;
    const matchRate = totalItems > 0
      ? parseFloat(((totalMatched * 2 / totalItems) * 100).toFixed(2))
      : 100;

    // Log reconciliation to audit trail
    db.logAction('RECONCILIATION', fundId, 'BANK_RECONCILIATION', 'mila', {
      asOfDate: cutoff,
      bankEntriesCount: bankEntries.length,
      fundRecordsCount: fundRecords.length,
      matched: totalMatched,
      unmatchedBank: unmatchedBank.length,
      unmatchedFund: unmatchedFund.length,
      matchRate: matchRate + '%'
    });

    return {
      reconciliationId: `RECON-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      fundId,
      asOfDate: cutoff,
      generatedAt: new Date().toISOString(),
      matched: {
        count: totalMatched,
        items: matched,
        totalAmount: parseFloat(matched.reduce((sum, m) => sum + m.bankEntry.amount, 0).toFixed(2))
      },
      unmatchedBank: {
        count: unmatchedBank.length,
        items: unmatchedBank,
        totalAmount: parseFloat(unmatchedBank.reduce((sum, b) => sum + b.amount, 0).toFixed(2))
      },
      unmatchedFund: {
        count: unmatchedFund.length,
        items: unmatchedFund,
        totalAmount: parseFloat(unmatchedFund.reduce((sum, f) => sum + f.amount, 0).toFixed(2))
      },
      summary: {
        totalMatched,
        totalUnmatched,
        matchRate: matchRate + '%',
        bankBalance: parseFloat(bankEntries.reduce((sum, b) => sum + b.amount, 0).toFixed(2)),
        expectedBalance: parseFloat(fundRecords.reduce((sum, f) => sum + f.amount, 0).toFixed(2)),
        variance: parseFloat((
          bankEntries.reduce((sum, b) => sum + b.amount, 0) -
          fundRecords.reduce((sum, f) => sum + f.amount, 0)
        ).toFixed(2))
      }
    };
  }

  // ==================== AUTO-MATCH ====================

  /**
   * Attempt to match all PENDING capital_activity records against existing bank data.
   * Updates matched records to RECEIVED status.
   * @param {string} fundId - Fund identifier
   * @returns {Object} auto-match results
   */
  autoMatch({ fundId }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId) throw new Error('fundId is required');

    const pendingRecords = db.query(`
      SELECT ca.*, i.name as investor_name
      FROM capital_activity ca
      LEFT JOIN investors i ON ca.investor_id = i.id
      WHERE ca.fund_id = ? AND ca.status = 'PENDING'
      ORDER BY ca.due_date ASC
    `, [fundId]);

    // Look for capital_activity records that have wire_reference and payment_date populated
    // which indicate bank confirmation has been received
    const confirmedRecords = db.query(`
      SELECT * FROM capital_activity
      WHERE fund_id = ? AND status = 'PENDING'
        AND wire_reference IS NOT NULL
        AND payment_date IS NOT NULL
    `, [fundId]);

    const autoMatched = [];
    const stillPending = [];

    for (const record of pendingRecords) {
      const isConfirmed = confirmedRecords.find(cr => cr.id === record.id);
      if (isConfirmed) {
        // Mark as matched/received
        db.update('capital_activity', record.id, { status: 'RECEIVED' });
        autoMatched.push({
          recordId: record.id,
          investorName: record.investor_name,
          amount: record.amount,
          wireReference: record.wire_reference,
          paymentDate: record.payment_date,
          status: 'AUTO_MATCHED'
        });
      } else {
        stillPending.push({
          recordId: record.id,
          investorName: record.investor_name,
          amount: record.amount,
          dueDate: record.due_date,
          status: 'STILL_PENDING'
        });
      }
    }

    db.logAction('RECONCILIATION', fundId, 'AUTO_MATCH', 'mila', {
      totalPending: pendingRecords.length,
      autoMatched: autoMatched.length,
      stillPending: stillPending.length
    });

    return {
      fundId,
      processedAt: new Date().toISOString(),
      totalPending: pendingRecords.length,
      autoMatched: { count: autoMatched.length, items: autoMatched },
      stillPending: { count: stillPending.length, items: stillPending },
      matchRate: pendingRecords.length > 0
        ? parseFloat(((autoMatched.length / pendingRecords.length) * 100).toFixed(2)) + '%'
        : '100%'
    };
  }

  // ==================== RECONCILIATION REPORT ====================

  /**
   * Summary of reconciled vs unreconciled items for a period.
   * @param {string} fundId - Fund identifier
   * @param {string} period - Period in YYYY-MM format
   * @returns {Object} reconciliation report
   */
  getReconciliationReport({ fundId, period }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId) throw new Error('fundId is required');

    const periodStart = period ? `${period}-01` : new Date().toISOString().slice(0, 7) + '-01';
    const periodEnd = this._lastDayOfMonth(periodStart);

    const allActivity = db.query(`
      SELECT * FROM capital_activity
      WHERE fund_id = ? AND due_date >= ? AND due_date <= ?
      ORDER BY due_date ASC
    `, [fundId, periodStart, periodEnd]);

    const reconciled = allActivity.filter(a => a.status === 'RECEIVED' || a.status === 'RECONCILED');
    const unreconciled = allActivity.filter(a => a.status === 'PENDING' || a.status === 'OVERDUE');
    const partial = allActivity.filter(a => a.status === 'PARTIAL');

    const reconciledAmount = reconciled.reduce((sum, r) => sum + r.amount, 0);
    const unreconciledAmount = unreconciled.reduce((sum, r) => sum + r.amount, 0);
    const partialAmount = partial.reduce((sum, r) => sum + r.amount, 0);
    const totalAmount = allActivity.reduce((sum, r) => sum + r.amount, 0);

    // Break down by type
    const byType = {};
    for (const record of allActivity) {
      if (!byType[record.type]) {
        byType[record.type] = { total: 0, reconciled: 0, unreconciled: 0, count: 0 };
      }
      byType[record.type].total += record.amount;
      byType[record.type].count++;
      if (record.status === 'RECEIVED' || record.status === 'RECONCILED') {
        byType[record.type].reconciled += record.amount;
      } else {
        byType[record.type].unreconciled += record.amount;
      }
    }

    // Round amounts in byType
    for (const type of Object.keys(byType)) {
      byType[type].total = parseFloat(byType[type].total.toFixed(2));
      byType[type].reconciled = parseFloat(byType[type].reconciled.toFixed(2));
      byType[type].unreconciled = parseFloat(byType[type].unreconciled.toFixed(2));
    }

    // Aging of unreconciled items
    const aging = this._ageUnreconciled(unreconciled);

    return {
      fundId,
      period: { start: periodStart, end: periodEnd },
      generatedAt: new Date().toISOString(),
      summary: {
        totalRecords: allActivity.length,
        reconciledCount: reconciled.length,
        unreconciledCount: unreconciled.length,
        partialCount: partial.length,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        reconciledAmount: parseFloat(reconciledAmount.toFixed(2)),
        unreconciledAmount: parseFloat(unreconciledAmount.toFixed(2)),
        partialAmount: parseFloat(partialAmount.toFixed(2)),
        reconciliationRate: allActivity.length > 0
          ? parseFloat(((reconciled.length / allActivity.length) * 100).toFixed(2)) + '%'
          : '100%'
      },
      byType,
      aging,
      unreconciledItems: unreconciled.map(u => ({
        id: u.id,
        type: u.type,
        amount: u.amount,
        dueDate: u.due_date,
        investorId: u.investor_id,
        daysPastDue: Math.max(0, Math.floor((new Date() - new Date(u.due_date)) / (1000 * 60 * 60 * 24)))
      }))
    };
  }

  // ==================== PRIVATE HELPERS ====================

  _referenceMatch(bankRef, fundRef) {
    if (!bankRef || !fundRef) return false;
    const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nBank = normalize(bankRef);
    const nFund = normalize(fundRef);
    return nBank === nFund || nBank.includes(nFund) || nFund.includes(nBank);
  }

  _lastDayOfMonth(dateStr) {
    const d = new Date(dateStr);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return lastDay.toISOString().split('T')[0];
  }

  _ageUnreconciled(items) {
    const now = new Date();
    const buckets = { '0-3 days': 0, '4-7 days': 0, '8-30 days': 0, '30+ days': 0 };
    for (const item of items) {
      const days = Math.floor((now - new Date(item.due_date)) / (1000 * 60 * 60 * 24));
      if (days <= 3) buckets['0-3 days']++;
      else if (days <= 7) buckets['4-7 days']++;
      else if (days <= 30) buckets['8-30 days']++;
      else buckets['30+ days']++;
    }
    return buckets;
  }
}

module.exports = new BankReconciliationService();
