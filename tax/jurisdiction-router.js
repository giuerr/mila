/**
 * Jurisdiction Router - Investor classification and tax treatment
 * Agent: Mila (CFO/Reporting)
 *
 * Detects investor jurisdiction, resolves applicable tax treaty rates,
 * withholding obligations, and required tax forms.
 */

'use strict';

// ---------------------------------------------------------------------------
// Tax treaty data
// ---------------------------------------------------------------------------

/**
 * Bilateral treaty withholding rates.
 * Key format: "sourceCountry-investorCountry" (alphabetical pair).
 * Rates expressed as decimals (0.15 = 15%).
 */
const TREATY_RATES = {
  'US-UK': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0,
    royalties: 0,
  },
  'US-Germany': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0,
    royalties: 0,
  },
  'US-France': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0,
    royalties: 0,
  },
  'US-Luxembourg': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0,
    royalties: 0,
  },
  'US-Netherlands': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0,
    royalties: 0,
  },
  'US-Ireland': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0,
    royalties: 0,
  },
  'US-Switzerland': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0,
    royalties: 0,
  },
  'US-Japan': {
    capitalGains: 0,
    dividends: 0.10,
    interest: 0.10,
    royalties: 0,
  },
  'US-Canada': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0.10,
    royalties: 0.10,
  },
  'US-Australia': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0.10,
    royalties: 0.05,
  },
  'UK-Germany': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0,
    royalties: 0,
  },
  'UK-France': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0,
    royalties: 0,
  },
  'UK-Luxembourg': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0,
    royalties: 0,
  },
  'US-Korea': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0.12,
    royalties: 0.15,
  },
  'UK-Japan': {
    capitalGains: 0,
    dividends: 0.10,
    interest: 0,
    royalties: 0,
  },
  'UK-Korea': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0.10,
    royalties: 0.10,
  },
  'Japan-Korea': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0.10,
    royalties: 0.10,
  },
  'Germany-Japan': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0,
    royalties: 0,
  },
  'Germany-Korea': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0.10,
    royalties: 0.10,
  },
  'France-Japan': {
    capitalGains: 0,
    dividends: 0.10,
    interest: 0,
    royalties: 0,
  },
  'France-Korea': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0.10,
    royalties: 0.10,
  },
  'Luxembourg-Japan': {
    capitalGains: 0,
    dividends: 0.10,
    interest: 0,
    royalties: 0,
  },
  'Luxembourg-Korea': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0.10,
    royalties: 0.10,
  },
  'Singapore-Japan': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0.10,
    royalties: 0.10,
  },
  'Singapore-Korea': {
    capitalGains: 0,
    dividends: 0.15,
    interest: 0.10,
    royalties: 0.15,
  },
};

const DEFAULT_NON_TREATY_RATE = 0.30;
const DOMESTIC_RATE = 0;

// ---------------------------------------------------------------------------
// Form requirements by investor/fund country combination
// ---------------------------------------------------------------------------

const FORM_REQUIREMENTS = {
  US: {
    domestic: {
      individual: ['Schedule K-1 (Form 1065)', 'Form 1040 (individual)'],
      entity: ['Schedule K-1 (Form 1065)'],
    },
    foreign: {
      individual: ['Form W-8BEN', 'Form 8805', 'Form 8804'],
      entity: ['Form W-8BEN-E', 'Form 8805', 'Form 8804'],
    },
  },
  UK: {
    domestic: {
      individual: ['SA800 (partnership)', 'SA800-PS (partner statement)'],
      entity: ['SA800 (partnership)', 'CT600 (corporate partner)'],
    },
    foreign: {
      individual: ['SA800 (partnership)', 'Non-resident partner statement'],
      entity: ['SA800 (partnership)', 'Non-resident entity statement'],
    },
  },
  Luxembourg: {
    domestic: {
      individual: ['SCSp annual return', 'Luxembourg income tax return'],
      entity: ['SCSp annual return'],
    },
    foreign: {
      individual: ['SCSp annual return', 'CRS report', 'FATCA report'],
      entity: ['SCSp annual return', 'CRS report', 'FATCA report'],
    },
  },
  Germany: {
    domestic: {
      individual: ['Feststellungserklärung', 'Tax certificate to LP'],
      entity: ['Feststellungserklärung', 'Tax certificate to LP'],
    },
    foreign: {
      individual: ['Feststellungserklärung', 'Tax certificate to LP', 'WHT certificate'],
      entity: ['Feststellungserklärung', 'Tax certificate to LP', 'WHT certificate'],
    },
  },
  France: {
    domestic: {
      individual: ['Form 2072', 'Form 2044 (partner)'],
      entity: ['Form 2072'],
    },
    foreign: {
      individual: ['Form 2072', 'Form 3916', 'WHT certificate'],
      entity: ['Form 2072', 'WHT certificate'],
    },
  },
  Japan: {
    domestic: {
      individual: ['Partnership income report (Kumiai soneki haibunsho)', 'Individual income tax return (Kakutei shinkoku)'],
      entity: ['Partnership income report', 'Corporate tax return (Hōjinzei shinkokusho)'],
    },
    foreign: {
      individual: ['WHT certificate (Gensen chōshūhyō)', 'Non-resident tax return'],
      entity: ['WHT certificate (Gensen chōshūhyō)', 'Treaty benefit application (Jōyaku tōdoke)'],
    },
  },
  Korea: {
    domestic: {
      individual: ['PEF income report', 'Comprehensive income tax return (Jonghap sodeugsae shinkoseo)'],
      entity: ['PEF income report', 'Corporate tax return (Beopinsae shinkoseo)'],
    },
    foreign: {
      individual: ['WHT certificate', 'Non-resident tax filing', 'Treaty benefit application'],
      entity: ['WHT certificate', 'Limited tax liability return', 'Treaty benefit application'],
    },
  },
};

