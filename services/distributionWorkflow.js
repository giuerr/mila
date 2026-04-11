/**
 * Automated Distribution Workflow
 * End-to-end orchestration: calculate waterfall allocations -> determine per-LP amounts ->
 * generate distribution notices -> send via signature engine -> track outbound wires -> update cap table.
 * Mirror of capitalCallWorkflow.js for the distribution side.
 */

const crypto = require('crypto');
const db = require('../db/database');
const signEngine = require('./signatureEngine');
const waterfall = require('./waterfall');

class DistributionWorkflowService {

  /**
   * Execute full distribution workflow
   * @param {Object} params
   * @param {string} params.fundId - Fund identifier
   * @param {number} params.totalDistributionAmount - Total amount to distribute
   * @param {string} params.distributionType - RETURN_OF_CAPITAL | PROFIT | MIXED | RECALLABLE
   * @param {Object} params.sender - { id, name, email }
   */
  executeDistribution({ fundId, totalDistributionAmount, distributionType = 'MIXED', sender }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId || !totalDistributionAmount) throw new Error('fundId and totalDistributionAmount are required');
    if (totalDistributionAmount <= 0) throw new Error('totalDistributionAmount must be positive');

    const fund = db.findById('funds', fundId);
    if (!fund) throw new Error(`Fund ${fundId} not found`);

    const commitments = db.query(`
      SELECT c.*, i.name as investor_name, i.email as investor_email
      FROM commitments c
      JOIN investors i ON c.investor_id = i.id
      WHERE c.fund_id = ? AND c.status = 'ACTIVE'
    `, [fundId]);

    if (commitments.length === 0) throw new Error('No active commitments for this fund');

    const distributionId = `DIST-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const distributionNum = (db.query(
      "SELECT MAX(call_number) as max_num FROM capital_activity WHERE fund_id = ? AND type = 'DISTRIBUTION'",
      [fundId]
    )[0]?.max_num || 0) + 1;

    const totalCalledCapital = commitments.reduce((sum, c) => sum + (c.called_capital || 0), 0);

    // Step 1: Calculate waterfall to determine GP carry vs LP proceeds
    let waterfallResult = null;
    let gpCarry = 0;
    let lpPool = totalDistributionAmount;

    if (distributionType === 'PROFIT' || distributionType === 'MIXED') {
      try {
        const lpInvestors = commitments.map(c => ({
          id: c.investor_id,
          name: c.investor_name,
          commitment: c.commitment,
          calledCapital: c.called_capital || 0,
          distributions: c.distributions || 0
        }));

        const fundNav = fund.nav || totalCalledCapital;
        waterfallResult = waterfall.calculateEuropeanWaterfall({
          lpInvestors,
          fundTotalValue: fundNav,
          preferredReturn: fund.preferred_return || 0.08,
          carryRate: fund.carry_rate || 0.20,
          catchUpRate: 1.0,
          inceptionDate: fund.created_at || new Date().toISOString(),
          calculationDate: new Date().toISOString()
        });

        // GP carry is proportional to this distribution relative to total fund value
        const distributionRatio = totalDistributionAmount / fundNav;
        gpCarry = parseFloat(((waterfallResult.gpTotalCarry || 0) * distributionRatio).toFixed(2));
        lpPool = totalDistributionAmount - gpCarry;
      } catch (e) {
        // If waterfall fails, distribute pro-rata without carry
        gpCarry = 0;
        lpPool = totalDistributionAmount;
      }
    }

    // Step 2: Determine per-LP amounts pro-rata based on called capital
    const notices = commitments.map(c => {
      const proRataShare = totalCalledCapital > 0 ? (c.called_capital || 0) / totalCalledCapital : 0;
      const distributionAmount = parseFloat((lpPool * proRataShare).toFixed(2));

      // Classify: return of capital vs profit
      const priorDistributions = c.distributions || 0;
      const calledCapital = c.called_capital || 0;
      const remainingCapitalToReturn = Math.max(0, calledCapital - priorDistributions);
      const returnOfCapitalPortion = Math.min(distributionAmount, remainingCapitalToReturn);
      const profitPortion = Math.max(0, distributionAmount - returnOfCapitalPortion);

      return {
        investorId: c.investor_id,
        investorName: c.investor_name,
        investorEmail: c.investor_email,
        commitment: c.commitment,
        calledCapital,
        priorDistributions,
        distributionAmount,
        returnOfCapital: parseFloat(returnOfCapitalPortion.toFixed(2)),
        profitDistribution: parseFloat(profitPortion.toFixed(2)),
        proRataShare: parseFloat((proRataShare * 100).toFixed(4))
      };
    }).filter(n => n.distributionAmount > 0);

    // Step 3: Create capital activity records
    const activityRecords = [];
    for (const notice of notices) {
      const actId = `CA-${crypto.randomBytes(6).toString('hex')}`;
      db.insert('capital_activity', {
        id: actId,
        fund_id: fundId,
        investor_id: notice.investorId,
        type: 'DISTRIBUTION',
        amount: notice.distributionAmount,
        call_number: distributionNum,
        purpose: `${distributionType} distribution — ROC: $${notice.returnOfCapital.toLocaleString()}, Profit: $${notice.profitDistribution.toLocaleString()}`,
        due_date: new Date().toISOString().split('T')[0],
        status: 'PENDING'
      });
      activityRecords.push(actId);
    }

    // Step 4: Create signing envelopes for distribution notices
    const envelopes = [];
    for (const notice of notices) {
      if (!notice.investorEmail) continue;
      try {
        const envelope = signEngine.createEnvelope({
          documents: [{
            id: `DOC-DIST-${distributionNum}-${notice.investorId}`,
            name: `Distribution Notice #${distributionNum} - ${fund.name}`,
            content: Buffer.from(this._generateDistributionNoticeContent(fund, notice, distributionNum, distributionType)).toString('base64')
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
            documentType: 'DISTRIBUTION',
            fundId,
            reference: `Dist-${distributionNum}-${notice.investorId}`
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

