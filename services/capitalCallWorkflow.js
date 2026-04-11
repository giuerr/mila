/**
 * Automated Capital Call Workflow
 * End-to-end orchestration: calculate pro-rata → generate notices →
 * send via signature engine → track wire receipts → reconcile → update cap table.
 */

const crypto = require('crypto');
const db = require('../db/database');
const signEngine = require('./signatureEngine');

class CapitalCallWorkflowService {

  /**
   * Execute full capital call workflow
   */
  executeCapitalCall({ fundId, callAmount, purpose, dueDate, sender, callNumber }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId || !callAmount) throw new Error('fundId and callAmount are required');

    const fund = db.findById('funds', fundId);
    if (!fund) throw new Error(`Fund ${fundId} not found`);

    const commitments = db.query(`
      SELECT c.*, i.name as investor_name, i.email as investor_email
      FROM commitments c
      JOIN investors i ON c.investor_id = i.id
      WHERE c.fund_id = ? AND c.status = 'ACTIVE'
    `, [fundId]);

    if (commitments.length === 0) throw new Error('No active commitments for this fund');

    const totalCommitments = commitments.reduce((sum, c) => sum + c.commitment, 0);
    const totalUnfunded = commitments.reduce((sum, c) => sum + (c.commitment - c.called_capital), 0);

    if (callAmount > totalUnfunded) {
      throw new Error(`Call amount (${callAmount}) exceeds total unfunded commitments (${totalUnfunded})`);
    }

