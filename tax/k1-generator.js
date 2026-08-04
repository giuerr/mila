/**
 * K-1 / Tax Statement Generator
 * Agent: Mila (CFO/Reporting)
 *
 * Produces structured K-1 data (US), UK Tax Statements, and EU Tax
 * Certificates for each limited partner based on fund-level data.
 */

'use strict';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _round(value, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function _allocateByOwnership(totalAmount, ownershipPct) {
  return _round(totalAmount * (ownershipPct / 100));
}

function _buildCapitalAccount(lpData, fundData, taxYear) {
  const beginningBalance = lpData.capitalAccountBeginning != null
    ? lpData.capitalAccountBeginning
    : 0;

  const contributions = lpData.contributions != null ? lpData.contributions : 0;
  const withdrawals = lpData.withdrawals != null ? lpData.withdrawals : 0;

  const ownershipPct = lpData.ownershipPct || 0;

  const currentYearIncrease = _allocateByOwnership(
    (fundData.ordinaryIncome || 0) + (fundData.capitalGainsLongTerm || 0) + (fundData.capitalGainsShortTerm || 0),
    ownershipPct
  );

  const currentYearDecrease = _allocateByOwnership(
    (fundData.losses || 0),
    ownershipPct
  );

  const endingBalance = _round(
    beginningBalance + contributions + currentYearIncrease - Math.abs(currentYearDecrease) - withdrawals
  );

  return {
    beginningBalance: _round(beginningBalance),
    contributions: _round(contributions),
    currentYearIncrease: _round(currentYearIncrease),
    currentYearDecrease: _round(currentYearDecrease),
    withdrawals: _round(withdrawals),
    endingBalance,
  };
}

// ---------------------------------------------------------------------------
// US Schedule K-1 Generator
// ---------------------------------------------------------------------------

/**
 * Generate a structured Schedule K-1 for a single limited partner.
 *
 * @param {object} fundData - Fund-level income/expense data
 *   { fundName, fundEIN, fundAddress, ordinaryIncome, capitalGainsShortTerm,
 *     capitalGainsLongTerm, losses, guaranteedPayments, foreignTaxesPaid,
 *     totalDistributions }
 * @param {object} lpData - Individual LP data
 *   { partnerName, tin, partnerType ('individual'|'entity'|'foreign'),
 *     ownershipPct, capitalAccountBeginning, contributions, withdrawals }
 * @param {number} taxYear
 * @returns {object} Structured K-1 record
 */
function generateK1(fundData, lpData, taxYear) {
  const pct = lpData.ownershipPct || 0;

  const shareOrdinaryIncome = _allocateByOwnership(fundData.ordinaryIncome || 0, pct);
  const shareCapitalGainsShortTerm = _allocateByOwnership(fundData.capitalGainsShortTerm || 0, pct);
  const shareCapitalGainsLongTerm = _allocateByOwnership(fundData.capitalGainsLongTerm || 0, pct);
  const shareLosses = _allocateByOwnership(fundData.losses || 0, pct);
  const shareGuaranteedPayments = _allocateByOwnership(fundData.guaranteedPayments || 0, pct);
  const shareForeignTaxesPaid = _allocateByOwnership(fundData.foreignTaxesPaid || 0, pct);
  const shareDistributions = _allocateByOwnership(fundData.totalDistributions || 0, pct);

  const capitalAccount = _buildCapitalAccount(lpData, fundData, taxYear);

  return {
    form: 'Schedule K-1 (Form 1065)',
    taxYear,
    fundName: fundData.fundName || '',
    fundEIN: fundData.fundEIN || '',
    fundAddress: fundData.fundAddress || '',

    partnerName: lpData.partnerName,
    partnerTIN: lpData.tin || '',
    partnerType: lpData.partnerType || 'individual',
    ownershipPercentage: pct,

    allocations: {
      ordinaryIncome: shareOrdinaryIncome,
      capitalGainsShortTerm: shareCapitalGainsShortTerm,
      capitalGainsLongTerm: shareCapitalGainsLongTerm,
      losses: shareLosses,
      guaranteedPayments: shareGuaranteedPayments,
      foreignTaxesPaid: shareForeignTaxesPaid,
      distributions: shareDistributions,
    },

    capitalAccount,

    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// UK Tax Statement Generator
// ---------------------------------------------------------------------------

/**
 * Generate a UK Tax Statement for a single limited partner.
 *
 * @param {object} fundData - Fund-level data
 *   { fundName, fundUTR, ukTradingIncome, ukCapitalGains, ukPropertyIncome,
 *     interestIncome, excessReportableIncome, withholdingTaxDeducted }
 * @param {object} lpData - Individual LP data
 *   { partnerName, utr, ownershipPct }
 * @param {number} taxYear
 * @returns {object} Structured UK tax statement
 */
function generateUKTaxStatement(fundData, lpData, taxYear) {
  const pct = lpData.ownershipPct || 0;

  return {
    form: 'UK Partnership Tax Statement',
    taxYear,
    taxYearLabel: `${taxYear}/${taxYear + 1}`,
    fundName: fundData.fundName || '',
    fundUTR: fundData.fundUTR || '',

    partnerName: lpData.partnerName,
    partnerUTR: lpData.utr || '',
    ownershipPercentage: pct,

    allocations: {
      ukTradingIncome: _allocateByOwnership(fundData.ukTradingIncome || 0, pct),
      ukCapitalGains: _allocateByOwnership(fundData.ukCapitalGains || 0, pct),
      ukPropertyIncome: _allocateByOwnership(fundData.ukPropertyIncome || 0, pct),
      interestIncome: _allocateByOwnership(fundData.interestIncome || 0, pct),
      excessReportableIncome: _allocateByOwnership(fundData.excessReportableIncome || 0, pct),
      withholdingTaxDeducted: _allocateByOwnership(fundData.withholdingTaxDeducted || 0, pct),
    },

    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// EU Tax Certificate Generator
// ---------------------------------------------------------------------------

/**
 * Country-specific income categories for EU tax certificates.
 */
const EU_INCOME_CATEGORIES = {
  Germany: [
    'tradingIncome',
    'capitalGains',
    'interestIncome',
    'dividendIncome',
    'rentalIncome',
    'otherIncome',
  ],
  France: [
    'tradingIncome',
    'capitalGains',
    'dividendIncome',
    'interestIncome',
    'frenchSourcePropertyIncome',
    'otherIncome',
  ],
  Luxembourg: [
    'tradingIncome',
    'capitalGains',
    'dividendIncome',
    'interestIncome',
    'otherIncome',
  ],
  Netherlands: [
    'tradingIncome',
    'capitalGains',
    'dividendIncome',
    'interestIncome',
    'otherIncome',
  ],
  Ireland: [
    'tradingIncome',
    'capitalGains',
    'dividendIncome',
    'interestIncome',
    'otherIncome',
  ],
};

/**
 * Default treaty withholding rates by country pair for common income types.
 */
const DEFAULT_TREATY_RATES = {
  Germany: { dividends: 0.15, interest: 0, capitalGains: 0 },
  France: { dividends: 0.15, interest: 0, capitalGains: 0 },
  Luxembourg: { dividends: 0.15, interest: 0, capitalGains: 0 },
  Netherlands: { dividends: 0.15, interest: 0, capitalGains: 0 },
  Ireland: { dividends: 0.15, interest: 0, capitalGains: 0 },
};

/**
 * Generate an EU Tax Certificate for a single limited partner.
 *
 * @param {object} fundData - Fund-level data with income broken out by category
 *   { fundName, incomeByCategory: { tradingIncome, capitalGains, ... }, totalWithholding }
 * @param {object} lpData - Individual LP data
 *   { partnerName, taxId, ownershipPct }
 * @param {number} taxYear
 * @param {string} country - EU country (Germany, France, Luxembourg, etc.)
 * @returns {object} Structured EU tax certificate
 */
function generateEUTaxCertificate(fundData, lpData, taxYear, country) {
  const pct = lpData.ownershipPct || 0;
  const categories = EU_INCOME_CATEGORIES[country] || EU_INCOME_CATEGORIES.Luxembourg;
  const treatyRates = DEFAULT_TREATY_RATES[country] || { dividends: 0.30, interest: 0.30, capitalGains: 0 };

  const incomeByCategory = {};
  const fundIncome = fundData.incomeByCategory || {};

  for (const cat of categories) {
    incomeByCategory[cat] = _allocateByOwnership(fundIncome[cat] || 0, pct);
  }

  const totalAllocatedIncome = Object.values(incomeByCategory).reduce((s, v) => s + v, 0);
  const withholdingApplied = _allocateByOwnership(fundData.totalWithholding || 0, pct);

  // Build look-through income detail: break down by domestic vs foreign source
  const lookThroughDetail = {
    domesticSourceIncome: _round(totalAllocatedIncome * 0.6), // placeholder split
    foreignSourceIncome: _round(totalAllocatedIncome * 0.4),
    totalAllocatedIncome: _round(totalAllocatedIncome),
  };

  return {
    form: `EU Tax Certificate – ${country}`,
    taxYear,
    fundName: fundData.fundName || '',
    jurisdiction: country,

    partnerName: lpData.partnerName,
    partnerTaxId: lpData.taxId || '',
    partnerJurisdiction: lpData.jurisdiction || country,
    ownershipPercentage: pct,

    incomeByCategory,

    applicableTreatyRates: {
      dividends: treatyRates.dividends,
      interest: treatyRates.interest,
      capitalGains: treatyRates.capitalGains,
    },

    withholdingApplied: _round(withholdingApplied),

    lookThroughIncomeDetail: lookThroughDetail,

    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  generateK1,
  generateUKTaxStatement,
  generateEUTaxCertificate,
};
