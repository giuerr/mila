/**
 * Compliance & Regulatory Calendar Service
 * Tracks every filing, deadline, and obligation across jurisdictions.
 * Automated alerts and escalation.
 */

class ComplianceCalendarService {

  constructor() {
    this.filings = [];
  }

  /**
   * Generate annual regulatory calendar for a fund
   */
  generateAnnualCalendar({ fundJurisdictions, fiscalYearEnd, year }) {
    const calendar = [];

    for (const jurisdiction of fundJurisdictions) {
      const filings = this._getFilingsForJurisdiction(jurisdiction, year, fiscalYearEnd);
      calendar.push(...filings);
    }

    // Sort by deadline
    calendar.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    return {
      year,
      fiscalYearEnd,
      jurisdictions: fundJurisdictions,
      totalFilings: calendar.length,
      filings: calendar,
      byQuarter: {
        Q1: calendar.filter(f => this._getQuarter(f.deadline) === 1),
        Q2: calendar.filter(f => this._getQuarter(f.deadline) === 2),
        Q3: calendar.filter(f => this._getQuarter(f.deadline) === 3),
        Q4: calendar.filter(f => this._getQuarter(f.deadline) === 4)
      },
      upcomingNext30Days: calendar.filter(f => {
        const days = (new Date(f.deadline) - new Date()) / (1000 * 60 * 60 * 24);
        return days >= 0 && days <= 30;
      })
    };
  }

  /**
   * Get filing status dashboard
   */
  getFilingsDashboard(filings) {
    const statusCounts = { NOT_STARTED: 0, IN_PROGRESS: 0, UNDER_REVIEW: 0, FILED: 0, CONFIRMED: 0, OVERDUE: 0 };
    const now = new Date();

    for (const filing of filings) {
      if (filing.status !== 'FILED' && filing.status !== 'CONFIRMED' && new Date(filing.deadline) < now) {
        statusCounts.OVERDUE++;
      } else {
        statusCounts[filing.status]++;
      }
    }

    const overdue = filings.filter(f =>
      f.status !== 'FILED' && f.status !== 'CONFIRMED' && new Date(f.deadline) < now
    );

    const upcoming = filings
      .filter(f => f.status !== 'FILED' && f.status !== 'CONFIRMED')
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
      .slice(0, 10);

    return {
      statusSummary: statusCounts,
      overdueFilings: overdue.map(f => ({
        name: f.name,
        jurisdiction: f.jurisdiction,
        deadline: f.deadline,
        daysOverdue: Math.floor((now - new Date(f.deadline)) / (1000 * 60 * 60 * 24)),
        owner: f.owner,
        severity: 'CRITICAL'
      })),
      upcomingFilings: upcoming.map(f => ({
        name: f.name,
        jurisdiction: f.jurisdiction,
        deadline: f.deadline,
        daysUntilDeadline: Math.floor((new Date(f.deadline) - now) / (1000 * 60 * 60 * 24)),
        status: f.status,
        owner: f.owner
      })),
      completionRate: parseFloat((((statusCounts.FILED + statusCounts.CONFIRMED) / filings.length) * 100).toFixed(1)) + '%'
    };
  }

