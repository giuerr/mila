/**
 * K-1 Tax Document Generator
 * Auto-generates Schedule K-1 (Form 1065) from real investor data.
 * Allocates income, deductions, credits pro-rata by capital account.
 */

const db = require('../db/database');

class K1GeneratorService {

  /**
   * Generate K-1 data for an LP in a specific fund/tax year
   */
  generate({ fundId, investorId, taxYear }) {
    if (!db.db) throw new Error('Database not initialized');
    const year = taxYear || new Date().getFullYear() - 1;

    const fund = db.findById('funds', fundId);
    if (!fund) throw new Error(`Fund ${fundId} not found`);

    const investor = db.findById('investors', investorId);
    if (!investor) throw new Error(`Investor ${investorId} not found`);

    const commitment = db.query(
      'SELECT * FROM commitments WHERE fund_id = ? AND investor_id = ?',
      [fundId, investorId]
    )[0];
    if (!commitment) throw new Error('No commitment found');

    // Get all commitments for pro-rata calculation
    const allCommitments = db.query('SELECT * FROM commitments WHERE fund_id = ?', [fundId]);
    const totalCapitalAccounts = allCommitments.reduce((sum, c) => sum + (c.capital_account || 0), 0);
    const lpShare = totalCapitalAccounts > 0 ? (commitment.capital_account || 0) / totalCapitalAccounts : 0;

    // Get investments for income/gain allocation
    const investments = db.query('SELECT * FROM investments WHERE fund_id = ?', [fundId]);
    const realized = investments.filter(i => i.status === 'FULLY_REALIZED' && i.exit_proceeds);
    const realizedGain = realized.reduce((sum, i) => sum + ((i.exit_proceeds || 0) - (i.cost_basis || 0)), 0);
    const unrealizedGain = investments
      .filter(i => i.status === 'ACTIVE')
      .reduce((sum, i) => sum + ((i.fair_value || 0) - (i.cost_basis || 0)), 0);

    // Capital activity for the year
    const yearActivity = db.query(
      "SELECT * FROM capital_activity WHERE fund_id = ? AND investor_id = ? AND created_at LIKE ?",
      [fundId, investorId, `${year}%`]
    );
    const yearCalls = yearActivity.filter(a => a.type === 'CAPITAL_CALL').reduce((sum, a) => sum + a.amount, 0);
    const yearDistributions = yearActivity.filter(a => a.type === 'DISTRIBUTION').reduce((sum, a) => sum + a.amount, 0);

    // Fund-level income items (estimated)
    const interestIncome = (fund.nav || 0) * 0.005; // 0.5% estimated interest
    const dividendIncome = 0;
    const managementFees = (fund.total_commitments || 0) * (fund.mgmt_fee_rate || 0.02);
    const fundExpenses = 300000; // Estimated annual fund expenses

    // LP's share of each item
    const k1Data = {
      // Part I — Information About the Partnership
      partI: {
        partnershipName: fund.name,
        partnershipEIN: fund.tax_id || 'XX-XXXXXXX',
        partnershipAddress: 'c/o Antoninus Global SPC, George Town, Grand Cayman',
        irsCenter: 'Ogden, UT',
        publiclyTraded: false
      },

      // Part II — Information About the Partner
      partII: {
        partnerName: investor.name,
        partnerSSN_EIN: investor.tax_id || 'XXX-XX-XXXX',
        partnerAddress: investor.address || '',
        generalOrLimited: 'Limited',
        domesticOrForeign: (investor.tax_residence === 'US' || investor.jurisdiction === 'US') ? 'Domestic' : 'Foreign',
        partnerType: investor.entity_type || 'Other',
        profitSharingPct: parseFloat((lpShare * 100).toFixed(4)),
        lossSharingPct: parseFloat((lpShare * 100).toFixed(4)),
        capitalSharingPct: parseFloat((lpShare * 100).toFixed(4)),
        decreaseFromPriorYear: false
      },

      // Part III — Partner's Share of Current Year Income, Deductions, Credits
      partIII: {
        // Box 1 — Ordinary business income (loss)
        box1_ordinaryIncome: 0,

        // Box 2 — Net rental real estate income (loss)
        box2_rentalRealEstate: 0,

        // Box 3 — Other net rental income (loss)
        box3_otherRental: 0,

        // Box 4 — Guaranteed payments for services
        box4a_guaranteedPayments: 0,

        // Box 5 — Interest income
        box5_interestIncome: parseFloat((interestIncome * lpShare).toFixed(2)),

        // Box 6a — Ordinary dividends
        box6a_ordinaryDividends: parseFloat((dividendIncome * lpShare).toFixed(2)),

        // Box 6b — Qualified dividends
        box6b_qualifiedDividends: 0,

        // Box 7 — Royalties
        box7_royalties: 0,

        // Box 8 — Net short-term capital gain (loss)
        box8_shortTermCapGain: 0,

        // Box 9a — Net long-term capital gain (loss)
        box9a_longTermCapGain: parseFloat((Math.max(0, realizedGain) * lpShare).toFixed(2)),

        // Box 9b — Collectibles gain (loss)
        box9b_collectiblesGain: 0,

        // Box 9c — Unrecaptured Section 1250 gain
        box9c_section1250: 0,

        // Box 10 — Net section 1231 gain (loss)
        box10_section1231: 0,

        // Box 11 — Other income (loss)
        box11_otherIncome: 0,

        // Box 12 — Section 179 deduction
        box12_section179: 0,

        // Box 13 — Other deductions
        box13_otherDeductions: parseFloat(((managementFees + fundExpenses) * lpShare).toFixed(2)),

        // Box 14 — Self-employment earnings (loss)
        box14_selfEmployment: 0,

        // Box 15 — Credits
        box15_credits: 0,

        // Box 16 — Foreign transactions
        box16_foreignTransactions: investor.tax_residence !== 'US' ? {
          foreignCountry: investor.tax_residence || investor.jurisdiction,
          foreignTaxPaid: 0,
          foreignSourceIncome: parseFloat(((interestIncome + Math.max(0, realizedGain)) * lpShare).toFixed(2))
        } : null,

        // Box 19 — Distributions
        box19a_cashDistributions: parseFloat(yearDistributions.toFixed(2)),
        box19b_propertyDistributions: 0,

        // Box 20 — Other information
        box20_otherInfo: {
          section754Adjustment: 0,
          investmentIncome: parseFloat((interestIncome * lpShare).toFixed(2)),
          investmentExpenses: parseFloat(((managementFees + fundExpenses) * lpShare).toFixed(2))
        }
      },

      // Capital Account Analysis (Schedule L)
      capitalAccount: {
        beginningBalance: parseFloat(((commitment.capital_account || 0) - yearCalls + yearDistributions).toFixed(2)),
        capitalContributed: parseFloat(yearCalls.toFixed(2)),
        currentYearIncome: parseFloat(((interestIncome + Math.max(0, realizedGain)) * lpShare).toFixed(2)),
        otherIncreases: 0,
        withdrawals: parseFloat(yearDistributions.toFixed(2)),
        currentYearLoss: parseFloat((Math.abs(Math.min(0, realizedGain)) * lpShare).toFixed(2)),
        otherDecreases: parseFloat(((managementFees + fundExpenses) * lpShare).toFixed(2)),
        endingBalance: parseFloat((commitment.capital_account || 0).toFixed(2)),
        method: 'TAX_BASIS'
      },

      // FATCA/CRS info for foreign partners
      fatcaCrs: investor.tax_residence !== 'US' ? {
        fatcaClassification: investor.fatca_classification || 'N/A',
        crsClassification: investor.crs_classification || 'N/A',
        withholdingRate: this._getWithholdingRate(investor),
        withholdingAmount: parseFloat(((interestIncome + dividendIncome) * lpShare * this._getWithholdingRate(investor) / 100).toFixed(2))
      } : null
    };

    return {
      documentType: 'SCHEDULE_K1_1065',
      taxYear: year,
      generatedAt: new Date().toISOString(),
      fundId,
      fundName: fund.name,
      investorId,
      investorName: investor.name,
      proRataShare: parseFloat((lpShare * 100).toFixed(4)) + '%',
      k1Data,
      disclaimer: `This Schedule K-1 is provided for informational purposes. ` +
        `Final K-1s will be issued by the fund's tax advisor after year-end audit. ` +
        `Amounts shown are estimates and may change. Consult your tax advisor.`
    };
  }

