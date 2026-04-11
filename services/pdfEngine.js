/**
 * PDF Report Engine
 * Generate institutional-quality branded PDFs for all report types.
 * Uses Puppeteer for HTML-to-PDF conversion.
 * Templates loaded from /templates/*.hbs (Handlebars).
 */

const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

class PdfEngineService {

  constructor() {
    this._registerHelpers();
    this._templateCache = {};
  }

  /**
   * Generate PDF from data and template type
   */
  async generatePdf({ reportType, data, branding }) {
    const html = this._renderHtml(reportType, data, branding);

    // Dynamic import for puppeteer (heavy dependency)
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '60px', right: '40px', bottom: '60px', left: '40px' },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: this._headerTemplate(branding),
      footerTemplate: this._footerTemplate(branding)
    });

    await browser.close();

    return {
      reportType,
      fileName: `${reportType}_${data.fundName || 'report'}_${new Date().toISOString().split('T')[0]}.pdf`,
      sizeBytes: pdf.length,
      generatedAt: new Date().toISOString(),
      buffer: pdf
    };
  }

  /**
   * Generate HTML preview (useful for review before PDF)
   */
  generateHtmlPreview({ reportType, data, branding }) {
    return this._renderHtml(reportType, data, branding);
  }

  /**
   * Available report templates
   */
  getAvailableTemplates() {
    return [
      { id: 'quarterly_letter',     name: 'Quarterly LP Letter',        description: 'Investor quarterly communication with metrics, portfolio summary, market commentary', pages: '4-8' },
      { id: 'capital_call',         name: 'Capital Call Notice',         description: 'ILPA-standard capital call with breakdown, investor allocation, wire instructions', pages: '2-3' },
      { id: 'distribution_notice',  name: 'Distribution Notice',        description: 'ILPA-standard distribution with waterfall detail, withholding tax, source analysis', pages: '2-4' },
      { id: 'capital_account',      name: 'Capital Account Statement',  description: 'LP-specific capital account with activity, performance, transaction detail', pages: '2-3' },
      { id: 'financial_statements', name: 'Financial Statements',       description: 'Full GAAP/IFRS fund financials: balance sheet, income statement, partners capital, notes', pages: '8-15' },
      { id: 'board_book',           name: 'Board Book',                 description: 'Quarterly board materials: performance, portfolio, deployment, risk, compliance, financials', pages: '15-25' },
      { id: 'lpac_package',         name: 'LPAC Package',               description: 'Advisory committee materials: conflicts, valuations, compliance, voting items', pages: '10-20' },
      { id: 'valuation_report',     name: 'Valuation Report',           description: 'Portfolio valuation: ASC 820 hierarchy, company detail, methodology, IPEV-compliant', pages: '8-15' },
      { id: 'esg_report',           name: 'ESG Report',                 description: 'ESG/impact annual report: SFDR, carbon footprint, DEI, scorecard, engagement', pages: '10-20' },
      { id: 'k1_cover',             name: 'K-1 Cover Letter',           description: 'Tax document cover letter with K-1 highlights, capital account, filing deadlines', pages: '2-3' }
    ];
  }

  // --- Private ---

  _renderHtml(reportType, data, branding) {
    const template = this._getTemplate(reportType);
    const compiled = handlebars.compile(template);
    return compiled({ ...data, branding: branding || this._defaultBranding() });
  }

  /**
   * Load template from /templates/*.hbs file, with in-memory cache
   */
  _getTemplate(reportType) {
    // Return from cache if available
    if (this._templateCache[reportType]) {
      return this._templateCache[reportType];
    }

    // Try loading from .hbs file
    const filePath = path.join(TEMPLATES_DIR, `${reportType}.hbs`);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      this._templateCache[reportType] = content;
      return content;
    } catch (err) {
      // Fallback: if no .hbs file exists, return a minimal template
      console.warn(`Template file not found: ${filePath}, using fallback`);
      return this._fallbackTemplate(reportType);
    }
  }

  /**
   * Minimal fallback template for any report type missing a .hbs file
   */
  _fallbackTemplate(reportType) {
    return `<!DOCTYPE html><html><head><style>
      body { font-family: 'Helvetica Neue', sans-serif; color: #1a1a2e; padding: 40px; font-size: 12px; }
      .header { border-bottom: 2px solid {{branding.primaryColor}}; padding-bottom: 15px; margin-bottom: 25px; }
      .fund-name { font-size: 22px; font-weight: bold; color: {{branding.primaryColor}}; }
      .report-type { font-size: 14px; color: #666; margin-top: 5px; }
      .content { white-space: pre-wrap; line-height: 1.7; }
      table { width: 100%; border-collapse: collapse; margin: 15px 0; }
      th { background: {{branding.primaryColor}}; color: white; padding: 8px; text-align: left; font-size: 11px; }
      td { padding: 8px; border-bottom: 1px solid #eee; font-size: 11px; }
    </style></head><body>
      <div class="header">
        <div class="fund-name">{{fundName}}</div>
        <div class="report-type">${reportType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
      </div>
      <div class="content">{{{content}}}</div>
    </body></html>`;
  }

  /**
   * Clear template cache (useful after template updates)
   */
  clearCache() {
    this._templateCache = {};
  }

  /**
   * Reload a specific template from disk
   */
  reloadTemplate(reportType) {
    delete this._templateCache[reportType];
    return this._getTemplate(reportType);
  }

  _headerTemplate(branding) {
    const b = branding || this._defaultBranding();
    return `<div style="font-size: 8px; color: #999; padding: 10px 40px; width: 100%; text-align: right;">${b.firmName}</div>`;
  }

  _footerTemplate(branding) {
    return `<div style="font-size: 8px; color: #999; padding: 10px 40px; width: 100%; display: flex; justify-content: space-between;">
      <span>CONFIDENTIAL</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`;
  }

  _defaultBranding() {
    return {
      firmName: 'Antoninus Global SPC',
      primaryColor: '#1a365d',
      secondaryColor: '#c9a84c',
      logoUrl: null
    };
  }

  _registerHelpers() {
    handlebars.registerHelper('formatCurrency', (value) =>
      typeof value === 'number' ? '$' + value.toLocaleString('en-US', { minimumFractionDigits: 0 }) : value || ''
    );
    handlebars.registerHelper('formatPct', (value) =>
      typeof value === 'number' ? value.toFixed(2) + '%' : value || ''
    );
    handlebars.registerHelper('formatNumber', (value) =>
      typeof value === 'number' ? value.toLocaleString('en-US', { minimumFractionDigits: 0 }) : value || '—'
    );
    handlebars.registerHelper('ifEquals', function(a, b, options) {
      return a === b ? options.fn(this) : options.inverse(this);
    });
  }
}

module.exports = new PdfEngineService();