  /**
   * Get alert triggers
   */
  getAlerts(filings) {
    const now = new Date();
    const alerts = [];
    const alertThresholds = [30, 15, 7, 3, 1]; // days before deadline

    for (const filing of filings) {
      if (filing.status === 'FILED' || filing.status === 'CONFIRMED') continue;
      const daysUntil = Math.floor((new Date(filing.deadline) - now) / (1000 * 60 * 60 * 24));

      if (daysUntil < 0) {
        alerts.push({
          type: 'OVERDUE',
          severity: 'CRITICAL',
          filing: filing.name,
          jurisdiction: filing.jurisdiction,
          daysOverdue: Math.abs(daysUntil),
          message: `OVERDUE: ${filing.name} was due ${Math.abs(daysUntil)} days ago`,
          owner: filing.owner
        });
      } else {
        for (const threshold of alertThresholds) {
          if (daysUntil <= threshold) {
            alerts.push({
              type: 'UPCOMING',
              severity: daysUntil <= 3 ? 'HIGH' : daysUntil <= 7 ? 'MEDIUM' : 'LOW',
              filing: filing.name,
              jurisdiction: filing.jurisdiction,
              daysUntilDeadline: daysUntil,
              message: `${filing.name} due in ${daysUntil} days (${filing.deadline})`,
              owner: filing.owner
            });
            break; // Only show the most urgent alert
          }
        }
      }
    }

    return alerts.sort((a, b) => {
      const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  // --- Private ---

  _getFilingsForJurisdiction(jurisdiction, year, fyEnd) {
    const filings = {
      CAYMAN: [
        { name: 'CIMA Annual Registration', deadline: `${year}-01-15`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'CIMA Audited Financial Statements', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'CIMA Fund Annual Return (FAR)', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'CRS Reporting (Cayman)', deadline: `${year}-07-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'FATCA Reporting (Cayman)', deadline: `${year}-07-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Economic Substance Notification', deadline: `${year}-03-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Beneficial Ownership Regime Filing', deadline: `${year}-03-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'AML/KYC Annual Return', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],
      US: [
        { name: 'Form ADV Annual Amendment', deadline: `${year}-03-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Form PF (Q1)', deadline: `${year}-05-15`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Form PF (Q2)', deadline: `${year}-08-15`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Form PF (Q3)', deadline: `${year}-11-15`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Form PF (Q4)', deadline: `${year + 1}-02-15`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Partnership Tax Return (Form 1065)', deadline: `${year}-03-15`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'K-1 Distribution to Partners', deadline: `${year}-03-15`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'FATCA Reporting (Form 8966)', deadline: `${year}-03-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Forms 1042/1042-S (Withholding)', deadline: `${year}-03-15`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Form 13F (Q1)', deadline: `${year}-05-15`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Form 13F (Q2)', deadline: `${year}-08-15`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Form 13F (Q3)', deadline: `${year}-11-15`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Form 13F (Q4)', deadline: `${year + 1}-02-15`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' }
      ],
      EU: [
        { name: 'AIFMD Annex IV (Q1)', deadline: `${year}-04-30`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'AIFMD Annex IV (Q2)', deadline: `${year}-07-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'AIFMD Annex IV (Q3)', deadline: `${year}-10-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'AIFMD Annex IV (Q4)', deadline: `${year + 1}-01-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'SFDR Annual Disclosure', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],
      UK: [
        { name: 'FCA Annual Regulatory Return', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'UK AIFMD Reporting', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],
      LUXEMBOURG: [
        { name: 'CSSF Annual Report', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'CSSF AIFMD Reporting', deadline: `${year}-04-30`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Annual Accounts Filing (RCS)', deadline: `${year}-07-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      // ==================== OFFSHORE & CROWN DEPENDENCIES ====================

      BVI: [
        { name: 'BVI FSC Annual Return', deadline: `${year}-01-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'BVI FSC Audited Financial Statements', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'BVI Economic Substance Return', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'CRS Reporting (BVI)', deadline: `${year}-05-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'FATCA Reporting (BVI)', deadline: `${year}-05-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'AML/CFT Compliance Return', deadline: `${year}-03-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Beneficial Ownership Return (BOSS)', deadline: `${year}-01-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      GUERNSEY: [
        { name: 'GFSC Annual Return', deadline: `${year}-03-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'GFSC Audited Financial Statements', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'CRS Reporting (Guernsey)', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'FATCA Reporting (Guernsey)', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Beneficial Ownership Filing', deadline: `${year}-01-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'AML/CFT/CPF Annual Compliance Return', deadline: `${year}-03-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      JERSEY: [
        { name: 'JFSC Annual Return', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'JFSC Audited Financial Statements', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'CRS Reporting (Jersey)', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'FATCA Reporting (Jersey)', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Beneficial Ownership Filing', deadline: `${year}-01-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'AML/CFT Business Risk Assessment', deadline: `${year}-03-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      // ==================== MIDDLE EAST ====================

      ADGM: [
        { name: 'FSRA Annual Return', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'FSRA Audited Financial Statements', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'CRS Reporting (ADGM)', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'FATCA Reporting (ADGM)', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'AML Compliance Report', deadline: `${year}-03-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'ADGM Registration Office Annual Return', deadline: `${year}-01-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'ESG Disclosures (if applicable)', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      DIFC: [
        { name: 'DFSA Annual Return', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'DFSA Audited Financial Statements', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'DFSA Prudential Return (PIB)', deadline: `${year}-01-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'CRS Reporting (DIFC)', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'FATCA Reporting (DIFC)', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'UAE Corporate Tax Return', deadline: `${year}-12-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'AML Compliance Return', deadline: `${year}-03-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      // ==================== ASIA-PACIFIC ====================

      HONG_KONG: [
        { name: 'SFC Annual Return', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'SFC Audited Financial Statements', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'IRD Profits Tax Return', deadline: `${year}-11-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'CRS Reporting (Hong Kong)', deadline: `${year}-05-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'FATCA Reporting (Hong Kong)', deadline: `${year}-05-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Annual Return (Companies Registry)', deadline: `${year}-03-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'AML/CTF Annual Compliance Review', deadline: `${year}-03-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      SINGAPORE: [
        { name: 'MAS Annual Return (Form 1)', deadline: `${year}-03-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'MAS Survey on Fund Management Activities', deadline: `${year}-03-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'IRAS Corporate Tax Return (Form C)', deadline: `${year}-11-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'S13X/S13R Tax Exemption Declaration', deadline: `${year}-11-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'CRS Reporting (Singapore)', deadline: `${year}-05-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'FATCA Reporting (Singapore)', deadline: `${year}-05-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'ACRA Annual Return', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'AML/CFT Annual Compliance Report', deadline: `${year}-03-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      // ==================== EU MEMBER STATES (LOCAL REGULATORS) ====================

      IRELAND: [
        { name: 'CBI Annual Return (AIFMD)', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'CBI AIFMD Annex IV (Q1)', deadline: `${year}-04-30`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'CBI AIFMD Annex IV (Q2)', deadline: `${year}-07-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'CBI AIFMD Annex IV (Q3)', deadline: `${year}-10-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'CBI AIFMD Annex IV (Q4)', deadline: `${year + 1}-01-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Revenue Corporation Tax Return (CT1)', deadline: `${year}-09-23`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'CRO Annual Return', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'CRS Reporting (Ireland)', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'SFDR Periodic Disclosure', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      FRANCE: [
        { name: 'AMF Annual Report', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'AMF AIFMD Annex IV (Q1)', deadline: `${year}-04-30`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'AMF AIFMD Annex IV (Q2)', deadline: `${year}-07-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'AMF AIFMD Annex IV (Q3)', deadline: `${year}-10-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'AMF AIFMD Annex IV (Q4)', deadline: `${year + 1}-01-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Corporate Income Tax Return (Liasse Fiscale)', deadline: `${year}-05-15`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'PFU Withholding Declaration', deadline: `${year}-01-15`, frequency: 'Monthly', owner: null, status: 'NOT_STARTED' },
        { name: 'Greffe Annual Accounts Filing', deadline: `${year}-07-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'SFDR Periodic Disclosure', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      GERMANY: [
        { name: 'BaFin Annual Report (KAGB)', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'BaFin AIFMD Annex IV (Q1)', deadline: `${year}-04-30`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'BaFin AIFMD Annex IV (Q2)', deadline: `${year}-07-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'BaFin AIFMD Annex IV (Q3)', deadline: `${year}-10-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'BaFin AIFMD Annex IV (Q4)', deadline: `${year + 1}-01-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Corporate Tax Return (KSt)', deadline: `${year}-07-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'InvStG Investor Reporting', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Bundesanzeiger Annual Accounts', deadline: `${year}-12-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'SFDR Periodic Disclosure', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      NETHERLANDS: [
        { name: 'AFM Annual Return', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'AFM/DNB AIFMD Annex IV (Q1)', deadline: `${year}-04-30`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'AFM/DNB AIFMD Annex IV (Q2)', deadline: `${year}-07-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'AFM/DNB AIFMD Annex IV (Q3)', deadline: `${year}-10-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'AFM/DNB AIFMD Annex IV (Q4)', deadline: `${year + 1}-01-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Corporate Tax Return (VPB)', deadline: `${year}-06-01`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'KVK Annual Accounts Filing', deadline: `${year}-07-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'FBI Status Compliance Check', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'SFDR Periodic Disclosure', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      ITALY: [
        { name: 'CONSOB Annual Report', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Banca d\'Italia AIFMD Annex IV (Q1)', deadline: `${year}-04-30`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Banca d\'Italia AIFMD Annex IV (Q2)', deadline: `${year}-07-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Banca d\'Italia AIFMD Annex IV (Q3)', deadline: `${year}-10-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Banca d\'Italia AIFMD Annex IV (Q4)', deadline: `${year + 1}-01-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'IRES Corporate Tax Return', deadline: `${year}-11-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'IRAP Regional Tax Return', deadline: `${year}-11-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Camera di Commercio Annual Filing', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'SFDR Periodic Disclosure', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      SPAIN: [
        { name: 'CNMV Annual Report', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'CNMV AIFMD Annex IV (Q1)', deadline: `${year}-04-30`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'CNMV AIFMD Annex IV (Q2)', deadline: `${year}-07-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'CNMV AIFMD Annex IV (Q3)', deadline: `${year}-10-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'CNMV AIFMD Annex IV (Q4)', deadline: `${year + 1}-01-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Impuesto de Sociedades (Corporate Tax)', deadline: `${year}-07-25`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'ECR Regime Compliance Report', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Registro Mercantil Annual Accounts', deadline: `${year}-07-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'SFDR Periodic Disclosure', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      // ==================== NORDICS ====================

      DENMARK: [
        { name: 'DFSA Annual Return', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'DFSA AIFMD Annex IV (Q1)', deadline: `${year}-04-30`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'DFSA AIFMD Annex IV (Q2)', deadline: `${year}-07-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'DFSA AIFMD Annex IV (Q3)', deadline: `${year}-10-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'DFSA AIFMD Annex IV (Q4)', deadline: `${year + 1}-01-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Corporate Tax Return (Selskabsskat)', deadline: `${year}-07-01`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'PAL Tax Return (Pension Funds)', deadline: `${year}-05-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Erhvervsstyrelsen Annual Report', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'SFDR Periodic Disclosure', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      SWEDEN: [
        { name: 'FI Annual Return', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'FI AIFMD Annex IV (Q1)', deadline: `${year}-04-30`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'FI AIFMD Annex IV (Q2)', deadline: `${year}-07-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'FI AIFMD Annex IV (Q3)', deadline: `${year}-10-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'FI AIFMD Annex IV (Q4)', deadline: `${year + 1}-01-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Corporate Tax Return (Inkomstdeklaration)', deadline: `${year}-07-01`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Bolagsverket Annual Report', deadline: `${year}-07-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'SFDR Periodic Disclosure', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      NORWAY: [
        { name: 'Finanstilsynet Annual Return', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Finanstilsynet AIFMD Annex IV (Q1)', deadline: `${year}-04-30`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Finanstilsynet AIFMD Annex IV (Q2)', deadline: `${year}-07-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Finanstilsynet AIFMD Annex IV (Q3)', deadline: `${year}-10-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Finanstilsynet AIFMD Annex IV (Q4)', deadline: `${year + 1}-01-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Corporate Tax Return (Skattemelding)', deadline: `${year}-05-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Wealth Tax Declaration', deadline: `${year}-05-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Brønnøysund Annual Accounts', deadline: `${year}-07-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'SFDR Periodic Disclosure', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      FINLAND: [
        { name: 'FIN-FSA Annual Return', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'FIN-FSA AIFMD Annex IV (Q1)', deadline: `${year}-04-30`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'FIN-FSA AIFMD Annex IV (Q2)', deadline: `${year}-07-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'FIN-FSA AIFMD Annex IV (Q3)', deadline: `${year}-10-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'FIN-FSA AIFMD Annex IV (Q4)', deadline: `${year + 1}-01-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Corporate Tax Return (Yhteisövero)', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'PRH Annual Accounts Filing', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'SFDR Periodic Disclosure', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      // ==================== BALTICS ====================

      ESTONIA: [
        { name: 'EFSA Annual Return', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'EFSA AIFMD Annex IV (Q1)', deadline: `${year}-04-30`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'EFSA AIFMD Annex IV (Q2)', deadline: `${year}-07-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'EFSA AIFMD Annex IV (Q3)', deadline: `${year}-10-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'EFSA AIFMD Annex IV (Q4)', deadline: `${year + 1}-01-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Corporate Tax Return (distribution-based)', deadline: `${year}-07-10`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'CIT on Distributions Declaration', deadline: `${year}-07-10`, frequency: 'As-needed', owner: null, status: 'NOT_STARTED' },
        { name: 'Centre of Registers Annual Report', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'SFDR Periodic Disclosure', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      LITHUANIA: [
        { name: 'LB Annual Return', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'LB AIFMD Annex IV (Q1)', deadline: `${year}-04-30`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'LB AIFMD Annex IV (Q2)', deadline: `${year}-07-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'LB AIFMD Annex IV (Q3)', deadline: `${year}-10-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'LB AIFMD Annex IV (Q4)', deadline: `${year + 1}-01-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'Corporate Tax Return (GPM)', deadline: `${year}-06-15`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Registrų Centras Annual Accounts', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'SFDR Periodic Disclosure', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ],

      // ==================== SWITZERLAND ====================

      SWITZERLAND: [
        { name: 'FINMA Annual Report', deadline: `${year}-04-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'FINMA Audited Financial Statements', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Federal Tax Return (DBSt)', deadline: `${year}-09-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Cantonal/Communal Tax Return', deadline: `${year}-09-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Withholding Tax Return (Verrechnungssteuer)', deadline: `${year}-03-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Stamp Duty Declaration (Stempelabgabe)', deadline: `${year}-03-31`, frequency: 'Quarterly', owner: null, status: 'NOT_STARTED' },
        { name: 'CRS Reporting (Switzerland)', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'FATCA Reporting (Switzerland)', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'Commercial Register Annual Filing', deadline: `${year}-06-30`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' },
        { name: 'AMAS Self-Regulation Compliance', deadline: `${year}-03-31`, frequency: 'Annual', owner: null, status: 'NOT_STARTED' }
      ]
    };

    return (filings[jurisdiction] || []).map(f => ({
      ...f,
      jurisdiction,
      year
    }));
  }

  _getQuarter(dateStr) {
    return Math.ceil((new Date(dateStr).getMonth() + 1) / 3);
  }
}

module.exports = new ComplianceCalendarService();
