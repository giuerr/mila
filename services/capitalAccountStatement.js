/**
 * LP Capital Account Statement Generator
 * Generates branded PDF statements showing commitments, calls,
 * distributions, current NAV, IRR, and MOIC for individual LPs.
 */

const db = require('../db/database');

class CapitalAccountStatementService {

  /**
   * Generate statement data for an LP in a specific fund
   */
  generateStatement({ fundId, investorId, asOfDate, period }) {
    if (!db.db) throw new Error('Database not initialized');

    const fund = db.findById('funds', fundId);
    if (!fund) throw new Error(`Fund ${fundId} not found`);

    const investor = db.findById('investors', investorId);
    if (!investor) throw new Error(`Investor ${investorId} not found`);

    const commitment = db.query(
      'SELECT * FROM commitments WHERE fund_id = ? AND investor_id = ?',
      [fundId, investorId]
    )[0];
    if (!commitment) throw new Error(`No commitment found for investor ${investorId} in fund ${fundId}`);

    // Get all capital activity for this LP
    const activity = db.query(
      'SELECT * FROM capital_activity WHERE fund_id = ? AND investor_id = ? ORDER BY created_at ASC',
      [fundId, investorId]
    );

    const calls = activity.filter(a => a.type === 'CAPITAL_CALL');
    const distributions = activity.filter(a => a.type === 'DISTRIBUTION');
    const recallable = activity.filter(a => a.type === 'RECALLABLE');

    const totalCalled = calls.reduce((sum, c) => sum + c.amount, 0);
    const totalDistributed = distributions.reduce((sum, d) => sum + d.amount, 0);
    const totalRecallable = recallable.reduce((sum, r) => sum + r.amount, 0);

    // Get investments for portfolio allocation
    const investments = db.query(
      'SELECT * FROM investments WHERE fund_id = ? AND status IN (?, ?) ORDER BY fair_value DESC',
      [fundId, 'ACTIVE', 'PARTIALLY_REALIZED']
    );
    const totalFundFairValue = investments.reduce((sum, i) => sum + (i.fair_value || 0), 0);
    const totalFundCost = investments.reduce((sum, i) => sum + (i.cost_basis || 0), 0);

    // Calculate LP's pro-rata share
    const totalFundCommitments = db.query(
      'SELECT SUM(commitment) as total FROM commitments WHERE fund_id = ?',
      [fundId]
    )[0]?.total || 0;
    const proRataShare = totalFundCommitments > 0 ? commitment.commitment / totalFundCommitments : 0;

    // LP's share of portfolio
    const lpFairValue = totalFundFairValue * proRataShare;
    const lpCostBasis = totalFundCost * proRataShare;

    // NAV-based capital account
    const lpNav = fund.nav * proRataShare;

    // Performance metrics
    const totalValue = totalDistributed + lpNav;
    const moic = totalCalled > 0 ? totalValue / totalCalled : 0;
    const dpi = totalCalled > 0 ? totalDistributed / totalCalled : 0;
    const rvpi = totalCalled > 0 ? lpNav / totalCalled : 0;
    const irr = this._estimateIrr(calls, distributions, lpNav, fund.created_at);

    const date = asOfDate || new Date().toISOString().split('T')[0];

    return {
      statementType: 'CAPITAL_ACCOUNT_STATEMENT',
      generatedAt: new Date().toISOString(),
      asOfDate: date,
      period: period || this._currentQuarter(),

      // Fund Information
      fund: {
        name: fund.name,
        id: fund.id,
        jurisdiction: fund.jurisdiction,
        vehicleType: fund.vehicle_type,
        vintageYear: fund.vintage_year,
        totalCommitments: totalFundCommitments,
        fundNav: fund.nav,
        status: fund.status
      },

      // Investor Information
      investor: {
        name: investor.name,
        id: investor.id,
        entityType: investor.entity_type,
        jurisdiction: investor.jurisdiction,
        lpClass: commitment.lp_class || 'Standard'
      },

      // Capital Account Summary
      capitalAccount: {
        commitment: commitment.commitment,
        calledCapital: totalCalled,
        unfundedCommitment: commitment.commitment - totalCalled,
        drawdownPct: commitment.commitment > 0 ? ((totalCalled / commitment.commitment) * 100).toFixed(1) + '%' : '0%',
        distributions: totalDistributed,
        recallableDistributions: totalRecallable,
        netContributions: totalCalled - totalDistributed,
        currentNav: lpNav,
        capitalAccountBalance: commitment.capital_account || lpNav,
        ownershipPct: (proRataShare * 100).toFixed(4) + '%'
      },

      // Performance Metrics
      performance: {
        totalValue,
        moic: parseFloat(moic.toFixed(2)),
        dpi: parseFloat(dpi.toFixed(2)),
        rvpi: parseFloat(rvpi.toFixed(2)),
        tvpi: parseFloat((dpi + rvpi).toFixed(2)),
        irr: irr !== null ? parseFloat((irr * 100).toFixed(2)) + '%' : 'N/A',
        irrDecimal: irr
      },

      // Capital Activity Detail
      capitalActivity: {
        calls: calls.map(c => ({
          date: c.created_at?.split('T')[0] || c.created_at,
          callNumber: c.call_number,
          amount: c.amount,
          purpose: c.purpose,
          status: c.status
        })),
        distributions: distributions.map(d => ({
          date: d.created_at?.split('T')[0] || d.created_at,
          amount: d.amount,
          purpose: d.purpose,
          type: d.type
        })),
        totalCalls: calls.length,
        totalDistributionEvents: distributions.length
      },

      // Portfolio Allocation (LP's pro-rata share)
      portfolioAllocation: {
        proRataShare: (proRataShare * 100).toFixed(4) + '%',
        lpCostBasis,
        lpFairValue,
        unrealizedGainLoss: lpFairValue - lpCostBasis,
        topHoldings: investments.slice(0, 10).map(inv => ({
          company: inv.company_name,
          sector: inv.sector,
          geography: inv.geography,
          lpCost: (inv.cost_basis || 0) * proRataShare,
          lpFairValue: (inv.fair_value || 0) * proRataShare,
          moic: inv.cost_basis > 0 ? parseFloat((inv.fair_value / inv.cost_basis).toFixed(2)) : 0,
          status: inv.status
        }))
      },

      // Side Letter Terms (if any)
      sideLetterTerms: this._getSideLetterTerms(fundId, investorId),

      // Legal Disclosure
      disclosure: `This statement is provided for informational purposes only and does not constitute an offer to sell or a solicitation of an offer to buy any securities. ` +
        `Past performance is not indicative of future results. Valuations are as of ${date} and may change. ` +
        `IRR is estimated using the modified Dietz method and may differ from audited figures. ` +
        `This statement should be read in conjunction with the fund's audited financial statements and offering documents.`
    };
  }

