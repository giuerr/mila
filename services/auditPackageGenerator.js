/**
 * Audit Package Generator Service
 * One-click comprehensive audit export: fund summary, trial balance,
 * capital account statements, investment schedule, fee summary,
 * side letter inventory, compliance status, and audit trail.
 */

const db = require('../db/database');

class AuditPackageGeneratorService {

  // ==================== STRUCTURED JSON EXPORT ====================

  /**
   * Compile comprehensive audit package from DB for a fiscal year.
   * @param {string} fundId - Fund identifier
   * @param {number} fiscalYear - Fiscal year (e.g. 2025)
   * @returns {Object} Structured audit package with all sections
   */
  generate({ fundId, fiscalYear }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId) throw new Error('fundId is required');
    if (!fiscalYear) throw new Error('fiscalYear is required');

    const fiscalStart = `${fiscalYear}-01-01`;
    const fiscalEnd = `${fiscalYear}-12-31`;

    const fund = db.findById('funds', fundId);
    if (!fund) throw new Error(`Fund ${fundId} not found`);

    return {
      metadata: {
        fundId,
        fundName: fund.name,
        fiscalYear,
        periodStart: fiscalStart,
        periodEnd: fiscalEnd,
        generatedAt: new Date().toISOString(),
        generatedBy: 'Mila — Finance Principal'
      },
      sections: {
        fundSummary: this._buildFundSummary(fund),
        trialBalance: this._buildTrialBalance(fundId, fiscalStart, fiscalEnd),
        capitalAccountStatements: this._buildCapitalAccountStatements(fundId, fiscalStart, fiscalEnd),
        investmentSchedule: this._buildInvestmentSchedule(fundId, fiscalEnd),
        feeCalculationSummary: this._buildFeeCalculationSummary(fundId, fund, fiscalStart, fiscalEnd),
        sideLetterInventory: this._buildSideLetterInventory(fundId),
        complianceCalendarStatus: this._buildComplianceCalendarStatus(fundId, fiscalYear),
        auditTrail: this._buildAuditTrail(fundId, fiscalStart, fiscalEnd)
      }
    };
  }

  // ==================== HTML EXPORT ====================

  /**
   * Generate formatted HTML audit package suitable for PDF export.
   * @param {string} fundId - Fund identifier
   * @param {number} fiscalYear - Fiscal year
   * @returns {string} HTML document
   */
  generateHtml({ fundId, fiscalYear }) {
    const pkg = this.generate({ fundId, fiscalYear });
    const m = pkg.metadata;
    const s = pkg.sections;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Audit Package — ${this._esc(m.fundName)} — FY${m.fiscalYear}</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 40px; color: #1a1a1a; font-size: 13px; line-height: 1.5; }
    h1 { font-size: 22px; border-bottom: 2px solid #1a1a1a; padding-bottom: 8px; }
    h2 { font-size: 16px; color: #333; margin-top: 32px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    h3 { font-size: 14px; color: #555; margin-top: 20px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    tr:nth-child(even) { background: #fafafa; }
    .amount { text-align: right; font-family: 'Courier New', monospace; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }
    .summary-item { padding: 8px; background: #f9f9f9; border: 1px solid #eee; }
    .summary-label { font-weight: 600; font-size: 11px; color: #666; text-transform: uppercase; }
    .summary-value { font-size: 16px; margin-top: 2px; }
    .footer { margin-top: 40px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 8px; }
  </style>
</head>
<body>
  <h1>Audit Package</h1>
  <p><strong>${this._esc(m.fundName)}</strong> | Fiscal Year ${m.fiscalYear} | ${m.periodStart} to ${m.periodEnd}</p>
  <p>Generated: ${m.generatedAt} by ${m.generatedBy}</p>

  ${this._renderFundSummaryHtml(s.fundSummary)}
  ${this._renderTrialBalanceHtml(s.trialBalance)}
  ${this._renderCapitalAccountsHtml(s.capitalAccountStatements)}
  ${this._renderInvestmentScheduleHtml(s.investmentSchedule)}
  ${this._renderFeeSummaryHtml(s.feeCalculationSummary)}
  ${this._renderSideLetterHtml(s.sideLetterInventory)}
  ${this._renderComplianceHtml(s.complianceCalendarStatus)}
  ${this._renderAuditTrailHtml(s.auditTrail)}

  <div class="footer">
    This audit package was generated automatically by Mila (Antoninus Global SPC).
    All figures are unaudited and subject to year-end adjustments.
  </div>
</body>
</html>`;
  }

  // ==================== SECTION BUILDERS ====================

  _buildFundSummary(fund) {
    return {
      name: fund.name,
      jurisdiction: fund.jurisdiction,
      vehicleType: fund.vehicle_type,
      vintageYear: fund.vintage_year,
      totalCommitments: fund.total_commitments,
      calledCapital: fund.called_capital,
      nav: fund.nav,
      mgmtFeeRate: fund.mgmt_fee_rate,
      carryRate: fund.carry_rate,
      preferredReturn: fund.preferred_return,
      investmentPeriodEnd: fund.investment_period_end,
      fundTermEnd: fund.fund_term_end,
      status: fund.status
    };
  }

  _buildTrialBalance(fundId, fiscalStart, fiscalEnd) {
    // Capital activity aggregates
    const capitalActivity = db.query(`
      SELECT type, SUM(amount) as total, COUNT(*) as count
      FROM capital_activity
      WHERE fund_id = ? AND created_at >= ? AND created_at <= ?
      GROUP BY type
    `, [fundId, fiscalStart, fiscalEnd]);

    // Investment cost and fair value totals
    const investments = db.query(`
      SELECT
        SUM(cost_basis) as total_cost,
        SUM(fair_value) as total_fair_value,
        COUNT(*) as count
      FROM investments
      WHERE fund_id = ? AND status IN ('ACTIVE', 'PARTIALLY_REALIZED')
    `, [fundId]);

    // Fees — estimate from fund-level data
    const fund = db.findById('funds', fundId);
    const mgmtFeeEstimate = (fund.called_capital || 0) * (fund.mgmt_fee_rate || 0.02);

    const capitalCalls = capitalActivity.find(a => a.type === 'CAPITAL_CALL') || { total: 0, count: 0 };
    const distributions = capitalActivity.find(a => a.type === 'DISTRIBUTION') || { total: 0, count: 0 };

    const investmentData = investments[0] || { total_cost: 0, total_fair_value: 0, count: 0 };
    const unrealizedGainLoss = (investmentData.total_fair_value || 0) - (investmentData.total_cost || 0);

    return {
      period: { start: fiscalStart, end: fiscalEnd },
      assets: {
        investmentsAtCost: parseFloat((investmentData.total_cost || 0).toFixed(2)),
        investmentsAtFairValue: parseFloat((investmentData.total_fair_value || 0).toFixed(2)),
        unrealizedGainLoss: parseFloat(unrealizedGainLoss.toFixed(2)),
        cashAndEquivalents: parseFloat(((fund.called_capital || 0) - (investmentData.total_cost || 0)).toFixed(2)),
        totalAssets: parseFloat(((fund.called_capital || 0) + unrealizedGainLoss).toFixed(2))
      },
      liabilities: {
        managementFeesPayable: parseFloat(mgmtFeeEstimate.toFixed(2)),
        carriedInterestPayable: 0,
        otherLiabilities: 0,
        totalLiabilities: parseFloat(mgmtFeeEstimate.toFixed(2))
      },
      partnersCapital: {
        capitalContributions: parseFloat((capitalCalls.total || 0).toFixed(2)),
        distributionsPaid: parseFloat((distributions.total || 0).toFixed(2)),
        netIncome: parseFloat(unrealizedGainLoss.toFixed(2)),
        totalPartnersCapital: parseFloat(((capitalCalls.total || 0) - (distributions.total || 0) + unrealizedGainLoss).toFixed(2))
      },
      activity: capitalActivity.map(a => ({
        type: a.type,
        total: parseFloat((a.total || 0).toFixed(2)),
        count: a.count
      }))
    };
  }

  _buildCapitalAccountStatements(fundId, fiscalStart, fiscalEnd) {
    const commitments = db.query(`
      SELECT c.*, i.name as investor_name, i.entity_type
      FROM commitments c
      JOIN investors i ON c.investor_id = i.id
      WHERE c.fund_id = ?
    `, [fundId]);

    return commitments.map(c => {
      const activity = db.query(`
        SELECT type, SUM(amount) as total, COUNT(*) as count
        FROM capital_activity
        WHERE fund_id = ? AND investor_id = ? AND created_at >= ? AND created_at <= ?
        GROUP BY type
      `, [fundId, c.investor_id, fiscalStart, fiscalEnd]);

      const periodCalls = (activity.find(a => a.type === 'CAPITAL_CALL') || { total: 0 }).total;
      const periodDist = (activity.find(a => a.type === 'DISTRIBUTION') || { total: 0 }).total;

      return {
        investorId: c.investor_id,
        investorName: c.investor_name,
        entityType: c.entity_type,
        commitment: c.commitment,
        openingBalance: parseFloat((c.capital_account - periodCalls + periodDist).toFixed(2)),
        periodContributions: parseFloat((periodCalls || 0).toFixed(2)),
        periodDistributions: parseFloat((periodDist || 0).toFixed(2)),
        allocationOfIncome: 0, // Placeholder — requires full allocation engine
        closingBalance: parseFloat((c.capital_account || 0).toFixed(2)),
        unfundedCommitment: parseFloat(((c.commitment || 0) - (c.called_capital || 0)).toFixed(2)),
        ownershipPercentage: 0 // Calculated below
      };
    }).map((stmt, _i, arr) => {
      const totalClosing = arr.reduce((sum, s) => sum + s.closingBalance, 0);
      stmt.ownershipPercentage = totalClosing > 0
        ? parseFloat(((stmt.closingBalance / totalClosing) * 100).toFixed(4))
        : 0;
      return stmt;
    });
  }

  _buildInvestmentSchedule(fundId, fiscalEnd) {
    const investments = db.query(`
      SELECT * FROM investments
      WHERE fund_id = ?
      ORDER BY investment_date ASC
    `, [fundId]);

    const schedule = investments.map(inv => {
      const costBasis = inv.cost_basis || 0;
      const fairValue = inv.fair_value || 0;
      const gainLoss = fairValue - costBasis;
      const moic = costBasis > 0 ? fairValue / costBasis : 0;

      return {
        investmentId: inv.id,
        companyName: inv.company_name,
        sector: inv.sector,
        geography: inv.geography,
        investmentDate: inv.investment_date,
        costBasis: parseFloat(costBasis.toFixed(2)),
        fairValue: parseFloat(fairValue.toFixed(2)),
        fairValueLevel: inv.fair_value_level,
        valuationMethod: inv.valuation_method,
        unrealizedGainLoss: parseFloat(gainLoss.toFixed(2)),
        moic: parseFloat(moic.toFixed(4)),
        status: inv.status,
        exitDate: inv.exit_date,
        exitProceeds: inv.exit_proceeds ? parseFloat(inv.exit_proceeds.toFixed(2)) : null
      };
    });

    const totalCost = schedule.reduce((sum, s) => sum + s.costBasis, 0);
    const totalFV = schedule.reduce((sum, s) => sum + s.fairValue, 0);
    const totalGainLoss = totalFV - totalCost;

    return {
      asOfDate: fiscalEnd,
      investments: schedule,
      totals: {
        numberOfInvestments: schedule.length,
        activeInvestments: schedule.filter(s => s.status === 'ACTIVE').length,
        realizedInvestments: schedule.filter(s => s.status === 'FULLY_REALIZED').length,
        totalCostBasis: parseFloat(totalCost.toFixed(2)),
        totalFairValue: parseFloat(totalFV.toFixed(2)),
        totalUnrealizedGainLoss: parseFloat(totalGainLoss.toFixed(2)),
        portfolioMoic: totalCost > 0 ? parseFloat((totalFV / totalCost).toFixed(4)) : 0
      }
    };
  }

  _buildFeeCalculationSummary(fundId, fund, fiscalStart, fiscalEnd) {
    const calledCapital = fund.called_capital || 0;
    const mgmtFeeRate = fund.mgmt_fee_rate || 0.02;
    const carryRate = fund.carry_rate || 0.20;
    const prefReturn = fund.preferred_return || 0.08;

    const annualMgmtFee = calledCapital * mgmtFeeRate;

    // Estimate carried interest from investment performance
    const investments = db.query(`
      SELECT SUM(cost_basis) as total_cost, SUM(fair_value) as total_fv
      FROM investments WHERE fund_id = ? AND status IN ('ACTIVE', 'PARTIALLY_REALIZED')
    `, [fundId]);

    const totalCost = (investments[0] || {}).total_cost || 0;
    const totalFV = (investments[0] || {}).total_fv || 0;
    const totalGain = Math.max(0, totalFV - totalCost);
    const hurdleAmount = calledCapital * prefReturn;
    const carryEligibleGain = Math.max(0, totalGain - hurdleAmount);
    const estimatedCarry = carryEligibleGain * carryRate;

    return {
      period: { start: fiscalStart, end: fiscalEnd },
      managementFee: {
        feeBase: parseFloat(calledCapital.toFixed(2)),
        rate: mgmtFeeRate,
        annualFee: parseFloat(annualMgmtFee.toFixed(2)),
        fundStage: fund.investment_period_end && new Date(fund.investment_period_end) < new Date()
          ? 'post_investment' : 'investment_period'
      },
      carriedInterest: {
        totalGain: parseFloat(totalGain.toFixed(2)),
        preferredReturn: prefReturn,
        hurdleAmount: parseFloat(hurdleAmount.toFixed(2)),
        carryRate,
        carryEligibleGain: parseFloat(carryEligibleGain.toFixed(2)),
        estimatedCarry: parseFloat(estimatedCarry.toFixed(2)),
        note: 'Estimate only — final carry subject to waterfall calculation at distribution'
      },
      totalFees: parseFloat((annualMgmtFee + estimatedCarry).toFixed(2))
    };
  }

  _buildSideLetterInventory(fundId) {
    const sideLetters = db.query(`
      SELECT sl.*, i.name as investor_name, i.entity_type
      FROM side_letters sl
      JOIN investors i ON sl.investor_id = i.id
      WHERE sl.fund_id = ?
    `, [fundId]);

    return {
      count: sideLetters.length,
      letters: sideLetters.map(sl => ({
        id: sl.id,
        investorName: sl.investor_name,
        entityType: sl.entity_type,
        provisions: this._safeParse(sl.provisions, []),
        mfnEligible: !!sl.mfn_eligible,
        executionDate: sl.execution_date
      }))
    };
  }

  _buildComplianceCalendarStatus(fundId, fiscalYear) {
    const filings = db.query(`
      SELECT * FROM filings
      WHERE fund_id = ? AND deadline >= ? AND deadline <= ?
      ORDER BY deadline ASC
    `, [fundId, `${fiscalYear}-01-01`, `${fiscalYear}-12-31`]);

    const filed = filings.filter(f => f.status === 'FILED' || f.status === 'CONFIRMED');
    const pending = filings.filter(f => f.status !== 'FILED' && f.status !== 'CONFIRMED');

    return {
      fiscalYear,
      totalFilings: filings.length,
      filed: filed.length,
      pending: pending.length,
      complianceRate: filings.length > 0
        ? parseFloat(((filed.length / filings.length) * 100).toFixed(2)) + '%'
        : '100%',
      filings: filings.map(f => ({
        id: f.id,
        name: f.name,
        type: f.filing_type,
        jurisdiction: f.jurisdiction,
        deadline: f.deadline,
        status: f.status,
        filedDate: f.filed_date,
        owner: f.owner
      }))
    };
  }

  _buildAuditTrail(fundId, fiscalStart, fiscalEnd) {
    const logs = db.query(`
      SELECT * FROM audit_log
      WHERE entity_id = ? AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `, [fundId, fiscalStart, fiscalEnd]);

    return {
      totalEntries: logs.length,
      entries: logs.map(l => ({
        id: l.id,
        entityType: l.entity_type,
        entityId: l.entity_id,
        action: l.action,
        performedBy: l.performed_by,
        details: this._safeParse(l.details, l.details),
        timestamp: l.timestamp
      }))
    };
  }

  // ==================== HTML RENDERERS ====================

  _renderFundSummaryHtml(summary) {
    return `
  <h2>1. Fund Summary</h2>
  <div class="summary-grid">
    <div class="summary-item"><div class="summary-label">Fund Name</div><div class="summary-value">${this._esc(summary.name)}</div></div>
    <div class="summary-item"><div class="summary-label">Jurisdiction</div><div class="summary-value">${this._esc(summary.jurisdiction || 'N/A')}</div></div>
    <div class="summary-item"><div class="summary-label">Vehicle Type</div><div class="summary-value">${this._esc(summary.vehicleType || 'N/A')}</div></div>
    <div class="summary-item"><div class="summary-label">Vintage Year</div><div class="summary-value">${summary.vintageYear || 'N/A'}</div></div>
    <div class="summary-item"><div class="summary-label">Total Commitments</div><div class="summary-value">${this._fmt(summary.totalCommitments)}</div></div>
    <div class="summary-item"><div class="summary-label">Called Capital</div><div class="summary-value">${this._fmt(summary.calledCapital)}</div></div>
    <div class="summary-item"><div class="summary-label">NAV</div><div class="summary-value">${this._fmt(summary.nav)}</div></div>
    <div class="summary-item"><div class="summary-label">Status</div><div class="summary-value">${this._esc(summary.status)}</div></div>
  </div>`;
  }

  _renderTrialBalanceHtml(tb) {
    return `
  <h2>2. Trial Balance</h2>
  <h3>Assets</h3>
  <table>
    <tr><th>Item</th><th class="amount">Amount</th></tr>
    <tr><td>Investments at Cost</td><td class="amount">${this._fmt(tb.assets.investmentsAtCost)}</td></tr>
    <tr><td>Investments at Fair Value</td><td class="amount">${this._fmt(tb.assets.investmentsAtFairValue)}</td></tr>
    <tr><td>Unrealized Gain/(Loss)</td><td class="amount">${this._fmt(tb.assets.unrealizedGainLoss)}</td></tr>
    <tr><td>Cash and Equivalents</td><td class="amount">${this._fmt(tb.assets.cashAndEquivalents)}</td></tr>
    <tr><th>Total Assets</th><th class="amount">${this._fmt(tb.assets.totalAssets)}</th></tr>
  </table>
  <h3>Liabilities</h3>
  <table>
    <tr><th>Item</th><th class="amount">Amount</th></tr>
    <tr><td>Management Fees Payable</td><td class="amount">${this._fmt(tb.liabilities.managementFeesPayable)}</td></tr>
    <tr><td>Carried Interest Payable</td><td class="amount">${this._fmt(tb.liabilities.carriedInterestPayable)}</td></tr>
    <tr><th>Total Liabilities</th><th class="amount">${this._fmt(tb.liabilities.totalLiabilities)}</th></tr>
  </table>
  <h3>Partners' Capital</h3>
  <table>
    <tr><th>Item</th><th class="amount">Amount</th></tr>
    <tr><td>Capital Contributions</td><td class="amount">${this._fmt(tb.partnersCapital.capitalContributions)}</td></tr>
    <tr><td>Distributions Paid</td><td class="amount">${this._fmt(tb.partnersCapital.distributionsPaid)}</td></tr>
    <tr><td>Net Income</td><td class="amount">${this._fmt(tb.partnersCapital.netIncome)}</td></tr>
    <tr><th>Total Partners' Capital</th><th class="amount">${this._fmt(tb.partnersCapital.totalPartnersCapital)}</th></tr>
  </table>`;
  }

  _renderCapitalAccountsHtml(statements) {
    if (!statements.length) return '<h2>3. Capital Account Statements</h2><p>No investors found.</p>';
    const rows = statements.map(s => `
    <tr>
      <td>${this._esc(s.investorName)}</td>
      <td class="amount">${this._fmt(s.commitment)}</td>
      <td class="amount">${this._fmt(s.openingBalance)}</td>
      <td class="amount">${this._fmt(s.periodContributions)}</td>
      <td class="amount">${this._fmt(s.periodDistributions)}</td>
      <td class="amount">${this._fmt(s.closingBalance)}</td>
      <td class="amount">${s.ownershipPercentage}%</td>
    </tr>`).join('');

    return `
  <h2>3. Capital Account Statements</h2>
  <table>
    <tr><th>Investor</th><th class="amount">Commitment</th><th class="amount">Opening</th><th class="amount">Contributions</th><th class="amount">Distributions</th><th class="amount">Closing</th><th class="amount">Ownership %</th></tr>
    ${rows}
  </table>`;
  }

  _renderInvestmentScheduleHtml(schedule) {
    if (!schedule.investments.length) return '<h2>4. Investment Schedule</h2><p>No investments found.</p>';
    const rows = schedule.investments.map(inv => `
    <tr>
      <td>${this._esc(inv.companyName)}</td>
      <td>${this._esc(inv.sector || 'N/A')}</td>
      <td>${inv.investmentDate || 'N/A'}</td>
      <td class="amount">${this._fmt(inv.costBasis)}</td>
      <td class="amount">${this._fmt(inv.fairValue)}</td>
      <td class="amount">${this._fmt(inv.unrealizedGainLoss)}</td>
      <td class="amount">${inv.moic}x</td>
      <td>${inv.status}</td>
    </tr>`).join('');

    return `
  <h2>4. Investment Schedule</h2>
  <table>
    <tr><th>Company</th><th>Sector</th><th>Date</th><th class="amount">Cost</th><th class="amount">Fair Value</th><th class="amount">Gain/(Loss)</th><th class="amount">MOIC</th><th>Status</th></tr>
    ${rows}
  </table>
  <p><strong>Total Cost:</strong> ${this._fmt(schedule.totals.totalCostBasis)} | <strong>Total Fair Value:</strong> ${this._fmt(schedule.totals.totalFairValue)} | <strong>Portfolio MOIC:</strong> ${schedule.totals.portfolioMoic}x</p>`;
  }

  _renderFeeSummaryHtml(fees) {
    return `
  <h2>5. Fee Calculation Summary</h2>
  <h3>Management Fee</h3>
  <table>
    <tr><th>Item</th><th class="amount">Value</th></tr>
    <tr><td>Fee Base (Called Capital)</td><td class="amount">${this._fmt(fees.managementFee.feeBase)}</td></tr>
    <tr><td>Rate</td><td class="amount">${(fees.managementFee.rate * 100).toFixed(2)}%</td></tr>
    <tr><td>Annual Fee</td><td class="amount">${this._fmt(fees.managementFee.annualFee)}</td></tr>
    <tr><td>Fund Stage</td><td class="amount">${fees.managementFee.fundStage}</td></tr>
  </table>
  <h3>Carried Interest Estimate</h3>
  <table>
    <tr><th>Item</th><th class="amount">Value</th></tr>
    <tr><td>Total Gain</td><td class="amount">${this._fmt(fees.carriedInterest.totalGain)}</td></tr>
    <tr><td>Hurdle Amount</td><td class="amount">${this._fmt(fees.carriedInterest.hurdleAmount)}</td></tr>
    <tr><td>Carry-Eligible Gain</td><td class="amount">${this._fmt(fees.carriedInterest.carryEligibleGain)}</td></tr>
    <tr><td>Estimated Carry (${(fees.carriedInterest.carryRate * 100)}%)</td><td class="amount">${this._fmt(fees.carriedInterest.estimatedCarry)}</td></tr>
  </table>
  <p><em>${fees.carriedInterest.note}</em></p>`;
  }

  _renderSideLetterHtml(inventory) {
    if (!inventory.letters.length) return '<h2>6. Side Letter Inventory</h2><p>No side letters on file.</p>';
    const rows = inventory.letters.map(sl => `
    <tr>
      <td>${this._esc(sl.investorName)}</td>
      <td>${this._esc(sl.entityType || 'N/A')}</td>
      <td>${Array.isArray(sl.provisions) ? sl.provisions.length : 0} provisions</td>
      <td>${sl.mfnEligible ? 'Yes' : 'No'}</td>
      <td>${sl.executionDate || 'N/A'}</td>
    </tr>`).join('');

    return `
  <h2>6. Side Letter Inventory</h2>
  <table>
    <tr><th>Investor</th><th>Entity Type</th><th>Provisions</th><th>MFN Eligible</th><th>Executed</th></tr>
    ${rows}
  </table>`;
  }

  _renderComplianceHtml(compliance) {
    if (!compliance.filings.length) return '<h2>7. Compliance Calendar Status</h2><p>No filings for this fiscal year.</p>';
    const rows = compliance.filings.map(f => `
    <tr>
      <td>${this._esc(f.name)}</td>
      <td>${this._esc(f.jurisdiction || 'N/A')}</td>
      <td>${f.deadline}</td>
      <td>${f.status}</td>
      <td>${f.filedDate || 'N/A'}</td>
    </tr>`).join('');

    return `
  <h2>7. Compliance Calendar Status</h2>
  <p>Compliance Rate: <strong>${compliance.complianceRate}</strong> (${compliance.filed} of ${compliance.totalFilings} filed)</p>
  <table>
    <tr><th>Filing</th><th>Jurisdiction</th><th>Deadline</th><th>Status</th><th>Filed Date</th></tr>
    ${rows}
  </table>`;
  }

  _renderAuditTrailHtml(trail) {
    if (!trail.entries.length) return '<h2>8. Audit Trail</h2><p>No audit entries for this period.</p>';
    const rows = trail.entries.slice(0, 100).map(e => `
    <tr>
      <td>${e.timestamp}</td>
      <td>${this._esc(e.action)}</td>
      <td>${this._esc(e.performedBy || 'system')}</td>
      <td>${this._esc(typeof e.details === 'string' ? e.details : JSON.stringify(e.details || ''))}</td>
    </tr>`).join('');

    return `
  <h2>8. Audit Trail</h2>
  <p>Total entries: ${trail.totalEntries}${trail.totalEntries > 100 ? ' (showing first 100)' : ''}</p>
  <table>
    <tr><th>Timestamp</th><th>Action</th><th>Performed By</th><th>Details</th></tr>
    ${rows}
  </table>`;
  }

  // ==================== UTILITIES ====================

  _safeParse(str, fallback) {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
  }

  _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  _fmt(num) {
    if (num == null || isNaN(num)) return '$0.00';
    return '$' + Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

module.exports = new AuditPackageGeneratorService();
