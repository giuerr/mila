/**
 * FATCA and CRS Compliance Module
 * Agent: Mila (Finance Principal)
 *
 * Screens investors for FATCA/CRS obligations, generates Form 8966
 * and CRS XML-ready data, and checks for US indicia.
 */

'use strict';

// ---------------------------------------------------------------------------
// US Indicia indicators (FATCA)
// ---------------------------------------------------------------------------

const US_INDICIA_CHECKS = [
  {
    key: 'usAddress',
    label: 'US mailing or residence address',
    test: (inv) =>
      (inv.address && /\bUS\b|United States|USA/i.test(inv.address)) ||
      (inv.country && /^US$/i.test(inv.country)),
  },
  {
    key: 'usPhone',
    label: 'US telephone number',
    test: (inv) =>
      inv.phone && /^\+?1[2-9]\d{9}$/.test(inv.phone.replace(/[\s\-().]/g, '')),
  },
  {
    key: 'usBirthplace',
    label: 'US place of birth',
    test: (inv) =>
      inv.birthplace && /\bUS\b|United States|USA/i.test(inv.birthplace),
  },
  {
    key: 'standingInstructionsToUS',
    label: 'Standing instructions to transfer funds to a US account',
    test: (inv) =>
      inv.standingInstructions &&
      /\bUS\b|United States|USA/i.test(inv.standingInstructions),
  },
  {
    key: 'usPowerOfAttorney',
    label: 'Power of attorney or signatory authority granted to person with US address',
    test: (inv) => !!inv.usPowerOfAttorney,
  },
  {
    key: 'usMailHoldOrInCareOf',
    label: '"In care of" or "hold mail" address that is the sole address',
    test: (inv) => !!inv.holdMailUS,
  },
];

// ---------------------------------------------------------------------------
// CRS Reportable Jurisdiction list (simplified – top jurisdictions)
// ---------------------------------------------------------------------------