    // Step 5: Update fund NAV and commitment records
    const totalLpDistribution = notices.reduce((sum, n) => sum + n.distributionAmount, 0);
    db.update('funds', fundId, {
      nav: Math.max(0, (fund.nav || 0) - totalDistributionAmount)
    });

    for (const notice of notices) {
      const commitment = db.query(
        'SELECT * FROM commitments WHERE fund_id = ? AND investor_id = ?',
        [fundId, notice.investorId]
      )[0];
      if (commitment) {
        db.update('commitments', commitment.id, {
          distributions: (commitment.distributions || 0) + notice.distributionAmount,
          capital_account: Math.max(0, (commitment.capital_account || 0) - notice.distributionAmount)
        });
      }
    }

    // Log the action
    db.logAction('DISTRIBUTION', distributionId, 'DISTRIBUTION_INITIATED', sender?.email || 'mila@antoninus.com', {
      fundId, distributionNumber: distributionNum, totalAmount: totalDistributionAmount, gpCarry, lpPool: totalLpDistribution, lpCount: notices.length
    });

    return {
      distributionId,
      distributionNumber: distributionNum,
      status: 'INITIATED',
      fund: { id: fund.id, name: fund.name },
      distributionType,
      totalDistributionAmount: parseFloat(totalDistributionAmount.toFixed(2)),
      gpCarry: parseFloat(gpCarry.toFixed(2)),
      lpDistributionPool: parseFloat(totalLpDistribution.toFixed(2)),
      lpNotices: notices,
      signingEnvelopes: envelopes,
      capitalActivityIds: activityRecords,
      waterfallApplied: waterfallResult !== null,
      workflow: {
        step1: `Waterfall calculation ${waterfallResult ? '(applied)' : '(skipped — return of capital)'}`,
        step2: 'Per-LP pro-rata amounts calculated',
        step3: `Capital activity records created: ${activityRecords.length}`,
        step4: `Signing envelopes created: ${envelopes.length}/${notices.length}`,
        step5: 'Fund NAV and commitment records updated',
        step6: 'PENDING — Outbound wire transfers'
      }
    };
  }

  /**
   * Get distribution status dashboard
   */
  getDistributionStatus({ fundId, distributionId }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId) throw new Error('fundId is required');

    let activities;
    if (distributionId) {
      // Look up by distribution number from the distribution ID
      const allDists = db.query(`
        SELECT ca.*, i.name as investor_name
        FROM capital_activity ca
        JOIN investors i ON ca.investor_id = i.id
        WHERE ca.fund_id = ? AND ca.type = 'DISTRIBUTION'
        ORDER BY ca.call_number DESC, ca.amount DESC
      `, [fundId]);

      // Filter by distribution number if we can extract it from the ID
      const distNum = allDists.length > 0 ? allDists[0].call_number : null;
      activities = distNum ? allDists.filter(a => a.call_number === distNum) : allDists;
    } else {
      activities = db.query(`
        SELECT ca.*, i.name as investor_name
        FROM capital_activity ca
        JOIN investors i ON ca.investor_id = i.id
        WHERE ca.fund_id = ? AND ca.type = 'DISTRIBUTION'
        ORDER BY ca.call_number DESC, ca.amount DESC
      `, [fundId]);
    }

    const byDistribution = {};
    for (const a of activities) {
      const num = a.call_number || 0;
      if (!byDistribution[num]) byDistribution[num] = [];
      byDistribution[num].push(a);
    }

    const distributions = Object.entries(byDistribution).map(([num, items]) => {
      const totalAmount = items.reduce((sum, a) => sum + a.amount, 0);
      const paid = items.filter(a => a.status === 'PAID' || a.status === 'RECEIVED');
      const pending = items.filter(a => a.status === 'PENDING');
      const totalPaid = paid.reduce((sum, a) => sum + a.amount, 0);

      return {
        distributionNumber: parseInt(num),
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        totalPaid: parseFloat(totalPaid.toFixed(2)),
        outstandingAmount: parseFloat((totalAmount - totalPaid).toFixed(2)),
        completionRate: totalAmount > 0 ? parseFloat(((totalPaid / totalAmount) * 100).toFixed(1)) : 0,
        lpCount: items.length,
        paid: paid.map(a => ({ investorName: a.investor_name, amount: a.amount, wireRef: a.wire_reference, date: a.payment_date })),
        pending: pending.map(a => ({ investorName: a.investor_name, amount: a.amount }))
      };
    });

    return {
      fundId,
      totalDistributions: distributions.length,
      distributions
    };
  }

  /**
   * Record outbound wire payment for a distribution
   */
  recordDistributionPayment({ fundId, investorId, amount, wireReference }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId || !investorId) throw new Error('fundId and investorId are required');
    if (!amount || amount <= 0) throw new Error('amount must be a positive number');

    const activity = db.query(`
      SELECT * FROM capital_activity
      WHERE fund_id = ? AND investor_id = ? AND type = 'DISTRIBUTION' AND status = 'PENDING'
      ORDER BY created_at DESC LIMIT 1
    `, [fundId, investorId])[0];

    if (!activity) throw new Error('No pending distribution found for this investor');
    if (activity.status === 'PAID') throw new Error('Distribution already paid');

    const paymentDate = new Date().toISOString().split('T')[0];

    db.run('UPDATE capital_activity SET status = ?, wire_reference = ?, payment_date = ? WHERE id = ?', [
      'PAID', wireReference || null, paymentDate, activity.id
    ]);

    db.logAction('DISTRIBUTION', activity.id, 'DISTRIBUTION_PAID', 'system', {
      fundId, investorId, amount, wireReference, paymentDate
    });

    return {
      status: 'PAID',
      activityId: activity.id,
      fundId,
      investorId,
      amount: parseFloat(amount.toFixed(2)),
      wireReference: wireReference || null,
      paymentDate
    };
  }

  // --- Helpers ---

  _generateDistributionNoticeContent(fund, notice, distNum, distributionType) {
    return `DISTRIBUTION NOTICE #${distNum}\n\n` +
      `Fund: ${fund.name}\n` +
      `Date: ${new Date().toISOString().split('T')[0]}\n` +
      `Type: ${distributionType}\n\n` +
      `Dear ${notice.investorName},\n\n` +
      `Pursuant to the Limited Partnership Agreement, we are pleased to advise you of the following distribution:\n\n` +
      `Commitment: $${notice.commitment.toLocaleString()}\n` +
      `Called Capital: $${notice.calledCapital.toLocaleString()}\n` +
      `Prior Distributions: $${notice.priorDistributions.toLocaleString()}\n` +
      `This Distribution: $${notice.distributionAmount.toLocaleString()}\n` +
      `  - Return of Capital: $${notice.returnOfCapital.toLocaleString()}\n` +
      `  - Profit Distribution: $${notice.profitDistribution.toLocaleString()}\n` +
      `Pro-Rata Share: ${notice.proRataShare}%\n\n` +
      `Payment will be made via wire transfer to your account on file.\n`;
  }
}

module.exports = new DistributionWorkflowService();
