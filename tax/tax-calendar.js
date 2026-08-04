/**
 * Tax Calendar - Filing deadlines by jurisdiction
 * Agent: Mila (CFO/Reporting)
 *
 * Tracks tax filing deadlines for all fund jurisdictions and provides
 * upcoming/overdue alerts.
 */

'use strict';

// ---------------------------------------------------------------------------
// Deadline data keyed by jurisdiction
// ---------------------------------------------------------------------------

const DEADLINES = {
  US: [
    {
      form: 'Form 1065',
      jurisdiction: 'US',
      description: 'US Partnership Return of Income',
      month: 3,
      day: 15,
      filedBy: 'Fund Administrator / Tax Preparer',
      recipientType: 'IRS',
    },
    {
      form: 'Schedule K-1',
      jurisdiction: 'US',
      description: 'Partner share of income, deductions, credits – distributed to each LP',
      month: 3,
      day: 15,
      filedBy: 'Fund Administrator',
      recipientType: 'Partners',
    },
    {
      form: 'Form 8804',
      jurisdiction: 'US',
      description: 'Annual Return for Partnership Withholding Tax (Section 1446)',
      month: 3,
      day: 15,
      filedBy: 'Fund Administrator / Tax Preparer',
      recipientType: 'IRS',
    },
    {
      form: 'Form 8966',
      jurisdiction: 'US',
      description: 'FATCA Report – Foreign Account Tax Compliance Act reporting',
      month: 3,
      day: 31,
      filedBy: 'Fund Compliance Officer',
      recipientType: 'IRS',
    },
    {
      form: 'Form 7004 / Extensions',
      jurisdiction: 'US',
      description: 'Extended filing deadline for partnership returns',
      month: 9,
      day: 15,
      filedBy: 'Fund Administrator / Tax Preparer',
      recipientType: 'IRS',
    },
  ],

  UK: [
    {
      form: 'SA800',
      jurisdiction: 'UK',
      description: 'UK Partnership Tax Return',
      month: 1,
      day: 31,
      filedBy: 'Fund Administrator / Tax Adviser',
      recipientType: 'HMRC',
    },
    {
      form: 'RFS Annual Report',
      jurisdiction: 'UK',
      description: 'Reporting Fund Status annual report – due 6 months after fund year-end',
      month: null, // relative to year-end
      day: null,
      relativeDays: 183, // ~6 months after year-end
      filedBy: 'Fund Manager / Tax Adviser',
      recipientType: 'HMRC',
    },
    {
      form: 'Section 12A/17 Reporting',
      jurisdiction: 'UK',
      description: 'Annual reporting requirement under ITA 2007 s12A / s17 for partnerships',
      month: 12,
      day: 31,
      filedBy: 'Fund Manager',
      recipientType: 'HMRC',
    },
  ],

  Luxembourg: [
    {
      form: 'SCSp Tax Return',
      jurisdiction: 'Luxembourg',
      description: 'Luxembourg special limited partnership annual tax return',
      month: 3,
      day: 31,
      filedBy: 'Luxembourg Tax Adviser',
      recipientType: 'Administration des Contributions Directes',
    },
    {
      form: 'Net Wealth Tax Declaration',
      jurisdiction: 'Luxembourg',
      description: 'Annual net wealth tax declaration',
      month: 1,
      day: 31,
      filedBy: 'Luxembourg Tax Adviser',
      recipientType: 'Administration des Contributions Directes',
    },
    {
      form: 'CRS / FATCA Report',
      jurisdiction: 'Luxembourg',
      description: 'Common Reporting Standard and FATCA annual exchange of information',
      month: 6,
      day: 30,
      filedBy: 'Fund Compliance Officer',
      recipientType: 'Administration des Contributions Directes',
    },
  ],

  Germany: [
    {
      form: 'Feststellungserklärung',
      jurisdiction: 'Germany',
      description: 'Separate and uniform determination of income for partnerships',
      month: 7,
      day: 31,
      filedBy: 'German Tax Adviser',
      recipientType: 'Finanzamt',
    },
    {
      form: 'Tax Certificates to LPs',
      jurisdiction: 'Germany',
      description: 'Individual tax certificates issued to limited partners – due within 2 months of filing',
      month: null,
      day: null,
      relativeToFiling: true,
      relativeDays: 60,
      filedBy: 'German Tax Adviser',
      recipientType: 'Partners',
    },
  ],

  France: [
    {
      form: 'Form 2072',
      jurisdiction: 'France',
      description: 'French partnership income tax return (société civile)',
      month: 5,
      day: 3,
      filedBy: 'French Tax Adviser',
      recipientType: 'Direction Générale des Finances Publiques',
    },
    {
      form: 'Form 3916',
      jurisdiction: 'France',
      description: 'Declaration of foreign bank accounts – filed with personal return',
      month: 5,
      day: 31, // approximate – filed alongside personal return
      filedBy: 'Individual Partner / Tax Adviser',
      recipientType: 'Direction Générale des Finances Publiques',
    },
  ],
  Italy: [
    {
      form: 'Modello Redditi SC',
      jurisdiction: 'Italy',
      description: 'Corporate income tax return for fund vehicles (SGR/SICAV)',
      dueMonth: 11, dueDay: 30,
      filedBy: 'Fund Manager (SGR)',
      recipientType: 'Agenzia delle Entrate',
    },
    {
      form: 'Modello 770',
      jurisdiction: 'Italy',
      description: 'Withholding tax return — reporting substitute tax (imposta sostitutiva) on investor distributions',
      dueMonth: 10, dueDay: 31,
      filedBy: 'Fund Manager',
      recipientType: 'Agenzia delle Entrate',
    },
    {
      form: 'CRS / FATCA Italy',
      jurisdiction: 'Italy',
      description: 'Common Reporting Standard and FATCA filing to Agenzia delle Entrate',
      dueMonth: 6, dueDay: 30,
      filedBy: 'Fund / Financial Institution',
      recipientType: 'Agenzia delle Entrate',
    },
  ],
  Spain: [
    {
      form: 'Modelo 200',
      jurisdiction: 'Spain',
      description: 'Corporate income tax return (Impuesto sobre Sociedades) for fund entities',
      dueMonth: 7, dueDay: 25,
      filedBy: 'Fund Entity',
      recipientType: 'Agencia Tributaria',
    },
    {
      form: 'Modelo 296',
      jurisdiction: 'Spain',
      description: 'Annual summary of withholding on non-resident income (IRNR)',
      dueMonth: 1, dueDay: 31,
      filedBy: 'Fund Manager',
      recipientType: 'Agencia Tributaria',
    },
    {
      form: 'Modelo 720',
      jurisdiction: 'Spain',
      description: 'Declaration of overseas assets — required for Spanish resident LPs with foreign fund holdings >€50k',
      dueMonth: 3, dueDay: 31,
      filedBy: 'LP (Spanish resident)',
      recipientType: 'Agencia Tributaria',
    },
  ],
  Switzerland: [
    {
      form: 'DA-1 / R-US 164',
      jurisdiction: 'Switzerland',
      description: 'Claim for refund of foreign withholding tax under double tax treaties',
      dueMonth: 12, dueDay: 31,
      filedBy: 'LP / Fund',
      recipientType: 'Eidgenössische Steuerverwaltung (ESTV)',
    },
    {
      form: 'Verrechnungssteuer Declaration',
      jurisdiction: 'Switzerland',
      description: 'Anticipatory tax (Verrechnungssteuer) return on Swiss-source income distributions',
      dueMonth: 3, dueDay: 31,
      filedBy: 'Fund Entity',
      recipientType: 'ESTV',
    },
    {
      form: 'AIA / CRS Switzerland',
      jurisdiction: 'Switzerland',
      description: 'Automatic Exchange of Information under CRS with participating jurisdictions',
      dueMonth: 6, dueDay: 30,
      filedBy: 'Financial Institution',
      recipientType: 'ESTV',
    },
    {
      form: 'Swiss Tax Statement (Steuerausweis)',
      jurisdiction: 'Switzerland',
      description: 'Annual tax statement for investors showing taxable income components',
      dueMonth: 3, dueDay: 31,
      filedBy: 'Fund Manager',
      recipientType: 'LP / Cantonal Tax Authority',
    },
  ],
  Japan: [
    {
      form: 'Corporate Tax Return (Hōjinzei shinkokusho)',
      jurisdiction: 'Japan',
      description: 'Annual corporate income tax return for fund entity (GK or KK)',
      dueMonth: 5, dueDay: 31,
      filedBy: 'Fund Entity',
      recipientType: 'NTA (National Tax Agency)',
    },
    {
      form: 'Partnership Income Allocation Report (Kumiai soneki haibunsho)',
      jurisdiction: 'Japan',
      description: 'Annual allocation of partnership income/loss to each partner (LPS or TK)',
      dueMonth: 3, dueDay: 15,
      filedBy: 'Fund Manager / GP',
      recipientType: 'LP / NTA',
    },
    {
      form: 'Withholding Tax Return (Gensen chōshū shinkoku)',
      jurisdiction: 'Japan',
      description: 'Monthly/annual withholding tax return for distributions to non-resident investors',
      dueMonth: 1, dueDay: 31,
      filedBy: 'Fund Entity',
      recipientType: 'NTA',
    },
    {
      form: 'CRS / FATCA Report (Japan)',
      jurisdiction: 'Japan',
      description: 'Annual CRS and FATCA reporting under IGA Model 1 to NTA',
      dueMonth: 4, dueDay: 30,
      filedBy: 'Financial Institution',
      recipientType: 'NTA',
    },
    {
      form: 'JFSA Annual Report',
      jurisdiction: 'Japan',
      description: 'Annual regulatory report to FSA for registered fund managers',
      dueMonth: 6, dueDay: 30,
      filedBy: 'Fund Manager',
      recipientType: 'JFSA',
    },
  ],
  Korea: [
    {
      form: 'Corporate Tax Return (Beopinsae shinkoseo)',
      jurisdiction: 'Korea',
      description: 'Annual corporate income tax return — filed within 3 months of fiscal year-end',
      dueMonth: 3, dueDay: 31,
      filedBy: 'Fund Entity',
      recipientType: 'NTS (National Tax Service)',
    },
    {
      form: 'PEF Income Distribution Report',
      jurisdiction: 'Korea',
      description: 'Annual report of income distributed to PEF partners',
      dueMonth: 3, dueDay: 31,
      filedBy: 'GP / Fund Manager',
      recipientType: 'LP / NTS',
    },
    {
      form: 'Withholding Tax Return (Korea)',
      jurisdiction: 'Korea',
      description: 'Monthly withholding tax return for distributions to non-resident investors',
      dueMonth: 2, dueDay: 10,
      filedBy: 'Fund Entity / GP',
      recipientType: 'NTS',
    },
    {
      form: 'CRS / FATCA Report (Korea)',
      jurisdiction: 'Korea',
      description: 'Annual CRS and FATCA reporting under IGA Model 1 to NTS',
      dueMonth: 6, dueDay: 30,
      filedBy: 'Financial Institution',
      recipientType: 'NTS',
    },
    {
      form: 'FSC Fund Registration Report',
      jurisdiction: 'Korea',
      description: 'Annual regulatory report to FSC for registered PEF managers',
      dueMonth: 3, dueDay: 31,
      filedBy: 'Fund Manager',
      recipientType: 'FSC / FSS',
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an absolute Date for a deadline in a given tax year.
 * For deadlines with only month/day the date falls in the calendar year
 * following the tax year (e.g. tax year 2024 → March 15 2025).
 * Some deadlines (UK RFS, German LP certs) are relative and returned as null
 * unless a yearEndDate is provided in options.
 */
function _resolveDate(template, taxYear, options = {}) {
  const filingYear = taxYear + 1; // deadlines fall in the year after the tax year

  if (template.month !== null && template.day !== null) {
    return new Date(filingYear, template.month - 1, template.day);
  }

  // Relative to year-end (e.g. UK RFS)
  if (template.relativeDays && !template.relativeToFiling) {
    const yearEnd = options.yearEndDate
      ? new Date(options.yearEndDate)
      : new Date(taxYear, 11, 31); // default Dec 31
    const result = new Date(yearEnd);
    result.setDate(result.getDate() + template.relativeDays);
    return result;
  }

  // Relative to another filing (e.g. German LP certs relative to Feststellungserklärung)
  if (template.relativeToFiling && template.relativeDays) {
    // Use Feststellungserklärung date + 60 days as a default anchor
    const anchorDate = options.anchorDate
      ? new Date(options.anchorDate)
      : new Date(filingYear, 6, 31); // July 31
    const result = new Date(anchorDate);
    result.setDate(result.getDate() + template.relativeDays);
    return result;
  }

  return null;
}

/**
 * Determine filing status based on current date and due date.
 */
function _resolveStatus(dueDate, filedDate) {
  if (filedDate) return 'filed';
  if (!dueDate) return 'upcoming';

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'overdue';
  if (diffDays <= 30) return 'due';
  return 'upcoming';
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Get all filing deadlines for a jurisdiction and tax year.
 *
 * @param {string} jurisdiction - Country code (US, UK, Luxembourg, Germany, France)
 * @param {number} taxYear - The tax year (e.g. 2025)
 * @param {object} [options] - Optional: { yearEndDate, anchorDate }
 * @returns {object[]} Array of deadline records
 */
function getDeadlines(jurisdiction, taxYear, options = {}) {
  const key = jurisdiction.toUpperCase() === 'LU' ? 'Luxembourg' : jurisdiction;
  const templates = DEADLINES[key];

  if (!templates) {
    return [];
  }

  return templates.map((tmpl) => {
    const dueDate = _resolveDate(tmpl, taxYear, options);
    return {
      form: tmpl.form,
      jurisdiction: tmpl.jurisdiction,
      description: tmpl.description,
      dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
      filedBy: tmpl.filedBy,
      recipientType: tmpl.recipientType,
      taxYear,
      status: _resolveStatus(dueDate, null),
    };
  });
}

/**
 * Get all deadlines across every jurisdiction that fall within the next N days.
 *
 * @param {number} days - Look-ahead window in days
 * @param {number} [taxYear] - Defaults to current calendar year minus 1
 * @param {object} [options] - Optional: { yearEndDate, anchorDate }
 * @returns {object[]} Sorted array of upcoming deadline records
 */
function getUpcoming(days, taxYear, options = {}) {
  const effectiveTaxYear = taxYear !== undefined ? taxYear : new Date().getFullYear() - 1;
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + days);

  const results = [];

  for (const jurisdiction of Object.keys(DEADLINES)) {
    const deadlines = getDeadlines(jurisdiction, effectiveTaxYear, options);
    for (const dl of deadlines) {
      if (!dl.dueDate) continue;
      const due = new Date(dl.dueDate);
      if (due >= now && due <= horizon) {
        results.push(dl);
      }
    }
  }

  results.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  return results;
}

/**
 * Check for any overdue (past-due and unfiled) deadlines across all jurisdictions.
 *
 * @param {number} [taxYear] - Defaults to current calendar year minus 1
 * @param {object} [options] - Optional: { yearEndDate, anchorDate }
 * @returns {object[]} Array of overdue deadline records
 */
function checkOverdue(taxYear, options = {}) {
  const effectiveTaxYear = taxYear !== undefined ? taxYear : new Date().getFullYear() - 1;

  const results = [];

  for (const jurisdiction of Object.keys(DEADLINES)) {
    const deadlines = getDeadlines(jurisdiction, effectiveTaxYear, options);
    for (const dl of deadlines) {
      if (dl.status === 'overdue') {
        results.push(dl);
      }
    }
  }

  results.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  return results;
}

module.exports = {
  getDeadlines,
  getUpcoming,
  checkOverdue,
  DEADLINES,
};