const CRS_PARTICIPATING_JURISDICTIONS = new Set([
  'UK', 'Germany', 'France', 'Luxembourg', 'Netherlands', 'Ireland',
  'Switzerland', 'Japan', 'Australia', 'Canada', 'Italy', 'Spain',
  'Austria', 'Belgium', 'Denmark', 'Finland', 'Norway', 'Sweden',
  'Singapore', 'Hong Kong', 'India', 'South Korea', 'New Zealand',
  'Cayman Islands', 'BVI', 'Jersey', 'Guernsey', 'Isle of Man',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _generateId(prefix) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${ts}-${rand}`;
}

function _round(value, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Check an investor for US indicia (FATCA triggers).
 *
 * @param {object} investor
 *   { name, country, address, phone, birthplace, standingInstructions,
 *     usPowerOfAttorney, holdMailUS }
 * @returns {object} { hasUSIndicia, indicia: string[] }
 */
function checkIndicia(investor) {
  const indicia = [];

  for (const check of US_INDICIA_CHECKS) {
    if (check.test(investor)) {
      indicia.push({
        key: check.key,
        label: check.label,
      });
    }
  }

  return {
    hasUSIndicia: indicia.length > 0,
    indicia,
  };
}

/**
 * Screen an investor for both FATCA and CRS reporting requirements.
 *
 * @param {object} investor
 *   { name, country, type ('individual'|'entity'), tin, address, phone,
 *     birthplace, standingInstructions, usPowerOfAttorney, holdMailUS,
 *     fundCountry }
 * @returns {object} Screening result
 */
function screenInvestor(investor) {
  const investorCountry = investor.country || '';
  const fundCountry = investor.fundCountry || 'US';
  const indiciaResult = checkIndicia(investor);

  // FATCA status
  const isUSPerson = /^US$/i.test(investorCountry);
  let fatcaStatus;
  if (isUSPerson) {
    fatcaStatus = 'US Person – exempt from FATCA reporting (domestic)';
  } else if (indiciaResult.hasUSIndicia) {
    fatcaStatus = 'Non-US with US indicia – FATCA reportable unless cured';
  } else {
    fatcaStatus = 'Non-US, no US indicia – not FATCA reportable';
  }

  const fatcaReportingRequired = !isUSPerson && indiciaResult.hasUSIndicia;

  // CRS status
  const isCRSJurisdiction = CRS_PARTICIPATING_JURISDICTIONS.has(investorCountry);
  const isDomestic = investorCountry === fundCountry;
  let crsStatus;
  if (isDomestic) {
    crsStatus = 'Domestic investor – not CRS reportable';
  } else if (isCRSJurisdiction) {
    crsStatus = `Foreign investor from CRS jurisdiction (${investorCountry}) – CRS reportable`;
  } else {
    crsStatus = `Foreign investor from non-CRS jurisdiction (${investorCountry}) – may still require reporting`;
  }

  const crsReportingRequired = !isDomestic && isCRSJurisdiction;

  return {
    investorName: investor.name,
    investorCountry,
    fundCountry,
    fatcaStatus,
    crsStatus,
    fatcaReportingRequired,
    crsReportingRequired,
    reportingRequired: fatcaReportingRequired || crsReportingRequired,
    indicia: indiciaResult.indicia,
  };
}

/**
 * Generate structured Form 8966 data for FATCA reporting.
 *
 * @param {object} fundData
 *   { fundName, fundEIN, fundGIIN, fundAddress, sponsorName, sponsorGIIN }
 * @param {object[]} foreignInvestors - Array of investor objects
 *   { name, country, tin, address, accountNumber, accountBalance, grossProceeds,
 *     grossIncome, phone, birthplace, standingInstructions }
 * @param {number} taxYear
 * @returns {object} Structured Form 8966 data
 */
function generateForm8966(fundData, foreignInvestors, taxYear) {
  const reportableAccounts = [];

  for (const investor of foreignInvestors) {
    const indiciaResult = checkIndicia(investor);

    // Only include investors with US indicia or who are US persons abroad
    if (!indiciaResult.hasUSIndicia && !/^US$/i.test(investor.country)) {
      continue;
    }

    reportableAccounts.push({
      accountHolderName: investor.name,
      accountHolderCountry: investor.country,
      accountHolderTIN: investor.tin || 'Applied For',
      accountHolderAddress: investor.address || '',
      accountNumber: investor.accountNumber || '',
      accountBalance: _round(investor.accountBalance || 0),
      grossProceeds: _round(investor.grossProceeds || 0),
      grossIncome: _round(investor.grossIncome || 0),
      indicia: indiciaResult.indicia.map((i) => i.label),
    });
  }

  return {
    form: 'Form 8966',
    taxYear,
    filingType: 'Original',
    filer: {
      name: fundData.fundName || '',
      ein: fundData.fundEIN || '',
      giin: fundData.fundGIIN || '',
      address: fundData.fundAddress || '',
      sponsorName: fundData.sponsorName || '',
      sponsorGIIN: fundData.sponsorGIIN || '',
    },
    reportableAccounts,
    totalReportableAccounts: reportableAccounts.length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate CRS XML-ready data for automatic exchange of information.
 *
 * @param {object} fundData
 *   { fundName, fundCountry, fundGIIN, regulatorName }
 * @param {object[]} investors - All investors (domestic will be filtered out)
 *   { name, country, type, tin, address, birthDate, accountNumber,
 *     accountBalance, grossProceeds, grossIncome }
 * @param {number} reportingYear
 * @returns {object} CRS report data structured for XML generation
 */
function generateCRSReport(fundData, investors, reportingYear) {
  const fundCountry = fundData.fundCountry || 'US';
  const reportableAccounts = [];

  for (const investor of investors) {
    const investorCountry = investor.country || '';

    // Skip domestic investors
    if (investorCountry === fundCountry) continue;

    // Skip non-CRS jurisdictions
    if (!CRS_PARTICIPATING_JURISDICTIONS.has(investorCountry)) continue;

    const accountType = investor.type === 'entity' ? 'CRS502' : 'CRS501';

    reportableAccounts.push({
      docRefId: _generateId('CRS'),
      accountHolderType: investor.type === 'entity' ? 'Organisation' : 'Individual',
      accountHolderName: investor.name,
      accountHolderCountry: investorCountry,
      accountHolderTIN: investor.tin || '',
      tinIssuedBy: investorCountry,
      address: investor.address || '',
      birthDate: investor.birthDate || null,
      accountNumber: investor.accountNumber || '',
      accountType,
      accountBalance: {
        currCode: 'USD',
        amount: _round(investor.accountBalance || 0),
      },
      payment: [
        {
          type: 'CRS501', // dividends
          currCode: 'USD',
          amount: _round(investor.grossIncome || 0),
        },
        {
          type: 'CRS503', // gross proceeds
          currCode: 'USD',
          amount: _round(investor.grossProceeds || 0),
        },
      ],
    });
  }

  // Group accounts by reporting jurisdiction
  const byJurisdiction = {};
  for (const acct of reportableAccounts) {
    const jur = acct.accountHolderCountry;
    if (!byJurisdiction[jur]) {
      byJurisdiction[jur] = [];
    }
    byJurisdiction[jur].push(acct);
  }

  return {
    messageType: 'CRS',
    messageRefId: _generateId('MSG'),
    reportingYear,
    timestamp: new Date().toISOString(),
    sendingCountry: fundCountry,
    reportingFI: {
      name: fundData.fundName || '',
      country: fundCountry,
      giin: fundData.fundGIIN || '',
    },
    reportsByJurisdiction: byJurisdiction,
    totalReportableAccounts: reportableAccounts.length,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  screenInvestor,
  generateForm8966,
  generateCRSReport,
  checkIndicia,
  CRS_PARTICIPATING_JURISDICTIONS,
};
