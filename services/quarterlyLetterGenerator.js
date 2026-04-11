/**
 * Quarterly Letter Generator
 * Auto-generate investor quarterly letters from real fund data.
 * Pulls NAV, investments, capital activity, and performance metrics from DB.
 * Outputs structured data, branded HTML, and batch generation for all LPs.
 */

const db = require('../db/database');

class QuarterlyLetterGeneratorService {

  /**
   * Generate quarterly letter data from real fund metrics
   * @param {Object} params
   * @param {string} params.fundId - Fund identifier
   * @param {number} params.quarter - Quarter number (1-4)
   * @param {number} params.year - Year
   * @returns {Object} Structured letter data with all sections
   */
  generate({ fundId, quarter, year }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId) throw new Error('fundId is required');
    if (!quarter || quarter < 1 || quarter > 4) throw new Error('quarter must be between 1 and 4');
    if (!year) throw new Error('year is required');

    const fund = db.findById('funds', fundId);
    if (!fund) throw new Error(`Fund ${fundId} not found`);

    const quarterEnd = this._quarterEndDate(quarter, year);
    const quarterStart = this._quarterStartDate(quarter, year);
    const yearStart = `${year}-01-01`;

    // --- Fund Overview ---
    const commitments = db.query(`
      SELECT c.*, i.name as investor_name
      FROM commitments c
      JOIN investors i ON c.investor_id = i.id
      WHERE c.fund_id = ? AND c.status = 'ACTIVE'
    `, [fundId]);

    const totalCommitments = commitments.reduce((sum, c) => sum + c.commitment, 0);
    const totalCalled = commitments.reduce((sum, c) => sum + (c.called_capital || 0), 0);
    const totalDistributed = commitments.reduce((sum, c) => sum + (c.distributions || 0), 0);
    const fundNav = fund.nav || 0;

    const fundOverview = {
      fundName: fund.name,
      vintageYear: fund.vintage_year,
      jurisdiction: fund.jurisdiction,
      vehicleType: fund.vehicle_type,
      status: fund.status,
      totalCommitments,
      calledCapital: totalCalled,
      unfundedCommitments: totalCommitments - totalCalled,
      percentCalled: totalCommitments > 0 ? parseFloat(((totalCalled / totalCommitments) * 100).toFixed(1)) : 0,
      nav: fundNav,
      totalDistributions: totalDistributed,
      totalValue: fundNav + totalDistributed,
      lpCount: commitments.length,
      asOfDate: quarterEnd
    };

    // --- Portfolio Highlights (top holdings by fair value) ---
    const investments = db.query(`
      SELECT * FROM investments
      WHERE fund_id = ? AND status IN ('ACTIVE', 'PARTIALLY_REALIZED')
      ORDER BY fair_value DESC
    `, [fundId]);

    const totalFairValue = investments.reduce((sum, inv) => sum + (inv.fair_value || 0), 0);
    const totalCostBasis = investments.reduce((sum, inv) => sum + (inv.cost_basis || 0), 0);

    const portfolioHighlights = {
      totalInvestments: investments.length,
      totalCostBasis,
      totalFairValue,
      unrealizedGainLoss: parseFloat((totalFairValue - totalCostBasis).toFixed(2)),
      topHoldings: investments.slice(0, 10).map(inv => ({
        companyName: inv.company_name,
        sector: inv.sector || 'N/A',
        geography: inv.geography || 'N/A',
        costBasis: inv.cost_basis || 0,
        fairValue: inv.fair_value || 0,
        moic: inv.cost_basis > 0 ? parseFloat(((inv.fair_value || 0) / inv.cost_basis).toFixed(2)) : 0,
        percentOfPortfolio: totalFairValue > 0 ? parseFloat((((inv.fair_value || 0) / totalFairValue) * 100).toFixed(1)) : 0,
        investmentDate: inv.investment_date,
        status: inv.status
      })),
      sectorBreakdown: this._groupBy(investments, 'sector', 'fair_value'),
      geographyBreakdown: this._groupBy(investments, 'geography', 'fair_value')
    };

    // --- Capital Activity in Period ---
    const periodCalls = db.query(`
      SELECT ca.*, i.name as investor_name
      FROM capital_activity ca
      LEFT JOIN investors i ON ca.investor_id = i.id
      WHERE ca.fund_id = ? AND ca.type = 'CAPITAL_CALL'
        AND ca.created_at >= ? AND ca.created_at <= ?
      ORDER BY ca.created_at DESC
    `, [fundId, quarterStart, quarterEnd + ' 23:59:59']);