  /**
   * Generate K-1 HTML for PDF conversion
   */
  generateHtml({ fundId, investorId, taxYear }) {
    const data = this.generate({ fundId, investorId, taxYear });
    const k = data.k1Data;

    return `<!DOCTYPE html><html><head><style>
      body { font-family: 'Courier New', monospace; font-size: 9px; color: #000; padding: 30px; line-height: 1.4; }
      .header { text-align: center; border: 2px solid #000; padding: 10px; margin-bottom: 15px; }
      .header h1 { font-size: 14px; margin: 0; }
      .header h2 { font-size: 11px; margin: 2px 0; }
      .section { border: 1px solid #000; margin-bottom: 10px; padding: 8px; }
      .section-title { font-size: 10px; font-weight: bold; background: #e0e0e0; padding: 3px 6px; margin: -8px -8px 8px -8px; }
      .row { display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px dotted #ccc; }
      .row:last-child { border-bottom: none; }
      .label { flex: 2; }
      .value { flex: 1; text-align: right; font-weight: bold; }
      .box-num { display: inline-block; width: 20px; font-weight: bold; }
      .disclaimer { font-size: 7px; color: #666; margin-top: 15px; border-top: 1px solid #ccc; padding-top: 5px; }
    </style></head><body>
    <div class="header">
      <h1>Schedule K-1 (Form 1065)</h1>
      <h2>Partner's Share of Income, Deductions, Credits, etc.</h2>
      <div>Tax Year: ${data.taxYear} | ${data.fundName}</div>
    </div>

    <div class="section">
      <div class="section-title">Part I — Information About the Partnership</div>
      <div class="row"><div class="label">Partnership Name</div><div class="value">${k.partI.partnershipName}</div></div>
      <div class="row"><div class="label">EIN</div><div class="value">${k.partI.partnershipEIN}</div></div>
    </div>

    <div class="section">
      <div class="section-title">Part II — Information About the Partner</div>
      <div class="row"><div class="label">Partner Name</div><div class="value">${k.partII.partnerName}</div></div>
      <div class="row"><div class="label">Type</div><div class="value">${k.partII.partnerType} (${k.partII.generalOrLimited})</div></div>
      <div class="row"><div class="label">Profit/Loss/Capital %</div><div class="value">${k.partII.profitSharingPct}%</div></div>
    </div>

    <div class="section">
      <div class="section-title">Part III — Partner's Share of Current Year Income, Deductions, Credits</div>
      <div class="row"><div class="label"><span class="box-num">5</span> Interest income</div><div class="value">$${k.partIII.box5_interestIncome.toLocaleString()}</div></div>
      <div class="row"><div class="label"><span class="box-num">6a</span> Ordinary dividends</div><div class="value">$${k.partIII.box6a_ordinaryDividends.toLocaleString()}</div></div>
      <div class="row"><div class="label"><span class="box-num">9a</span> Net long-term capital gain</div><div class="value">$${k.partIII.box9a_longTermCapGain.toLocaleString()}</div></div>
      <div class="row"><div class="label"><span class="box-num">13</span> Other deductions</div><div class="value">($${k.partIII.box13_otherDeductions.toLocaleString()})</div></div>
      <div class="row"><div class="label"><span class="box-num">19a</span> Cash distributions</div><div class="value">$${k.partIII.box19a_cashDistributions.toLocaleString()}</div></div>
    </div>

    <div class="section">
      <div class="section-title">Capital Account Analysis</div>
      <div class="row"><div class="label">Beginning balance</div><div class="value">$${k.capitalAccount.beginningBalance.toLocaleString()}</div></div>
      <div class="row"><div class="label">Capital contributed</div><div class="value">$${k.capitalAccount.capitalContributed.toLocaleString()}</div></div>
      <div class="row"><div class="label">Current year income</div><div class="value">$${k.capitalAccount.currentYearIncome.toLocaleString()}</div></div>
      <div class="row"><div class="label">Withdrawals/distributions</div><div class="value">($${k.capitalAccount.withdrawals.toLocaleString()})</div></div>
      <div class="row"><div class="label"><strong>Ending balance</strong></div><div class="value"><strong>$${k.capitalAccount.endingBalance.toLocaleString()}</strong></div></div>
    </div>

    <div class="disclaimer">${data.disclaimer}</div>
    </body></html>`;
  }

  /**
   * Batch generate K-1s for all LPs in a fund
   */
  batchGenerate({ fundId, taxYear }) {
    if (!db.db) throw new Error('Database not initialized');
    const commitments = db.query(
      'SELECT c.investor_id FROM commitments c WHERE c.fund_id = ? AND c.status = ?',
      [fundId, 'ACTIVE']
    );

    const results = commitments.map(c => {
      try {
        return { investorId: c.investor_id, status: 'generated', data: this.generate({ fundId, investorId: c.investor_id, taxYear }) };
      } catch (e) {
        return { investorId: c.investor_id, status: 'error', error: e.message };
      }
    });

    return {
      fundId,
      taxYear: taxYear || new Date().getFullYear() - 1,
      totalGenerated: results.filter(r => r.status === 'generated').length,
      totalErrors: results.filter(r => r.status === 'error').length,
      results
    };
  }

  _getWithholdingRate(investor) {
    const treatyCountries = { UK: 15, DE: 15, FR: 15, JP: 10, CA: 15, AU: 15, CH: 15, NL: 15, IE: 15, SG: 15, HK: 0 };
    return treatyCountries[investor.tax_residence] || treatyCountries[investor.jurisdiction] || 30;
  }
}

module.exports = new K1GeneratorService();