  /**
   * Generate HTML for PDF conversion
   */
  generateStatementHtml({ fundId, investorId, asOfDate, period, branding = {} }) {
    const data = this.generateStatement({ fundId, investorId, asOfDate, period });
    const primaryColor = branding.primaryColor || '#1a365d';
    const accentColor = branding.accentColor || '#2b6cb0';
    const logo = branding.logoUrl || '';

    return `<!DOCTYPE html><html><head>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; padding: 40px; font-size: 10px; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid ${primaryColor}; padding-bottom: 15px; margin-bottom: 25px; }
  .title { font-size: 20px; font-weight: bold; color: ${primaryColor}; }
  .subtitle { font-size: 11px; color: #666; margin-top: 4px; }
  .section { margin-bottom: 20px; page-break-inside: avoid; }
  .section-title { font-size: 12px; font-weight: bold; color: ${primaryColor}; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th { background: ${primaryColor}; color: white; padding: 5px 8px; text-align: left; font-size: 9px; text-transform: uppercase; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 10px; }
  .amount { text-align: right; font-family: 'Courier New', monospace; }
  .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 10px 0; }
  .metric-box { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px; text-align: center; }
  .metric-value { font-size: 22px; font-weight: bold; color: ${primaryColor}; }
  .metric-label { font-size: 9px; color: #888; text-transform: uppercase; margin-top: 4px; }
  .positive { color: #155724; }
  .negative { color: #721c24; }
  .disclaimer { font-size: 8px; color: #999; border-top: 1px solid #ddd; padding-top: 10px; margin-top: 25px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 8px; font-weight: bold; }
  .badge-active { background: #d4edda; color: #155724; }
  .watermark { position: fixed; bottom: 20px; right: 20px; font-size: 8px; color: #ccc; }
</style></head><body>

<div class="header">
  <div>
    <div class="title">Capital Account Statement</div>
    <div class="subtitle">${data.fund.name} | ${data.period} | As of ${data.asOfDate}</div>
  </div>
  <div style="text-align: right;">
    <div style="font-size: 14px; font-weight: bold; color: ${primaryColor};">${data.investor.name}</div>
    <div style="font-size: 9px; color: #888;">${data.investor.entityType || ''} | ${data.investor.jurisdiction || ''}</div>
    <div style="font-size: 9px; color: #888;">LP Class: ${data.investor.lpClass}</div>
  </div>
</div>

<div class="section">
  <div class="section-title">Performance Summary</div>
  <div class="metric-grid">
    <div class="metric-box">
      <div class="metric-value">${data.performance.moic}x</div>
      <div class="metric-label">MOIC (Net)</div>
    </div>
    <div class="metric-box">
      <div class="metric-value">${data.performance.irr}</div>
      <div class="metric-label">Net IRR</div>
    </div>
    <div class="metric-box">
      <div class="metric-value">${data.performance.tvpi}x</div>
      <div class="metric-label">TVPI</div>
    </div>
    <div class="metric-box">
      <div class="metric-value">${data.performance.dpi}x</div>
      <div class="metric-label">DPI</div>
    </div>
    <div class="metric-box">
      <div class="metric-value">${data.performance.rvpi}x</div>
      <div class="metric-label">RVPI</div>
    </div>
    <div class="metric-box">
      <div class="metric-value">${data.capitalAccount.drawdownPct}</div>
      <div class="metric-label">Drawdown</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">Capital Account</div>
  <table>
    <tr><td><strong>Commitment</strong></td><td class="amount">${this._fmt(data.capitalAccount.commitment)}</td></tr>
    <tr><td>Called Capital</td><td class="amount">${this._fmt(data.capitalAccount.calledCapital)}</td></tr>
    <tr><td>Unfunded Commitment</td><td class="amount">${this._fmt(data.capitalAccount.unfundedCommitment)}</td></tr>
    <tr><td>Distributions</td><td class="amount">${this._fmt(data.capitalAccount.distributions)}</td></tr>
    <tr><td>Net Contributions</td><td class="amount">${this._fmt(data.capitalAccount.netContributions)}</td></tr>
    <tr style="border-top: 2px solid ${primaryColor};"><td><strong>Current NAV</strong></td><td class="amount"><strong>${this._fmt(data.capitalAccount.currentNav)}</strong></td></tr>
    <tr><td><strong>Total Value (Dist + NAV)</strong></td><td class="amount"><strong>${this._fmt(data.performance.totalValue)}</strong></td></tr>
  </table>
</div>

<div class="section">
  <div class="section-title">Top Portfolio Holdings (Pro-Rata Share: ${data.portfolioAllocation.proRataShare})</div>
  <table>
    <tr><th>Company</th><th>Sector</th><th>Cost</th><th>Fair Value</th><th>MOIC</th><th>Status</th></tr>
    ${data.portfolioAllocation.topHoldings.map(h => `
      <tr>
        <td>${h.company}</td>
        <td>${h.sector || '-'}</td>
        <td class="amount">${this._fmt(h.lpCost)}</td>
        <td class="amount">${this._fmt(h.lpFairValue)}</td>
        <td class="amount">${h.moic}x</td>
        <td><span class="badge badge-active">${h.status}</span></td>
      </tr>
    `).join('')}
    <tr style="border-top: 2px solid ${primaryColor}; font-weight: bold;">
      <td colspan="2">Total</td>
      <td class="amount">${this._fmt(data.portfolioAllocation.lpCostBasis)}</td>
      <td class="amount">${this._fmt(data.portfolioAllocation.lpFairValue)}</td>
      <td class="amount" class="${data.portfolioAllocation.unrealizedGainLoss >= 0 ? 'positive' : 'negative'}">${this._fmt(data.portfolioAllocation.unrealizedGainLoss)}</td>
      <td></td>
    </tr>
  </table>
</div>

${data.capitalActivity.calls.length > 0 ? `
<div class="section">
  <div class="section-title">Capital Call History</div>
  <table>
    <tr><th>Date</th><th>Call #</th><th>Amount</th><th>Purpose</th><th>Status</th></tr>
    ${data.capitalActivity.calls.map(c => `
      <tr>
        <td>${c.date || '-'}</td>
        <td>${c.callNumber || '-'}</td>
        <td class="amount">${this._fmt(c.amount)}</td>
        <td>${c.purpose || '-'}</td>
        <td>${c.status || '-'}</td>
      </tr>
    `).join('')}
  </table>
</div>` : ''}

<div class="disclaimer">${data.disclosure}</div>
<div class="watermark">Generated by Mila — Antoninus Global SPC</div>
</body></html>`;
  }