    const periodDistributions = db.query(`
      SELECT ca.*, i.name as investor_name
      FROM capital_activity ca
      LEFT JOIN investors i ON ca.investor_id = i.id
      WHERE ca.fund_id = ? AND ca.type = 'DISTRIBUTION'
        AND ca.created_at >= ? AND ca.created_at <= ?
      ORDER BY ca.created_at DESC
    `, [fundId, quarterStart, quarterEnd + ' 23:59:59']);

    const ytdCalls = db.query(`
      SELECT SUM(amount) as total FROM capital_activity
      WHERE fund_id = ? AND type = 'CAPITAL_CALL' AND created_at >= ? AND created_at <= ?
    `, [fundId, yearStart, quarterEnd + ' 23:59:59']);

    const ytdDistributions = db.query(`
      SELECT SUM(amount) as total FROM capital_activity
      WHERE fund_id = ? AND type = 'DISTRIBUTION' AND created_at >= ? AND created_at <= ?
    `, [fundId, yearStart, quarterEnd + ' 23:59:59']);

    const capitalActivity = {
      quarterCalls: periodCalls.reduce((sum, c) => sum + c.amount, 0),
      quarterCallCount: periodCalls.length,
      quarterDistributions: periodDistributions.reduce((sum, d) => sum + d.amount, 0),
      quarterDistributionCount: periodDistributions.length,
      netCashFlow: periodDistributions.reduce((sum, d) => sum + d.amount, 0) - periodCalls.reduce((sum, c) => sum + c.amount, 0),
      ytdCallsTotal: ytdCalls[0]?.total || 0,
      ytdDistributionsTotal: ytdDistributions[0]?.total || 0,
      callDetails: periodCalls.map(c => ({ date: c.created_at, amount: c.amount, purpose: c.purpose, status: c.status })),
      distributionDetails: periodDistributions.map(d => ({ date: d.created_at, amount: d.amount, purpose: d.purpose, status: d.status }))
    };

    // --- Performance ---
    const totalValue = fundNav + totalDistributed;
    const moic = totalCalled > 0 ? parseFloat((totalValue / totalCalled).toFixed(4)) : 0;

