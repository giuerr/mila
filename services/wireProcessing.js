/**
 * Wire / Payment Processing Service
 * Capital call wire tracking, distribution payments, default management,
 * maker-checker controls, in-kind distribution support.
 */

class WireProcessingService {

  /**
   * Generate capital call notices with per-LP amounts
   */
  generateCapitalCallNotices({
    fundId,
    callAmount,
    callDate,
    dueDate,
    purpose,
    investors,
    excusedInvestors = [],
    defaultedInvestors = []
  }) {
    // Remove excused and defaulted investors
    const eligibleInvestors = investors.filter(lp =>
      !excusedInvestors.includes(lp.id) && !defaultedInvestors.includes(lp.id)
    );

    const totalUnfunded = eligibleInvestors.reduce((sum, lp) => sum + lp.unfundedCommitment, 0);

    const notices = eligibleInvestors.map(lp => {
      const proRataShare = lp.unfundedCommitment / totalUnfunded;
      const callAmountForLp = callAmount * proRataShare;

      return {
        investorId: lp.id,
        investorName: lp.name,
        commitment: lp.commitment,
        unfundedCommitment: lp.unfundedCommitment,
        proRataShare: parseFloat((proRataShare * 100).toFixed(4)),
        callAmount: parseFloat(callAmountForLp.toFixed(2)),
        callCurrency: lp.commitmentCurrency || 'USD',
        dueDate,
        wireInstructions: lp.wireInstructions || 'See attached',
        status: 'NOTICE_SENT'
      };
    });

    return {
      fundId,
      callId: `CC-${Date.now()}`,
      totalCallAmount: callAmount,
      callDate,
      dueDate,
      purpose,
      noticePeriodDays: this._daysBetween(callDate, dueDate),
      eligibleInvestors: eligibleInvestors.length,
      excusedInvestors: excusedInvestors.length,
      defaultedInvestors: defaultedInvestors.length,
      notices,
      totalNoticed: notices.reduce((sum, n) => sum + n.callAmount, 0)
    };
  }

  /**
   * Track incoming capital call wires
   */
  trackCapitalCallReceipts(callId, notices, receivedWires) {
    const tracking = notices.map(notice => {
      const wire = receivedWires.find(w => w.investorId === notice.investorId);
      const received = wire ? wire.amount : 0;
      const difference = received - notice.callAmount;

      let status;
      if (!wire) status = 'NOT_RECEIVED';
      else if (Math.abs(difference) <= 0.01) status = 'RECEIVED_FULL';
      else if (received > 0 && received < notice.callAmount) status = 'PARTIAL_PAYMENT';
      else if (received > notice.callAmount) status = 'OVERPAYMENT';
      else status = 'RECEIVED_FULL';

      return {
        investorId: notice.investorId,
        investorName: notice.investorName,
        expectedAmount: notice.callAmount,
        receivedAmount: received,
        difference: parseFloat(difference.toFixed(2)),
        status,
        receivedDate: wire?.date || null,
        wireReference: wire?.reference || null,
        daysFromDue: wire ? this._daysBetween(notice.dueDate, wire.date) : null
      };
    });

    const totalExpected = notices.reduce((sum, n) => sum + n.callAmount, 0);
    const totalReceived = tracking.reduce((sum, t) => sum + t.receivedAmount, 0);

    return {
      callId,
      totalExpected: parseFloat(totalExpected.toFixed(2)),
      totalReceived: parseFloat(totalReceived.toFixed(2)),
      outstanding: parseFloat((totalExpected - totalReceived).toFixed(2)),
      collectionRate: parseFloat(((totalReceived / totalExpected) * 100).toFixed(2)) + '%',
      tracking,
      unpaid: tracking.filter(t => t.status === 'NOT_RECEIVED'),
      partialPayments: tracking.filter(t => t.status === 'PARTIAL_PAYMENT'),
      overdueCount: tracking.filter(t => t.status === 'NOT_RECEIVED' && new Date() > new Date(notices[0]?.dueDate)).length
    };
  }

  /**
   * Process LP default
   */
  processDefault({ investor, callAmount, lpaDefaultProvisions }) {
    const penaltyInterest = callAmount * (lpaDefaultProvisions.penaltyRate || 0.18) *
      (lpaDefaultProvisions.curePeriodDays / 365);
    const forfeitureAmount = investor.capitalAccount * (lpaDefaultProvisions.forfeiturePercent || 0.50);

    return {
      investorId: investor.id,
      investorName: investor.name,
      defaultedAmount: callAmount,
      curePeriodDays: lpaDefaultProvisions.curePeriodDays || 10,
      cureDeadline: this._addDays(new Date(), lpaDefaultProvisions.curePeriodDays || 10),
      penalties: {
        penaltyInterestRate: (lpaDefaultProvisions.penaltyRate || 0.18) * 100 + '%',
        penaltyInterestAmount: parseFloat(penaltyInterest.toFixed(2)),
        forfeiturePercent: (lpaDefaultProvisions.forfeiturePercent || 0.50) * 100 + '%',
        forfeitureAmount: parseFloat(forfeitureAmount.toFixed(2))
      },
      remedies: [
        'Charge penalty interest at default rate',
        `Forfeiture of ${(lpaDefaultProvisions.forfeiturePercent || 0.50) * 100}% of capital account`,
        'Suspension of voting rights',
        'Forced transfer of interest at discounted value',
        'Reallocation of unfunded commitment to non-defaulting LPs'
      ],
      reallocation: {
        unfundedToReallocate: investor.unfundedCommitment,
        method: 'Pro-rata to non-defaulting LPs based on unfunded commitments'
      },
      status: 'DEFAULT_NOTICE_ISSUED'
    };
  }

  /**
   * Generate distribution payment instructions
   */
  generateDistributionPayments({ fundId, distributions, investors }) {
    const payments = [];

    for (const dist of distributions) {
      const lp = investors.find(i => i.id === dist.investorId);
      if (!lp) continue;

      payments.push({
        paymentId: `DIST-${Date.now()}-${dist.investorId}`,
        investorId: dist.investorId,
        investorName: lp.name,
        grossAmount: dist.grossAmount,
        withholdingTax: dist.withholdingTax || 0,
        netAmount: parseFloat((dist.grossAmount - (dist.withholdingTax || 0)).toFixed(2)),
        currency: dist.currency || 'USD',
        bankName: lp.bankDetails?.bankName,
        accountNumber: lp.bankDetails?.accountNumber,
        swiftCode: lp.bankDetails?.swiftCode,
        aba: lp.bankDetails?.abaNumber,
        beneficiary: lp.bankDetails?.beneficiaryName,
        reference: `${fundId}-DIST-${dist.investorId}`,
        status: 'PENDING_APPROVAL',
        approvals: {
          maker: null,
          checker: null,
          seniorApproval: dist.grossAmount > 1000000 ? null : 'NOT_REQUIRED'
        }
      });
    }

    return {
      fundId,
      distributionDate: new Date().toISOString().split('T')[0],
      totalGross: payments.reduce((sum, p) => sum + p.grossAmount, 0),
      totalWithholding: payments.reduce((sum, p) => sum + p.withholdingTax, 0),
      totalNet: payments.reduce((sum, p) => sum + p.netAmount, 0),
      paymentCount: payments.length,
      payments,
      pendingApproval: payments.filter(p => p.status === 'PENDING_APPROVAL').length,
      requiresSeniorApproval: payments.some(p => p.approvals.seniorApproval === null)
    };
  }

  // --- Private ---

  _daysBetween(start, end) {
    return Math.floor((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24));
  }

  _addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }
}

module.exports = new WireProcessingService();