  // --- Helpers ---

  _getSideLetterTerms(fundId, investorId) {
    const sl = db.query(
      'SELECT * FROM side_letters WHERE fund_id = ? AND investor_id = ?',
      [fundId, investorId]
    )[0];
    if (!sl) return null;
    try {
      return {
        sideLetterDate: sl.execution_date,
        mfnEligible: !!sl.mfn_eligible,
        provisions: JSON.parse(sl.provisions || '[]')
      };
    } catch (e) { return null; }
  }

  _estimateIrr(calls, distributions, currentNav, inceptionDate) {
    // Simple modified Dietz approximation
    if (calls.length === 0) return null;
    const totalCalled = calls.reduce((sum, c) => sum + c.amount, 0);
    const totalDistributed = distributions.reduce((sum, d) => sum + d.amount, 0);
    if (totalCalled === 0) return null;

    const totalValue = totalDistributed + currentNav;
    const moic = totalValue / totalCalled;
    if (moic <= 0) return null;

    // Estimate holding period
    const inception = new Date(inceptionDate);
    const now = new Date();
    const years = Math.max(1, (now - inception) / (1000 * 60 * 60 * 24 * 365.25));

    // Annualized return approximation: IRR ≈ MOIC^(1/years) - 1
    const irr = Math.pow(moic, 1 / years) - 1;
    return isFinite(irr) ? irr : null;
  }

  _currentQuarter() {
    const now = new Date();
    const q = Math.ceil((now.getMonth() + 1) / 3);
    return `Q${q} ${now.getFullYear()}`;
  }

  _fmt(num) {
    if (!num && num !== 0) return '$0';
    return '$' + Number(num).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
}

module.exports = new CapitalAccountStatementService();