// ---------------------------------------------------------------------------
// Reporting obligations by jurisdiction
// ---------------------------------------------------------------------------

const REPORTING_OBLIGATIONS = {
  US: ['FATCA (Form 8966)', 'FBAR if applicable', 'State-level filings if nexus exists'],
  UK: ['CRS reporting', 'FATCA reporting', 'Reporting Fund Status (if applicable)'],
  Luxembourg: ['CRS reporting', 'FATCA reporting', 'Net wealth tax reporting'],
  Germany: ['CRS reporting', 'FATCA reporting', 'Investment tax reporting'],
  France: ['CRS reporting', 'FATCA reporting', 'Form 3916 foreign account disclosure'],
  Japan: ['CRS reporting', 'FATCA reporting (IGA Model 1)', 'Partnership income allocation report', 'Non-resident WHT reporting'],
  Korea: ['CRS reporting', 'FATCA reporting (IGA Model 1)', 'PEF income distribution report', 'Foreign investor WHT reporting'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _normalizePair(countryA, countryB) {
  const pair = [countryA, countryB].sort();
  return pair.join('-');
}

function _isTreatyCountry(countryA, countryB) {
  return !!TREATY_RATES[_normalizePair(countryA, countryB)];
}

function _isDomestic(investorCountry, fundCountry) {
  return investorCountry === fundCountry;
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Classify an investor and determine full tax treatment profile.
 *
 * @param {object} investor
 *   { name, country, type ('individual'|'entity'), fundCountry }
 * @returns {object} Classification result
 */
function classifyInvestor(investor) {
  const investorCountry = investor.country || 'US';
  const fundCountry = investor.fundCountry || 'US';
  const investorType = investor.type || 'individual';
  const domestic = _isDomestic(investorCountry, fundCountry);

  const pairKey = _normalizePair(investorCountry, fundCountry);
  const hasTreaty = !domestic && _isTreatyCountry(investorCountry, fundCountry);
  const treatyRates = hasTreaty ? TREATY_RATES[pairKey] : null;

  let withholdingRate;
  if (domestic) {
    withholdingRate = DOMESTIC_RATE;
  } else if (hasTreaty) {
    withholdingRate = treatyRates.dividends; // default to dividend rate
  } else {
    withholdingRate = DEFAULT_NON_TREATY_RATE;
  }

  const requiredForms = getRequiredForms(investorCountry, fundCountry, investorType);
  const reportingObligations = REPORTING_OBLIGATIONS[fundCountry] || [];

  return {
    investorName: investor.name,
    investorCountry,
    fundCountry,
    investorType,
    domestic,
    jurisdiction: investorCountry,
    taxTreaty: hasTreaty ? pairKey : null,
    treatyRates: treatyRates || null,
    withholdingRate,
    requiredForms,
    reportingObligations,
  };
}

/**
 * Get the applicable withholding rate for a specific income type.
 *
 * @param {string} investorCountry
 * @param {string} incomeType - 'capitalGains'|'dividends'|'interest'|'royalties'
 * @param {string} [fundCountry='US']
 * @returns {number} Withholding rate as a decimal
 */
function getWithholdingRate(investorCountry, incomeType, fundCountry = 'US') {
  if (_isDomestic(investorCountry, fundCountry)) {
    return DOMESTIC_RATE;
  }

  const pairKey = _normalizePair(investorCountry, fundCountry);
  const treaty = TREATY_RATES[pairKey];

  if (treaty && treaty[incomeType] !== undefined) {
    return treaty[incomeType];
  }

  return DEFAULT_NON_TREATY_RATE;
}

/**
 * Get the list of required tax forms for a given investor/fund/country combination.
 *
 * @param {string} investorCountry
 * @param {string} fundCountry
 * @param {string} investorType - 'individual'|'entity'
 * @returns {string[]} Array of form names
 */
function getRequiredForms(investorCountry, fundCountry, investorType) {
  const countryForms = FORM_REQUIREMENTS[fundCountry];
  if (!countryForms) return [];

  const domestic = _isDomestic(investorCountry, fundCountry);
  const residencyGroup = domestic ? 'domestic' : 'foreign';
  const typeKey = investorType === 'entity' ? 'entity' : 'individual';

  const forms = countryForms[residencyGroup] && countryForms[residencyGroup][typeKey];
  return forms ? [...forms] : [];
}

module.exports = {
  classifyInvestor,
  getWithholdingRate,
  getRequiredForms,
  TREATY_RATES,
};