    const callId = `CALL-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const callNum = callNumber || (db.query(
      "SELECT MAX(call_number) as max_call FROM capital_activity WHERE fund_id = ? AND type = 'CAPITAL_CALL'",
      [fundId]
    )[0]?.max_call || 0) + 1;

    const dueDateStr = dueDate || this._addDays(new Date(), 10).toISOString().split('T')[0];

    // Step 1: Calculate pro-rata amounts
    const notices = commitments.map(c => {
      const unfunded = c.commitment - c.called_capital;
      const proRataShare = totalCommitments > 0 ? c.commitment / totalCommitments : 0;
      const proRataAmount = Math.min(callAmount * proRataShare, unfunded);

      return {
        investorId: c.investor_id,
        investorName: c.investor_name,
        investorEmail: c.investor_email,
        commitment: c.commitment,
        priorCalled: c.called_capital,
        unfundedBefore: unfunded,
        callAmount: parseFloat(proRataAmount.toFixed(2)),
        proRataShare: parseFloat((proRataShare * 100).toFixed(4)),
        unfundedAfter: parseFloat((unfunded - proRataAmount).toFixed(2)),
        dueDate: dueDateStr
      };
    }).filter(n => n.callAmount > 0);

    // Step 2: Create capital activity records
    const activityRecords = [];
    for (const notice of notices) {
      const actId = `CA-${crypto.randomBytes(6).toString('hex')}`;
      db.insert('capital_activity', {
        id: actId,
        fund_id: fundId,
        investor_id: notice.investorId,
        type: 'CAPITAL_CALL',
        amount: notice.callAmount,
        call_number: callNum,
        purpose: purpose || 'Investment / Operating Expenses',
        due_date: dueDateStr,
        status: 'PENDING'
      });
      activityRecords.push(actId);
    }

    // Step 3: Create signing envelopes for each LP
    const envelopes = [];
    for (const notice of notices) {
      if (!notice.investorEmail) continue;
      try {
        const envelope = signEngine.createEnvelope({
          documents: [{
            id: `DOC-CALL-${callNum}-${notice.investorId}`,
            name: `Capital Call Notice #${callNum} - ${fund.name}`,
            content: Buffer.from(this._generateCallNoticeContent(fund, notice, callNum, purpose, dueDateStr)).toString('base64')
          }],
          signers: [{
            id: notice.investorId,
            name: notice.investorName,
            email: notice.investorEmail,
            order: 1
          }],
          sender: sender || { id: 'MILA', name: 'Mila CFO Agent', email: 'cfo@antoninus.com' },
          metadata: {
            fundName: fund.name,
            documentType: 'CAPITAL_CALL',
            fundId,
            reference: `Call-${callNum}-${notice.investorId}`
          }
        });
        envelopes.push({
          investorId: notice.investorId,
          investorName: notice.investorName,
          envelopeId: envelope.envelopeId,
          signingUrl: envelope.signingLinks?.[0]?.signingUrl
        });
      } catch (e) { /* envelope creation optional */ }
    }

    // Step 4: Update fund called_capital
    const totalCallAmount = notices.reduce((sum, n) => sum + n.callAmount, 0);
    db.update('funds', fundId, {
      called_capital: (fund.called_capital || 0) + totalCallAmount
    });

    // Log the action
    db.logAction('CAPITAL_CALL', callId, 'CAPITAL_CALL_INITIATED', sender?.email || 'mila@antoninus.com', {
      fundId, callNumber: callNum, totalAmount: totalCallAmount, lpCount: notices.length
    });

    return {
      callId,
      callNumber: callNum,
      status: 'INITIATED',
      fund: { id: fund.id, name: fund.name },
      totalCallAmount: parseFloat(totalCallAmount.toFixed(2)),
      dueDate: dueDateStr,
      purpose: purpose || 'Investment / Operating Expenses',
      lpNotices: notices,
      signingEnvelopes: envelopes,
      capitalActivityIds: activityRecords,
      workflow: {
        step1: 'Pro-rata calculation ✓',
        step2: 'Capital activity records created ✓',
        step3: `Signing envelopes created: ${envelopes.length}/${notices.length}`,
        step4: 'Fund called_capital updated ✓',
        step5: 'PENDING — Wire receipts to be tracked',
        step6: 'PENDING — Reconciliation after receipt'
      }
    };
  }

  /**
   * Record wire receipt for a capital call
   */
  recordWireReceipt({ fundId, investorId, callNumber, amount, wireReference, paymentDate }) {
    if (!db.db) throw new Error('Database not initialized');

    const activity = db.query(
      "SELECT * FROM capital_activity WHERE fund_id = ? AND investor_id = ? AND call_number = ? AND type = 'CAPITAL_CALL'",
      [fundId, investorId, callNumber]
    )[0];

    if (!activity) throw new Error('Capital call activity not found');
    if (activity.status === 'RECEIVED') throw new Error('Wire already recorded for this call');

    // Update activity status
    db.run('UPDATE capital_activity SET status = ?, wire_reference = ?, payment_date = ? WHERE id = ?', [
      'RECEIVED', wireReference || null, paymentDate || new Date().toISOString().split('T')[0], activity.id
    ]);

    // Update commitment called_capital
    const commitment = db.query(
      'SELECT * FROM commitments WHERE fund_id = ? AND investor_id = ?',
      [fundId, investorId]
    )[0];
    if (commitment) {
      db.update('commitments', commitment.id, {
        called_capital: (commitment.called_capital || 0) + amount,
        capital_account: (commitment.capital_account || 0) + amount
      });
    }

    db.logAction('CAPITAL_CALL', activity.id, 'WIRE_RECEIVED', 'system', {
      fundId, investorId, callNumber, amount, wireReference
    });

    return {
      status: 'RECEIVED',
      activityId: activity.id,
      fundId,
      investorId,
      callNumber,
      amount,
      wireReference,
      paymentDate: paymentDate || new Date().toISOString().split('T')[0]
    };
  }

  /**
   * Get capital call status dashboard
   */
  getCallStatus({ fundId, callNumber }) {
    if (!db.db) throw new Error('Database not initialized');

    const activities = db.query(`
      SELECT ca.*, i.name as investor_name
      FROM capital_activity ca
      JOIN investors i ON ca.investor_id = i.id
      WHERE ca.fund_id = ? AND ca.call_number = ? AND ca.type = 'CAPITAL_CALL'
      ORDER BY ca.amount DESC
    `, [fundId, callNumber]);

    const totalCalled = activities.reduce((sum, a) => sum + a.amount, 0);
    const totalReceived = activities.filter(a => a.status === 'RECEIVED').reduce((sum, a) => sum + a.amount, 0);
    const pending = activities.filter(a => a.status === 'PENDING');
    const received = activities.filter(a => a.status === 'RECEIVED');

    return {
      fundId,
      callNumber,
      totalCalled,
      totalReceived,
      outstandingAmount: totalCalled - totalReceived,
      collectionRate: totalCalled > 0 ? parseFloat(((totalReceived / totalCalled) * 100).toFixed(1)) : 0,
      lpCount: activities.length,
      received: received.map(a => ({ investorName: a.investor_name, amount: a.amount, wireRef: a.wire_reference, date: a.payment_date })),
      pending: pending.map(a => ({
        investorName: a.investor_name,
        amount: a.amount,
        dueDate: a.due_date,
        daysOverdue: a.due_date ? Math.max(0, Math.floor((Date.now() - new Date(a.due_date).getTime()) / (1000 * 60 * 60 * 24))) : 0
      }))
    };
  }

  // --- Helpers ---

  _generateCallNoticeContent(fund, notice, callNum, purpose, dueDate) {
    return `CAPITAL CALL NOTICE #${callNum}\n\n` +
      `Fund: ${fund.name}\n` +
      `Date: ${new Date().toISOString().split('T')[0]}\n` +
      `Due Date: ${dueDate}\n\n` +
      `Dear ${notice.investorName},\n\n` +
      `Pursuant to the Limited Partnership Agreement, we hereby call the following capital:\n\n` +
      `Commitment: $${notice.commitment.toLocaleString()}\n` +
      `Prior Called: $${notice.priorCalled.toLocaleString()}\n` +
      `This Call: $${notice.callAmount.toLocaleString()}\n` +
      `Pro-Rata Share: ${notice.proRataShare}%\n` +
      `Remaining Unfunded: $${notice.unfundedAfter.toLocaleString()}\n\n` +
      `Purpose: ${purpose || 'Investment / Operating Expenses'}\n\n` +
      `Please remit payment by ${dueDate}.\n`;
  }

  _addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }
}

module.exports = new CapitalCallWorkflowService();