    // Simple IRR estimate using MOIC and years since inception
    const inceptionDate = fund.created_at || `${fund.vintage_year || year}-01-01`;
    const yearsElapsed = Math.max(0.25, (new Date(quarterEnd).getTime() - new Date(inceptionDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    const irrEstimate = moic > 0 ? parseFloat(((Math.pow(moic, 1 / yearsElapsed) - 1) * 100).toFixed(2)) : 0;

    // DPI and RVPI
    const dpi = totalCalled > 0 ? parseFloat((totalDistributed / totalCalled).toFixed(4)) : 0;
    const rvpi = totalCalled > 0 ? parseFloat((fundNav / totalCalled).toFixed(4)) : 0;
    const tvpi = dpi + rvpi;

    // Realized investments
    const realizedInvestments = db.query(`
      SELECT * FROM investments
      WHERE fund_id = ? AND status IN ('FULLY_REALIZED', 'WRITTEN_OFF')
    `, [fundId]);

    const realizedCost = realizedInvestments.reduce((sum, inv) => sum + (inv.cost_basis || 0), 0);
    const realizedProceeds = realizedInvestments.reduce((sum, inv) => sum + (inv.exit_proceeds || 0), 0);

    const performance = {
      moic,
      irrEstimate,
      dpi,
      rvpi,
      tvpi: parseFloat(tvpi.toFixed(4)),
      totalValue,
      yearsElapsed: parseFloat(yearsElapsed.toFixed(2)),
      realizedInvestments: realizedInvestments.length,
      realizedCost,
      realizedProceeds,
      realizedMoic: realizedCost > 0 ? parseFloat((realizedProceeds / realizedCost).toFixed(4)) : 0,
      unrealizedInvestments: investments.length,
      unrealizedCost: totalCostBasis,
      unrealizedFairValue: totalFairValue
    };

    // --- Placeholders ---
    const marketCommentary = {
      placeholder: true,
      note: 'Market commentary to be drafted by investment team. Include macro conditions, sector trends, and market outlook relevant to fund strategy.',
      suggestedTopics: [
        'Interest rate environment and impact on valuations',
        'Deal flow and transaction volume trends',
        'Sector-specific developments',
        'Regulatory changes affecting portfolio'
      ]
    };

    const outlook = {
      placeholder: true,
      note: 'Outlook section to be drafted by GP. Include pipeline activity, expected realizations, and strategic priorities.',
      suggestedTopics: [
        'Near-term realization candidates',
        'Capital deployment pipeline',
        'Value creation initiatives',
        'Expected capital calls in next quarter'
      ]
    };

    return {
      fundId,
      quarter,
      year,
      quarterLabel: `Q${quarter} ${year}`,
      generatedAt: new Date().toISOString(),
      sections: {
        fundOverview,
        portfolioHighlights,
        capitalActivity,
        performance,
        marketCommentary,
        outlook
      }
    };
  }

  /**
   * Generate branded HTML for PDF rendering
   * @param {Object} params
   * @param {string} params.fundId - Fund identifier
   * @param {number} params.quarter - Quarter number (1-4)
   * @param {number} params.year - Year
   * @param {Object} params.branding - { primaryColor, logoUrl, firmName, disclaimer }
   * @returns {string} HTML string
   */
  generateHtml({ fundId, quarter, year, branding = {} }) {
    const data = this.generate({ fundId, quarter, year });
    const s = data.sections;

    const primaryColor = branding.primaryColor || '#1a365d';
    const firmName = branding.firmName || s.fundOverview.fundName;
    const logoHtml = branding.logoUrl
      ? `<img src="${branding.logoUrl}" alt="${firmName}" style="max-height:60px;" />`
      : `<div style="font-size:24px;font-weight:700;color:${primaryColor};">${firmName}</div>`;
    const disclaimer = branding.disclaimer || 'This document is confidential and intended solely for the addressee. Past performance is not indicative of future results.';

    const fmt = (n) => typeof n === 'number' ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : n;
    const pct = (n) => typeof n === 'number' ? n.toFixed(1) + '%' : n;

    // Build top holdings table rows
    const holdingsRows = s.portfolioHighlights.topHoldings.map(h => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${h.companyName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${h.sector}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${fmt(h.costBasis)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${fmt(h.fairValue)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${h.moic}x</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${pct(h.percentOfPortfolio)}</td>
      </tr>
    `).join('');

    // Sector breakdown rows
    const sectorRows = s.portfolioHighlights.sectorBreakdown.map(b => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;">${b.label}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${fmt(b.total)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${pct(b.percentage)}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${s.fundOverview.fundName} - Q${quarter} ${year} Quarterly Letter</title>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #2d3748; margin: 0; padding: 0; font-size: 14px; line-height: 1.6; }
  .header { background: ${primaryColor}; color: #fff; padding: 40px 48px; display: flex; justify-content: space-between; align-items: center; }
  .header-logo { filter: brightness(0) invert(1); }
  .header-title { font-size: 20px; font-weight: 300; }
  .container { max-width: 900px; margin: 0 auto; padding: 32px 48px; }
  .section { margin-bottom: 36px; }
  .section-title { font-size: 18px; font-weight: 700; color: ${primaryColor}; border-bottom: 2px solid ${primaryColor}; padding-bottom: 8px; margin-bottom: 16px; }
  .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .metric-card { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; }
  .metric-value { font-size: 22px; font-weight: 700; color: ${primaryColor}; }
  .metric-label { font-size: 11px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: ${primaryColor}; color: #fff; padding: 10px 12px; text-align: left; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px; }
  th.right { text-align: right; }
  .activity-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
  .disclaimer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #cbd5e0; font-size: 10px; color: #a0aec0; }
  .footer { text-align: center; font-size: 11px; color: #a0aec0; margin-top: 24px; }
</style>
</head>
<body>

<div class="header">
  <div>${logoHtml}</div>
  <div class="header-title">Quarterly Report &mdash; Q${quarter} ${year}</div>
</div>

<div class="container">

  <!-- Fund Overview -->
  <div class="section">
    <div class="section-title">Fund Overview</div>
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-value">${fmt(s.fundOverview.totalCommitments)}</div>
        <div class="metric-label">Total Commitments</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${fmt(s.fundOverview.calledCapital)}</div>
        <div class="metric-label">Called Capital (${pct(s.fundOverview.percentCalled)})</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${fmt(s.fundOverview.nav)}</div>
        <div class="metric-label">Net Asset Value</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${fmt(s.fundOverview.totalValue)}</div>
        <div class="metric-label">Total Value (NAV + Dist.)</div>
      </div>
    </div>
    <p><strong>Vintage:</strong> ${s.fundOverview.vintageYear || 'N/A'} &nbsp;|&nbsp;
       <strong>Vehicle:</strong> ${s.fundOverview.vehicleType || 'N/A'} &nbsp;|&nbsp;
       <strong>Jurisdiction:</strong> ${s.fundOverview.jurisdiction || 'N/A'} &nbsp;|&nbsp;
       <strong>LPs:</strong> ${s.fundOverview.lpCount}</p>
  </div>

  <!-- Performance -->
  <div class="section">
    <div class="section-title">Performance Summary</div>
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-value">${s.performance.moic}x</div>
        <div class="metric-label">Gross MOIC</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${pct(s.performance.irrEstimate)}</div>
        <div class="metric-label">Est. Gross IRR</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${s.performance.dpi}x</div>
        <div class="metric-label">DPI (Realized)</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${s.performance.tvpi}x</div>
        <div class="metric-label">TVPI</div>
      </div>
    </div>
    <p><strong>Realized:</strong> ${s.performance.realizedInvestments} investments, ${fmt(s.performance.realizedProceeds)} proceeds on ${fmt(s.performance.realizedCost)} cost (${s.performance.realizedMoic}x) &nbsp;|&nbsp;
       <strong>Unrealized:</strong> ${s.performance.unrealizedInvestments} investments, ${fmt(s.performance.unrealizedFairValue)} FV on ${fmt(s.performance.unrealizedCost)} cost</p>
  </div>

  <!-- Portfolio Highlights -->
  <div class="section">
    <div class="section-title">Portfolio Highlights</div>
    <p>${s.portfolioHighlights.totalInvestments} active investments. Total cost basis ${fmt(s.portfolioHighlights.totalCostBasis)}, fair value ${fmt(s.portfolioHighlights.totalFairValue)} (unrealized gain/loss: ${fmt(s.portfolioHighlights.unrealizedGainLoss)}).</p>
    <table>
      <thead>
        <tr>
          <th>Company</th><th>Sector</th><th class="right">Cost</th><th class="right">Fair Value</th><th class="right">MOIC</th><th class="right">% of Portfolio</th>
        </tr>
      </thead>
      <tbody>${holdingsRows}</tbody>
    </table>
  </div>

  <!-- Sector Breakdown -->
  <div class="section">
    <div class="section-title">Sector Allocation</div>
    <table>
      <thead><tr><th>Sector</th><th class="right">Fair Value</th><th class="right">% of Portfolio</th></tr></thead>
      <tbody>${sectorRows}</tbody>
    </table>
  </div>

  <!-- Capital Activity -->
  <div class="section">
    <div class="section-title">Capital Activity &mdash; Q${quarter} ${year}</div>
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-value">${fmt(s.capitalActivity.quarterCalls)}</div>
        <div class="metric-label">Capital Called (${s.capitalActivity.quarterCallCount} calls)</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${fmt(s.capitalActivity.quarterDistributions)}</div>
        <div class="metric-label">Distributed (${s.capitalActivity.quarterDistributionCount})</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${fmt(s.capitalActivity.netCashFlow)}</div>
        <div class="metric-label">Net Cash Flow</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${fmt(s.capitalActivity.ytdCallsTotal)}</div>
        <div class="metric-label">YTD Called</div>
      </div>
    </div>
  </div>

  <!-- Market Commentary -->
  <div class="section">
    <div class="section-title">Market Commentary</div>
    <p><em>[To be drafted by the investment team. Suggested topics: interest rate environment, deal flow trends, sector developments, regulatory changes.]</em></p>
  </div>

  <!-- Outlook -->
  <div class="section">
    <div class="section-title">Outlook</div>
    <p><em>[To be drafted by the GP. Suggested topics: near-term realization candidates, deployment pipeline, value creation initiatives, expected capital calls.]</em></p>
  </div>

  <div class="disclaimer">${disclaimer}</div>
  <div class="footer">Generated by Mila CFO Agent &mdash; ${new Date().toISOString().split('T')[0]}</div>
</div>

</body>
</html>`;

    return {
      fundId,
      quarter,
      year,
      html,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Batch generate quarterly letters for all LPs in a fund
   * @param {Object} params
   * @param {string} params.fundId - Fund identifier
   * @param {number} params.quarter - Quarter number (1-4)
   * @param {number} params.year - Year
   * @returns {Object} Batch results with per-LP customized data
   */
  batchGenerate({ fundId, quarter, year }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId) throw new Error('fundId is required');

    const baseData = this.generate({ fundId, quarter, year });

    const commitments = db.query(`
      SELECT c.*, i.name as investor_name, i.email as investor_email
      FROM commitments c
      JOIN investors i ON c.investor_id = i.id
      WHERE c.fund_id = ? AND c.status = 'ACTIVE'
    `, [fundId]);

    if (commitments.length === 0) throw new Error('No active commitments for this fund');

    const quarterEnd = this._quarterEndDate(quarter, year);
    const quarterStart = this._quarterStartDate(quarter, year);

    const lpLetters = commitments.map(c => {
      // Per-LP capital activity
      const lpCalls = db.query(`
        SELECT * FROM capital_activity
        WHERE fund_id = ? AND investor_id = ? AND type = 'CAPITAL_CALL'
          AND created_at >= ? AND created_at <= ?
      `, [fundId, c.investor_id, quarterStart, quarterEnd + ' 23:59:59']);

      const lpDistributions = db.query(`
        SELECT * FROM capital_activity
        WHERE fund_id = ? AND investor_id = ? AND type = 'DISTRIBUTION'
          AND created_at >= ? AND created_at <= ?
      `, [fundId, c.investor_id, quarterStart, quarterEnd + ' 23:59:59']);

      const totalCalled = c.called_capital || 0;
      const totalDistributed = c.distributions || 0;
      const capitalAccount = c.capital_account || 0;
      const totalCommitments = baseData.sections.fundOverview.totalCommitments;

      return {
        investorId: c.investor_id,
        investorName: c.investor_name,
        investorEmail: c.investor_email,
        commitment: c.commitment,
        ownershipPct: totalCommitments > 0 ? parseFloat(((c.commitment / totalCommitments) * 100).toFixed(2)) : 0,
        calledCapital: totalCalled,
        distributions: totalDistributed,
        capitalAccount,
        unfunded: c.commitment - totalCalled,
        quarterActivity: {
          calls: lpCalls.reduce((sum, ca) => sum + ca.amount, 0),
          distributions: lpDistributions.reduce((sum, d) => sum + d.amount, 0)
        },
        lpClass: c.lp_class || 'Standard'
      };
    });

    db.logAction('QUARTERLY_LETTER', fundId, 'BATCH_GENERATED', 'mila@antoninus.com', {
      fundId, quarter, year, lpCount: lpLetters.length
    });

    return {
      fundId,
      quarter,
      year,
      quarterLabel: `Q${quarter} ${year}`,
      generatedAt: new Date().toISOString(),
      fundData: baseData.sections,
      lpLetters,
      summary: {
        totalLPs: lpLetters.length,
        totalCommitments: lpLetters.reduce((sum, lp) => sum + lp.commitment, 0),
        totalCalled: lpLetters.reduce((sum, lp) => sum + lp.calledCapital, 0),
        totalDistributed: lpLetters.reduce((sum, lp) => sum + lp.distributions, 0)
      }
    };
  }

  // --- Helpers ---

  _quarterStartDate(quarter, year) {
    const months = { 1: '01', 2: '04', 3: '07', 4: '10' };
    return `${year}-${months[quarter]}-01`;
  }

  _quarterEndDate(quarter, year) {
    const ends = { 1: '03-31', 2: '06-30', 3: '09-30', 4: '12-31' };
    return `${year}-${ends[quarter]}`;
  }

  _groupBy(items, field, valueField) {
    const groups = {};
    let grandTotal = 0;
    for (const item of items) {
      const key = item[field] || 'Other';
      const val = item[valueField] || 0;
      groups[key] = (groups[key] || 0) + val;
      grandTotal += val;
    }
    return Object.entries(groups)
      .map(([label, total]) => ({
        label,
        total: parseFloat(total.toFixed(2)),
        percentage: grandTotal > 0 ? parseFloat(((total / grandTotal) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => b.total - a.total);
  }
}

module.exports = new QuarterlyLetterGeneratorService();
